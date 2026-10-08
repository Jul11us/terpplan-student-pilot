import { env } from "cloudflare:workers";

// Atomic reservation: simultaneous requests cannot all pass a read-then-write check.
export async function allowRate(rateKey: string, limit: number, windowSeconds: number) {
  if (!env.DB) return false;
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - windowSeconds;
  const result = await env.DB.prepare(`
    INSERT INTO email_login_rate_limits (rate_key, window_started_at, request_count)
    VALUES (?, ?, 1)
    ON CONFLICT(rate_key) DO UPDATE SET
      window_started_at = CASE WHEN email_login_rate_limits.window_started_at <= ? THEN excluded.window_started_at ELSE email_login_rate_limits.window_started_at END,
      request_count = CASE WHEN email_login_rate_limits.window_started_at <= ? THEN 1 ELSE email_login_rate_limits.request_count + 1 END
    WHERE email_login_rate_limits.window_started_at <= ? OR email_login_rate_limits.request_count < ?
    RETURNING rate_key
  `).bind(rateKey, now, cutoff, cutoff, cutoff, limit).first<{ rate_key: string }>();
  return Boolean(result);
}

export async function clientRateKey(request: Request, scope: string) {
  // Cloudflare replaces this header at the trusted edge. Do not trust X-Forwarded-For.
  // Without an edge address (local development), use a shared bucket.
  const bytes = new TextEncoder().encode(request.headers.get("cf-connecting-ip") ?? "local");
  const digest = env.EMAIL_AUTH_SECRET
    ? await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", new TextEncoder().encode(env.EMAIL_AUTH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), bytes)
    : await crypto.subtle.digest("SHA-256", bytes);
  return `${scope}:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

// True the first time today (a rolling day) that this network address + browser kind asks for `scope`:
// used to count a person once a day however often a page reports them.
export async function onceToday(request: Request, scope: string) {
  const agent = new TextEncoder().encode(request.headers.get("user-agent") ?? "");
  const agentHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", agent)).slice(0, 8), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return allowRate(await clientRateKey(request, `${scope}:${agentHash}`), 1, 86_400);
}
