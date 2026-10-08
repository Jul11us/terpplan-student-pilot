import { env } from "cloudflare:workers";

// Persisted in D1, shared across isolates and manual/scheduled invocations.
export const MAX_RUNS_PER_DAY = 720;
export const MIN_RUN_INTERVAL_MS = 90_000; // Allow Cron delivery jitter around two minutes.
const LEASE_MS = 5 * 60_000;
export const MAX_WATCH_ROWS_PER_RUN = 200;
export const MAX_COURSES_PER_RUN = 100;
export const MAX_PENDING_ALERTS_PER_RUN = 200;
export const MAX_EMAILS_PER_RUN = 20;
export const MAX_CLEANUP_ROWS_PER_RUN = 500;
export const RUN_WORK_BUDGET_MS = 60_000;

// One conditional write reserves both the daily allowance and the lease. Failed
// runs consume their allowance too; errors never cause an immediate retry.
export async function reserveBackgroundRun(now = Date.now()) {
  if (!env.DB) throw new Error("Background budget storage is unavailable.");
  const token = crypto.randomUUID();
  const day = new Date(now).toISOString().slice(0, 10);
  const row = await env.DB.prepare(`UPDATE background_budget SET
    day = ?, runs = CASE WHEN day = ? THEN runs + 1 ELSE 1 END,
    last_started_at = ?, lease_until = ?, lease_token = ?
    WHERE id = 1 AND enabled = 1 AND lease_until <= ?
      AND (last_started_at IS NULL OR last_started_at <= ?)
      AND (day <> ? OR runs < ?)
    RETURNING lease_token`)
    .bind(day, day, now, now + LEASE_MS, token, now, now - MIN_RUN_INTERVAL_MS, day, MAX_RUNS_PER_DAY)
    .first<{ lease_token: string }>();
  return row ? token : null;
}

export async function releaseBackgroundRun(token: string) {
  // A crashed/expired invocation cannot clear a later invocation's lease.
  await env.DB!.prepare("UPDATE background_budget SET lease_until = 0, lease_token = NULL WHERE id = 1 AND lease_token = ?")
    .bind(token).run();
}
