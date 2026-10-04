import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { watches } from "@/db/schema";
import { removeExpiredWatches, sendPendingAlerts } from "@/lib/alerts";
import { checkWatchGroup, groupByCourse, latestCheck } from "@/lib/seat-check";

// Background seat check for every student's watches, called by an external scheduler
// (GitHub Actions) with `Authorization: Bearer <WATCH_RUNNER_SECRET>`.
// Watches are merged by term + course so each course is read from the source once per run.

// Skip courses checked this recently (by a page or a previous run) to stay gentle on the source.
const RECHECK_AFTER_MS = 4 * 60_000;
// Cap one run so it finishes well inside the Worker time limit; the rest wait for the next run.
const MAX_COURSES_PER_RUN = 40;

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

  const startedAt = Date.now();
  const db = getDb();
  try {
    const expiredWatches = await removeExpiredWatches(db);
    // Keep stale code and abuse-limit keys from accumulating or becoming a log of visits.
    const cutoff = Math.floor(Date.now() / 1000) - 86400;
    await env.DB!.prepare("DELETE FROM email_login_rate_limits WHERE window_started_at < ?").bind(cutoff).run();
    await env.DB!.prepare("DELETE FROM email_login_codes WHERE expires_at < ?").bind(cutoff).run();
    const rows = await db.select().from(watches);
    const groups = groupByCourse(rows);
    const due = groups
      .filter((group) => startedAt - latestCheck(group) >= RECHECK_AFTER_MS)
      .sort((a, b) => latestCheck(a) - latestCheck(b));
    const batch = due.slice(0, MAX_COURSES_PER_RUN);

    let failedCourses = 0;
    let openedFromFull = 0;
    for (const group of batch) {
      const result = await checkWatchGroup(db, group);
      if (!result.ok) failedCourses += 1;
      openedFromFull += result.openedFromFull.length;
    }
    // Openings found here or by an open page are both queued on the watch row, so none are missed.
    const email = await sendPendingAlerts(db);

    // Counts only: no emails, user ids, or section details leave this endpoint.
    return Response.json({
      watches: rows.length,
      courses: groups.length,
      checkedCourses: batch.length,
      skippedRecentlyChecked: groups.length - due.length,
      deferredToNextRun: due.length - batch.length,
      failedCourses,
      openedFromFull,
      ...email,
      expiredWatches,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("Background seat check failed", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "Background seat check failed." }, { status: 503 });
  }
}
