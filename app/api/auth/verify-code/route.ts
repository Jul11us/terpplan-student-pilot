import { env } from "cloudflare:workers";
import { createEmailSession, emailAuthConfigured, emailSessionCookie, hashCode, hashEmail } from "@/lib/auth";
import { readJsonObject, sameOriginMutation } from "@/lib/request-security";

export async function POST(request: Request) {
  const denied = sameOriginMutation(request);
  if (denied) return denied;
  if (!emailAuthConfigured() || !env.DB) {
    return Response.json({ error: "Email sign-in is not set up yet." }, { status: 503 });
  }
  const parsed = await readJsonObject(request);
  if (parsed.error) return parsed.error;
  const body = parsed.value;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
    return Response.json({ error: "Enter your email and six-digit code." }, { status: 400 });
  }
  try {
    const emailHash = await hashEmail(email);
    const now = Math.floor(Date.now() / 1000);
    const record = await env.DB.prepare(`
      UPDATE email_login_codes
      SET attempt_count = attempt_count + 1
      WHERE email_hash = ? AND expires_at > ? AND attempt_count < 5
      RETURNING code_hash, attempt_count
    `).bind(emailHash, now).first<{
      code_hash: string;
      attempt_count: number;
    }>();
    if (!record) {
      await env.DB.prepare("DELETE FROM email_login_codes WHERE email_hash = ? AND (expires_at <= ? OR attempt_count >= 5)").bind(emailHash, now).run();
      return Response.json({ error: "That code expired or is incorrect. Request a new code." }, { status: 401 });
    }

    const suppliedHash = await hashCode(emailHash, code);
    let difference = 0;
    for (let index = 0; index < record.code_hash.length; index += 1) {
      difference |= record.code_hash.charCodeAt(index) ^ (suppliedHash.charCodeAt(index) ?? 0);
    }
    if (difference !== 0) {
      if (record.attempt_count >= 5) {
        await env.DB.prepare("DELETE FROM email_login_codes WHERE email_hash = ? AND code_hash = ? AND attempt_count >= 5").bind(emailHash, record.code_hash).run();
      }
      return Response.json({ error: record.attempt_count >= 5 ? "Too many attempts. Request a new code." : "That code is incorrect." }, { status: 401 });
    }

    const consumed = await env.DB.prepare("DELETE FROM email_login_codes WHERE email_hash = ? AND code_hash = ? RETURNING email_hash").bind(emailHash, record.code_hash).first<{ email_hash: string }>();
    if (!consumed) return Response.json({ error: "That code expired or is incorrect. Request a new code." }, { status: 401 });
    const token = await createEmailSession(emailHash);
    return Response.json({ ok: true, authProvider: "email" }, { headers: { "Set-Cookie": emailSessionCookie(token) } });
  } catch (error) {
    console.error("Email sign-in verification failed", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "Email sign-in is temporarily unavailable." }, { status: 503 });
  }
}
