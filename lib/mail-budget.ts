import { env } from "cloudflare:workers";

// Conservative attempt limits, shared by sign-in, seat alerts and feedback.
// Resend's Free allowance is shared across a team, including other applications.
export const MAX_MAIL_PER_DAY = 90;
export const MAX_MAIL_PER_MONTH = 2600;
export const LOGIN_MAIL_RESERVE = 20;
export const MAX_MAIL_ATTEMPTS = 3;
type MailKind = "login" | "alert" | "feedback";
export type MailPayload = { from: string; to: string[]; subject: string; text: string; html?: string; headers?: Record<string, string>; reply_to?: string };
export type MailResult = "accepted" | "failed" | "quota" | "exhausted" | "deferred";

export async function reserveMail(kind: MailKind, now = Date.now()) {
  if (!env.DB) throw new Error("Mail safety storage is unavailable.");
  const day = new Date(now).toISOString().slice(0, 10), month = day.slice(0, 7);
  const limit = kind === "login" ? MAX_MAIL_PER_DAY : MAX_MAIL_PER_DAY - LOGIN_MAIL_RESERVE;
  return Boolean(await env.DB.prepare(`UPDATE mail_budget SET
    day = ?, month = ?,
    day_requests = CASE WHEN day = ? THEN day_requests + 1 ELSE 1 END,
    month_requests = CASE WHEN month = ? THEN month_requests + 1 ELSE 1 END,
    accepted = CASE WHEN day = ? THEN accepted ELSE 0 END,
    failed = CASE WHEN day = ? THEN failed ELSE 0 END
    WHERE id = 1 AND enabled = 1
      AND (day <> ? OR day_requests < ?)
      AND (month <> ? OR month_requests < ?)
    RETURNING id`).bind(day, month, day, month, day, day, day, limit, month, MAX_MAIL_PER_MONTH).first());
}

// Persist the original payload so a timeout retry uses the same Resend idempotency
// key AND body. Failed attempts count toward the quota; no immediate retry occurs.
export async function sendBudgetedMail(kind: MailKind, payload: MailPayload, key: string): Promise<MailResult> {
  if (!env.DB || !env.RESEND_API_KEY) throw new Error("Mail is unavailable.");
  const now = Date.now();
  await env.DB.prepare("INSERT OR IGNORE INTO mail_outbox (id, payload, created_at) VALUES (?, ?, ?)")
    .bind(key, JSON.stringify(payload), now).run();
  const existing = await env.DB.prepare("SELECT accepted, attempts, last_attempt_at FROM mail_outbox WHERE id = ?")
    .bind(key).first<{ accepted: number; attempts: number; last_attempt_at: number | null }>();
  if (existing?.accepted) return "accepted";
  if (!existing || existing.attempts >= MAX_MAIL_ATTEMPTS) return "exhausted";
  if (existing.last_attempt_at !== null && now - existing.last_attempt_at < 90_000) return "deferred";
  if (!await reserveMail(kind, now)) return "quota";
  const reserved = await env.DB.prepare(`UPDATE mail_outbox SET attempts = attempts + 1, last_attempt_at = ?
    WHERE id = ? AND accepted = 0 AND attempts < ?
      AND (last_attempt_at IS NULL OR last_attempt_at <= ?) RETURNING payload`)
    .bind(now, key, MAX_MAIL_ATTEMPTS, now - 90_000).first<{ payload: string }>();
  if (!reserved) return "deferred";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": key },
    body: reserved.payload,
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const accepted = Boolean(response?.ok);
  const day = new Date(now).toISOString().slice(0, 10);
  await env.DB.batch([
    env.DB.prepare("UPDATE mail_outbox SET accepted = ? WHERE id = ?").bind(accepted ? 1 : 0, key),
    env.DB.prepare(`UPDATE mail_budget SET accepted = accepted + ?, failed = failed + ?,
      last_failure_at = CASE WHEN ? = 1 THEN ? ELSE last_failure_at END WHERE id = 1 AND day = ?`)
      .bind(accepted ? 1 : 0, accepted ? 0 : 1, accepted ? 0 : 1, now, day),
  ]);
  return accepted ? "accepted" : "failed";
}
