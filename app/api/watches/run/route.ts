import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { watches } from "@/db/schema";
import { removeExpiredWatches, sendPendingAlerts } from "@/lib/alerts";
import { checkWatchGroups, groupByCourse, latestCheck } from "@/lib/seat-check";
import { trackCourseSeats } from "@/lib/history-db";
import { DEFAULT_TERM } from "@/lib/umd";
import { countError } from "@/lib/error-counts";
import { errorHour } from "@/lib/error-kinds";
import { asc, isNull, lt, or } from "drizzle-orm";
import { MAX_CLEANUP_ROWS_PER_RUN, MAX_COURSES_PER_RUN, MAX_WATCH_ROWS_PER_RUN, RUN_WORK_BUDGET_MS, reserveBackgroundRun, releaseBackgroundRun } from "@/lib/background-budget";

// Background seat check for every student's watches, called by an external scheduler
// (Cloudflare Cron) with `Authorization: Bearer <WATCH_RUNNER_SECRET>`.
// Watches are merged by term + course so each course is read from the source once per run.

// Skip courses checked this recently (by a page or a previous run) to stay gentle on the source.
const RECHECK_AFTER_MS = 90_000;
// No new seat requests are started after this long, so emails still go out in the same run.
const CHECK_BUDGET_MS = 40_000;

// Notes the run for /admin ("last run x minutes ago"), keeping a week of runs. A failure here never fails the run.
async function recordRun(startedAt: number, ok: boolean, counts: { checkedCourses?: number; trackedCourses?: number; emailsSent?: number; failedCourses?: number; emailsFailed?: number; deferred?: number; emailsDeferred?: number } = {}) {
  try {
    await env.DB!.batch([
      env.DB!.prepare("INSERT OR REPLACE INTO background_runs (started_at, duration_ms, ok, checked_courses, tracked_courses, emails_sent, failed_courses, emails_failed, deferred, emails_deferred) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(new Date(startedAt).toISOString(), Date.now() - startedAt, ok ? 1 : 0, counts.checkedCourses ?? 0, counts.trackedCourses ?? 0, counts.emailsSent ?? 0, counts.failedCourses ?? 0, counts.emailsFailed ?? 0, counts.deferred ?? 0, counts.emailsDeferred ?? 0),
      env.DB!.prepare("DELETE FROM background_runs WHERE started_at < ?").bind(new Date(startedAt - 7 * 86_400_000).toISOString()),
    ]);
  } catch { /* the run's own work is done */ }
}

async function authorized(request: Request) {
  const secret = env.WATCH_RUNNER_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  // Compare digests so the check takes the same time however much of the secret matches.
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [given, expected] = await Promise.all([digest(header.slice(7)), digest(secret)]);
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= given[index] ^ expected[index];
  return difference === 0;
}

export async function POST(request: Request) {
  if (!env.WATCH_RUNNER_SECRET) return Response.json({ error: "Background seat checks are not configured." }, { status: 503 });
  if (!(await authorized(request))) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const skipped = (reason: string) => Response.json({ skipped: reason, checkedCourses: 0, failedCourses: 0, deferredToNextRun: 0, emailsSent: 0, emailsFailed: 0, durationMs: 0 });
  if (env.WATCH_RUNNER_ENABLED === "false") return skipped("disabled");

  const startedAt = Date.now();
  let lease: string | null;
  try { lease = await reserveBackgroundRun(startedAt); }
  catch { return Response.json({ error: "Background safety limits are unavailable." }, { status: 503 }); }
  if (!lease) return skipped("budget-or-lock");
  const db = getDb();
  try {
    const expiredWatches = await removeExpiredWatches(db);
    // Keep stale code and abuse-limit keys from accumulating or becoming a log of visits.
    const cutoff = Math.floor(Date.now() / 1000) - 86400;
    await env.DB!.prepare("DELETE FROM email_login_rate_limits WHERE rowid IN (SELECT rowid FROM email_login_rate_limits WHERE window_started_at < ? ORDER BY window_started_at LIMIT ?)").bind(cutoff, MAX_CLEANUP_ROWS_PER_RUN).run();
    await env.DB!.prepare("DELETE FROM email_login_codes WHERE rowid IN (SELECT rowid FROM email_login_codes WHERE expires_at < ? ORDER BY expires_at LIMIT ?)").bind(cutoff, MAX_CLEANUP_ROWS_PER_RUN).run();
    await env.DB!.prepare("DELETE FROM error_counts WHERE rowid IN (SELECT rowid FROM error_counts WHERE hour < ? ORDER BY hour LIMIT ?)").bind(errorHour(new Date(startedAt - 30 * 86_400_000)), MAX_CLEANUP_ROWS_PER_RUN).run();
    await env.DB!.prepare("DELETE FROM mail_outbox WHERE rowid IN (SELECT rowid FROM mail_outbox WHERE created_at < ? ORDER BY created_at LIMIT ?)").bind(startedAt - 86_400_000, MAX_CLEANUP_ROWS_PER_RUN).run();
    const rows = await db.select().from(watches)
      .where(or(isNull(watches.lastCheckedAt), lt(watches.lastCheckedAt, new Date(startedAt - RECHECK_AFTER_MS).toISOString())))
      .orderBy(asc(watches.lastCheckedAt)).limit(MAX_WATCH_ROWS_PER_RUN + 1);
    const moreWatches = rows.length > MAX_WATCH_ROWS_PER_RUN;
    rows.length = Math.min(rows.length, MAX_WATCH_ROWS_PER_RUN);
    const groups = groupByCourse(rows);
    const due = groups
      .filter((group) => startedAt - latestCheck(group) >= RECHECK_AFTER_MS)
      .sort((a, b) => latestCheck(a) - latestCheck(b));
    const batch = due.slice(0, MAX_COURSES_PER_RUN);

    let failedCourses = 0;
    let openedFromFull = 0;
    const results = await checkWatchGroups(db, batch, startedAt + CHECK_BUDGET_MS);
    for (const result of results) {
      if (!result.ok) failedCourses += 1;
      openedFromFull += result.openedFromFull.length;
    }
    // Openings found here or by an open page are both queued on the watch row, so none are missed.
    const email = await sendPendingAlerts(db, startedAt + RUN_WORK_BUDGET_MS);
    // With time to spare, record how full the courses students look at are, for "how fast it filled" later.
    let seatTracking: { tracked: number } | { tracked: 0; failed: true } = { tracked: 0 };
    if (Date.now() - startedAt < 20_000) {
      try { seatTracking = await trackCourseSeats(DEFAULT_TERM, new Date(), startedAt + RUN_WORK_BUDGET_MS); } catch { seatTracking = { tracked: 0, failed: true }; }
    }

    await countError("testudo", failedCourses);
    await countError("email", email.emailsFailed);
    await recordRun(startedAt, failedCourses === 0 && email.emailsFailed === 0, {
      checkedCourses: results.length, trackedCourses: seatTracking.tracked, emailsSent: email.emailsSent,
      failedCourses, emailsFailed: email.emailsFailed, deferred: due.length - results.length + (moreWatches ? 1 : 0), emailsDeferred: email.emailsDeferred,
    });
    // Counts only: no emails, user ids, or section details leave this endpoint.
    return Response.json({
      // Counts describe this bounded window; there is no whole-table counting scan.
      watches: rows.length,
      courses: groups.length,
      moreWatches,
      checkedCourses: results.length,
      skippedRecentlyChecked: groups.length - due.length,
      deferredToNextRun: due.length - results.length,
      failedCourses,
      openedFromFull,
      ...email,
      expiredWatches,
      trackedCourses: seatTracking.tracked,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("Background seat check failed", error instanceof Error ? error.name : "unknown");
    await countError("run");
    await recordRun(startedAt, false);
    return Response.json({ error: "Background seat check failed." }, { status: 503 });
  } finally {
    // If release fails, the persistent lease expires; the allowance is never refunded.
    try { await releaseBackgroundRun(lease); } catch { /* fail closed until lease expiry */ }
  }
}
