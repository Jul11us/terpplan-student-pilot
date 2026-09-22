import { env } from "cloudflare:workers";
import { emailAuthConfigured, hashCode, hashEmail, newEmailCode } from "@/lib/auth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function allowRate(rateKey: string, limit: number, windowSeconds: number) {
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

export async function POST(request: Request) {
  if (!emailAuthConfigured() || !env.DB) {
    return Response.json({ error: "Email sign-in is not set up yet." }, { status: 503 });
  }
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const emailHash = await hashEmail(email);
    const forwardedIp = request.headers.get("cf-connecting-ip")?.trim();
    const ipHash = forwardedIp ? await hashEmail(`ip:${forwardedIp}`) : emailHash;
    if (!await allowRate(`ip:${ipHash}`, 10, 3600) || !await allowRate(`email:${emailHash}`, 4, 3600)) {
      return Response.json({ error: "Too many codes requested. Please try again later." }, { status: 429 });
    }

    const now = Math.floor(Date.now() / 1000);
    const code = newEmailCode();
    const codeHash = await hashCode(emailHash, code);
    const reserved = await env.DB.prepare(`
      INSERT INTO email_login_codes (email_hash, code_hash, expires_at, attempt_count, sent_at)
      VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(email_hash) DO UPDATE SET
        code_hash = excluded.code_hash,
        expires_at = excluded.expires_at,
        attempt_count = 0,
        sent_at = excluded.sent_at
      WHERE email_login_codes.sent_at <= ?
      RETURNING email_hash
    `).bind(emailHash, codeHash, now + 600, now, now - 60).first<{ email_hash: string }>();
    if (!reserved) return Response.json({ error: "Please wait a minute before requesting another code." }, { status: 429 });

    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [email],
        subject: "Your TerpPlan sign-in code",
        text: `Your TerpPlan sign-in code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`,
        html: `<p>Your TerpPlan sign-in code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. If you did not request it, you can ignore this email.</p>`,
      }),
    });
    if (!sent.ok) {
      await env.DB.prepare("DELETE FROM email_login_codes WHERE email_hash = ?").bind(emailHash).run();
      console.error("Email provider rejected a sign-in message", sent.status);
      return Response.json({ error: "The sign-in email could not be sent. Please try again shortly." }, { status: 502 });
    }
    return Response.json({ ok: true, expiresInSeconds: 600 });
  } catch (error) {
    console.error("Email sign-in code request failed", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "Email sign-in is temporarily unavailable." }, { status: 503 });
  }
}
