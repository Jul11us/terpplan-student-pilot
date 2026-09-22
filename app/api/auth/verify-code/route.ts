import { env } from "cloudflare:workers";
import { createEmailSession, emailAuthConfigured, emailSessionCookie, hashCode, hashEmail } from "@/lib/auth";

export async function POST(request: Request) {
  if (!emailAuthConfigured() || !env.DB) {
    return Response.json({ error: "Email sign-in is not set up yet." }, { status: 503 });
  }
  let body: { email?: unknown; code?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Enter your email and six-digit code." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
    return Response.json({ error: "Enter your email and six-digit code." }, { status: 400 });
  }
  try {
    const emailHash = await hashEmail(email);
    const record = await env.DB.prepare("SELECT code_hash, expires_at, attempt_count FROM email_login_codes WHERE email_hash = ?").bind(emailHash).first<{
      code_hash: string;
      expires_at: number;
      attempt_count: number;
    }>();
    const now = Math.floor(Date.now() / 1000);
    if (!record || record.expires_at <= now || record.attempt_count >= 5) {
      await env.DB.prepare("DELETE FROM email_login_codes WHERE email_hash = ?").bind(emailHash).run();
      return Response.json({ error: "That code expired or is incorrect. Request a new code." }, { status: 401 });
    }

    const suppliedHash = await hashCode(emailHash, code);
    let difference = 0;
    for (let index = 0; index < record.code_hash.length; index += 1) {
      difference |= record.code_hash.charCodeAt(index) ^ (suppliedHash.charCodeAt(index) ?? 0);
    }
    if (difference !== 0) {
      const attempts = record.attempt_count + 1;
      if (attempts >= 5) await env.DB.prepare("DELETE FROM email_login_codes WHERE email_hash = ?").bind(emailHash).run();
      else await env.DB.prepare("UPDATE email_login_codes SET attempt_count = ? WHERE email_hash = ?").bind(attempts, emailHash).run();
      return Response.json({ error: attempts >= 5 ? "Too many attempts. Request a new code." : "That code is incorrect." }, { status: 401 });
    }

    await env.DB.prepare("DELETE FROM email_login_codes WHERE email_hash = ?").bind(emailHash).run();
    const token = await createEmailSession(emailHash);
    return Response.json({ ok: true, authProvider: "email" }, { headers: { "Set-Cookie": emailSessionCookie(token) } });
  } catch (error) {
    console.error("Email sign-in verification failed", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "Email sign-in is temporarily unavailable." }, { status: 503 });
  }
}
