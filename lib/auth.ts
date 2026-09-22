import { env } from "cloudflare:workers";

const SESSION_COOKIE = "terpplan_email_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

type SessionPayload = { v: 1; emailHash: string; expiresAt: number };
export type CurrentUser = { id: string; provider: "email" | "chatgpt" };

function toBase64Url(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export function emailAuthConfigured() {
  return Boolean(env.EMAIL_AUTH_SECRET && env.RESEND_API_KEY && env.EMAIL_FROM);
}

export async function hashEmail(email: string) {
  if (!env.EMAIL_AUTH_SECRET) throw new Error("Email authentication is not configured.");
  const key = await hmacKey(env.EMAIL_AUTH_SECRET);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`email:${email.trim().toLowerCase()}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashCode(emailHash: string, code: string) {
  if (!env.EMAIL_AUTH_SECRET) throw new Error("Email authentication is not configured.");
  const key = await hmacKey(env.EMAIL_AUTH_SECRET);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`code:${emailHash}:${code}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function newEmailCode() {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return String(bytes[0]! % 1_000_000).padStart(6, "0");
}

export async function createEmailSession(emailHash: string) {
  if (!env.EMAIL_AUTH_SECRET) throw new Error("Email authentication is not configured.");
  const payload: SessionPayload = { v: 1, emailHash, expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(env.EMAIL_AUTH_SECRET), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

async function emailSessionId(request: Request) {
  if (!env.EMAIL_AUTH_SECRET) return null;
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  const token = cookie?.slice(SESSION_COOKIE.length + 1);
  if (!token) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) return null;
  try {
    const key = await hmacKey(env.EMAIL_AUTH_SECRET);
    if (!await crypto.subtle.verify("HMAC", key, fromBase64Url(signature), encoder.encode(body))) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    if (payload.v !== 1 || !/^[a-f0-9]{64}$/.test(payload.emailHash) || payload.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return `email:${payload.emailHash}`;
  } catch {
    return null;
  }
}

export async function currentUser(request: Request): Promise<CurrentUser | null> {
  const emailId = await emailSessionId(request);
  if (emailId) return { id: emailId, provider: "email" };
  const chatgptId = request.headers.get("oai-authenticated-user-id")?.trim();
  if (chatgptId) return { id: chatgptId.slice(0, 200), provider: "chatgpt" };
  return null;
}

export function emailSessionCookie(token: string) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`;
}

export function clearEmailSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function authRequired() {
  return Response.json(
    { error: "Sign in with ChatGPT or an email verification code to save seat watches." },
    { status: 401 },
  );
}
