// Database operations for historical trends and analytics

import { getDb } from "@/db";
import { seatHistory, planActivity, courseOfferings, courseSeatHistory } from "@/db/schema";
import { and, eq, gte, desc, inArray, sql } from "drizzle-orm";
import { getTestudoSectionsBatch, parseCount, type UmdSection } from "@/lib/umd";
import type { SeatSnapshot, SeatTrend, OfferingHistory, PopularCourse } from "@/lib/seat-trends";
import { fetchTermOffering, summarizeSections, termEnd, termStatus, type TermOffering } from "@/lib/offering-backfill";
import {
  analyzeSeatTrend,
  detectOfferingPattern,
  seatProgress,
  formatTermName,
  calculateTrendDirection,
  calculateDemandIndex,
} from "@/lib/seat-trends";

const HISTORY_WINDOW_DAYS = 14;
const POPULAR_LIMIT = 20;

/**
 * Record a seat snapshot for historical tracking
 */
export async function recordSeatSnapshot(
  term: string,
  sectionId: string,
  courseId: string,
  seats: number,
  openSeats: number,
  waitlist: number,
) {
  const db = getDb();
  const checkedAt = new Date().toISOString();
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  // One real observation per half hour, even if a page is repeatedly refreshed.
  await db.run(sql`INSERT INTO seat_history (term, section_id, course_id, seats, open_seats, waitlist, checked_at)
    SELECT ${term}, ${sectionId}, ${courseId}, ${seats}, ${openSeats}, ${waitlist}, ${checkedAt}
    WHERE NOT EXISTS (SELECT 1 FROM seat_history WHERE term = ${term} AND section_id = ${sectionId} AND checked_at >= ${cutoff})`);
}

export async function recordCourseHistory(term: string, courseId: string, sections: UmdSection[]) {
  if (!sections.length) return;
  const capacities = sections.map((section) => parseCount(section.seats));
  if (capacities.every((count) => count !== null)) {
    const summary = summarizeSections(sections);
    await recordCourseOffering(courseId, term, summary.sectionCount, summary.totalSeats, summary.openSeats, summary.fullSections);
    if (termStatus(term) !== "past") await recordCourseSeatReading(term, courseId, summary);
  }
  for (const section of sections) {
    const seats = parseCount(section.seats), open = parseCount(section.open_seats);
    if (!section.section_id || seats === null || open === null) continue;
    await recordSeatSnapshot(term, section.section_id, courseId, seats, open, parseCount(section.waitlist) ?? 0);
  }
}

export async function syncPlanActivity(term: string, courseIds: string[], userHash: string, withdraw = false) {
  const db = getDb();
  if (withdraw) { await db.delete(planActivity).where(eq(planActivity.userHash, userHash)); return; }
  const now = new Date().toISOString();
  const remove = db.update(planActivity).set({ removedAt: now }).where(and(eq(planActivity.term, term), eq(planActivity.userHash, userHash), sql`${planActivity.removedAt} IS NULL`, courseIds.length ? sql`${planActivity.courseId} NOT IN (${sql.join(courseIds.map((id) => sql`${id}`), sql`, `)})` : undefined));
  if (!courseIds.length) { await remove; return; }
  const add = db.insert(planActivity).values(courseIds.map((courseId) => ({ term, courseId, userHash, addedAt: now, removedAt: null }))).onConflictDoUpdate({ target: [planActivity.term, planActivity.courseId, planActivity.userHash], set: { addedAt: sql`CASE WHEN ${planActivity.removedAt} IS NULL THEN ${planActivity.addedAt} ELSE excluded.added_at END`, removedAt: null } });
  await db.batch([remove, add]);
}

/**
 * Record course being added to a plan
 */
export async function recordPlanAdd(term: string, courseId: string, userHash: string) {
  const db = getDb();
  await db
    .insert(planActivity)
    .values({
      term,
      courseId,
      userHash,
      addedAt: new Date().toISOString(),
      removedAt: null,
    })
    .onConflictDoUpdate({
      target: [planActivity.term, planActivity.courseId, planActivity.userHash],
      set: {
        removedAt: null,
        addedAt: new Date().toISOString(),
      },
    });
}

/**
 * Record course being removed from a plan
 */
export async function recordPlanRemove(term: string, courseId: string, userHash: string) {
  const db = getDb();
  await db
    .update(planActivity)
    .set({ removedAt: new Date().toISOString() })
    .where(
      and(
        eq(planActivity.term, term),
        eq(planActivity.courseId, courseId),
        eq(planActivity.userHash, userHash),
      ),
    );
}

/**
 * Record or update course offering information
 */
export async function recordCourseOffering(
  courseId: string,
  term: string,
  sectionCount: number,
  totalSeats: number,
  openSeats: number | null = null,
  fullSections: number | null = null,
) {
  const db = getDb();
  const now = new Date().toISOString();
  await db
    .insert(courseOfferings)
    .values({
      courseId,
      term,
      sectionCount,
      totalSeats,
      openSeats,
      fullSections,
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [courseOfferings.courseId, courseOfferings.term],
      set: {
        sectionCount,
        totalSeats,
        openSeats,
        fullSections,
        lastSeenAt: now,
      },
    });
}

/**
 * Get seat history for a section
 */
export async function getSeatHistory(term: string, sectionId: string): Promise<SeatSnapshot[]> {
  const db = getDb();
  const cutoff = new Date(Date.now() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows = await db
    .select({
      openSeats: seatHistory.openSeats,
      totalSeats: seatHistory.seats,
      waitlist: seatHistory.waitlist,
      checkedAt: seatHistory.checkedAt,
    })
    .from(seatHistory)
    .where(and(eq(seatHistory.term, term), eq(seatHistory.sectionId, sectionId), gte(seatHistory.checkedAt, cutoff)))
    .orderBy(seatHistory.checkedAt);

  return rows.map((row) => ({
    openSeats: row.openSeats,
    totalSeats: row.totalSeats ?? 0,
    waitlist: row.waitlist,
    checkedAt: row.checkedAt,
  }));
}

/**
 * Get seat trends for multiple sections
 */
export async function getSeatTrends(term: string, sectionIds: string[]): Promise<Map<string, SeatTrend>> {
  if (!sectionIds.length) return new Map();
  const db = getDb();
  const cutoff = new Date(Date.now() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const rows = await db
    .select({
      sectionId: seatHistory.sectionId,
      courseId: seatHistory.courseId,
      openSeats: seatHistory.openSeats,
      totalSeats: seatHistory.seats,
      waitlist: seatHistory.waitlist,
      checkedAt: seatHistory.checkedAt,
    })
    .from(seatHistory)
    .where(and(eq(seatHistory.term, term), inArray(seatHistory.sectionId, sectionIds), gte(seatHistory.checkedAt, cutoff)))
    .orderBy(seatHistory.checkedAt);

  const bySectionId = new Map<string, SeatSnapshot[]>();
  const sectionToCourse = new Map<string, string>();

  for (const row of rows) {
    if (!sectionIds.includes(row.sectionId)) continue;
    const snapshots = bySectionId.get(row.sectionId) ?? [];
    snapshots.push({
      openSeats: row.openSeats,
      totalSeats: row.totalSeats ?? 0,
      waitlist: row.waitlist,
      checkedAt: row.checkedAt,
    });
    bySectionId.set(row.sectionId, snapshots);
    sectionToCourse.set(row.sectionId, row.courseId);
  }

  const trends = new Map<string, SeatTrend>();
  for (const [sectionId, snapshots] of bySectionId) {
    const courseId = sectionToCourse.get(sectionId);
    if (!courseId) continue;
    const trend = analyzeSeatTrend(sectionId, courseId, term, snapshots);
    if (trend) trends.set(sectionId, trend);
  }

  return trends;
}

const REFRESH_DAYS = 7;

// A stored earlier term is read again when its numbers may have changed: it was last read before the term
// ended and at least a week ago (so an in-progress term updates weekly, and once more after it ends to get
// the final seats), or it was stored before open seats were kept.
function needsRefresh(term: string, row: { sectionCount: number; openSeats: number | null; lastSeenAt: string }, now: Date) {
  if (row.sectionCount > 0 && row.openSeats === null) return true;
  const lastSeen = Date.parse(row.lastSeenAt.includes("T") ? row.lastSeenAt : row.lastSeenAt.replace(" ", "T") + "Z");
  if (!Number.isFinite(lastSeen)) return true;
  return lastSeen < termEnd(term).getTime() && now.getTime() - lastSeen > REFRESH_DAYS * 86_400_000;
}

// Reads the given earlier semesters from Testudo when the course has no row for them yet (or the row is
// stale, see needsRefresh), and stores them: the sections, seats and how many were still open, or 0
// sections when the course did not run that term (so "not offered" is known). A term Testudo could not
// answer is skipped and tried on a later request.
export async function backfillCourseOfferings(courseId: string, terms: string[], now = new Date()) {
  if (!terms.length) return;
  const db = getDb();
  const rows = await db.select({ term: courseOfferings.term, sectionCount: courseOfferings.sectionCount, openSeats: courseOfferings.openSeats, lastSeenAt: courseOfferings.lastSeenAt })
    .from(courseOfferings).where(and(eq(courseOfferings.courseId, courseId), inArray(courseOfferings.term, terms)));
  const stored = new Map(rows.map((row) => [row.term, row]));
  const due = terms.filter((term) => { const row = stored.get(term); return !row || needsRefresh(term, row, now); });
  if (!due.length) return;
  const results = await Promise.all(due.map(async (term) => [term, await fetchTermOffering(courseId, term)] as const));
  for (const [term, result] of results) {
    if (result === null) continue;
    const offering = result === "none" ? { sectionCount: 0, totalSeats: 0, openSeats: null, fullSections: null } : result;
    await recordCourseOffering(courseId, term, offering.sectionCount, offering.totalSeats, offering.openSeats, offering.fullSections);
  }
}

// ---- Seats over time during registration (course_seat_history)

const READING_HOURS = 2;
const TRACK_PER_RUN = 50;

// One reading of a course's seats, at most every two hours per course (later calls in that time do nothing).
export async function recordCourseSeatReading(term: string, courseId: string, summary: TermOffering, now = new Date()) {
  if (!summary.sectionCount || summary.openSeats === null || summary.fullSections === null) return;
  const checkedAt = now.toISOString();
  const cutoff = new Date(now.getTime() - READING_HOURS * 3_600_000).toISOString();
  await getDb().run(sql`INSERT INTO course_seat_history (term, course_id, checked_at, section_count, total_seats, open_seats, full_sections)
    SELECT ${term}, ${courseId}, ${checkedAt}, ${summary.sectionCount}, ${summary.totalSeats}, ${summary.openSeats}, ${summary.fullSections}
    WHERE NOT EXISTS (SELECT 1 FROM course_seat_history WHERE term = ${term} AND course_id = ${courseId} AND checked_at >= ${cutoff})`);
}

// Courses worth following in a term: ones opened on TerpPlan, watched, or in shared plans; those read
// longest ago (or never) first, skipping any read in the last two hours.
export async function coursesToTrack(term: string, limit = TRACK_PER_RUN, now = new Date()) {
  const cutoff = new Date(now.getTime() - READING_HOURS * 3_600_000).toISOString();
  const rows = await getDb().all<{ course_id: string }>(sql`SELECT c.course_id FROM (
      SELECT course_id FROM course_offerings WHERE term = ${term} AND section_count > 0
      UNION SELECT course_id FROM watches WHERE term = ${term}
      UNION SELECT course_id FROM plan_activity WHERE term = ${term} AND removed_at IS NULL
    ) c LEFT JOIN (SELECT course_id, MAX(checked_at) AS last FROM course_seat_history WHERE term = ${term} GROUP BY course_id) h ON h.course_id = c.course_id
    WHERE h.last IS NULL OR h.last < ${cutoff}
    ORDER BY h.last IS NOT NULL, h.last, c.course_id LIMIT ${limit}`);
  return rows.map((row) => row.course_id);
}

// The background run's share: read up to 50 due courses from Testudo (25 per request) and record them.
export async function trackCourseSeats(term: string, now = new Date()) {
  const ids = await coursesToTrack(term, TRACK_PER_RUN, now);
  if (!ids.length) return { tracked: 0 };
  const sections = await getTestudoSectionsBatch(term, ids);
  let tracked = 0;
  for (const id of ids) {
    const list = sections.get(id) ?? [];
    if (!list.length) continue;
    const summary = summarizeSections(list);
    await recordCourseOffering(id, term, summary.sectionCount, summary.totalSeats, summary.openSeats, summary.fullSections);
    await recordCourseSeatReading(term, id, summary, now);
    tracked += 1;
  }
  return { tracked };
}

/**
 * Get offering history for a course
 */
export async function getCourseOfferingHistory(courseId: string, lang: "en" | "zh"): Promise<OfferingHistory | null> {
  const db = getDb();
  const rows = await db
    .select({
      term: courseOfferings.term,
      sectionCount: courseOfferings.sectionCount,
      totalSeats: courseOfferings.totalSeats,
      openSeats: courseOfferings.openSeats,
      fullSections: courseOfferings.fullSections,
    })
    .from(courseOfferings)
    .where(eq(courseOfferings.courseId, courseId))
    .orderBy(desc(courseOfferings.term));

  if (!rows.length) return null;

  const readings = await db.select().from(courseSeatHistory).where(eq(courseSeatHistory.courseId, courseId)).orderBy(courseSeatHistory.checkedAt);
  const terms = rows.map((row) => ({
    term: row.term,
    termName: formatTermName(row.term, lang),
    sectionCount: row.sectionCount,
    totalSeats: row.totalSeats,
    openSeats: row.openSeats,
    fullSections: row.fullSections,
    status: termStatus(row.term),
    progress: seatProgress(readings.filter((reading) => reading.term === row.term)),
  }));

  // Terms stored with 0 sections were checked and the course did not run; the pattern is from the terms it ran.
  const pattern = detectOfferingPattern(rows.filter((row) => row.sectionCount > 0).map((row) => row.term));

  return { courseId, terms, pattern };
}

/**
 * Get popular courses for a term
 */
export async function getPopularCourses(term: string, limit = POPULAR_LIMIT): Promise<PopularCourse[]> {
  const db = getDb();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Get current active plan counts
  const currentCounts = await db
    .select({
      courseId: planActivity.courseId,
      planCount: sql<number>`count(distinct ${planActivity.userHash})`,
      activeCount: sql<number>`count(distinct case when ${planActivity.removedAt} is null then ${planActivity.userHash} end)`,
    })
    .from(planActivity)
    .where(and(eq(planActivity.term, term), sql`(${planActivity.addedAt} >= ${twoWeeksAgo} OR ${planActivity.removedAt} IS NULL)`))
    .groupBy(planActivity.courseId)
    .having(sql`count(distinct case when ${planActivity.removedAt} is null then ${planActivity.userHash} end) > 0`)
    .orderBy(desc(sql`count(distinct case when ${planActivity.removedAt} is null then ${planActivity.userHash} end)`))
    .limit(limit);

  // Get previous week counts for trend
  const previousCounts = await db
    .select({
      courseId: planActivity.courseId,
      count: sql<number>`count(distinct ${planActivity.userHash})`,
    })
    .from(planActivity)
    .where(
      and(
        eq(planActivity.term, term),
        sql`${planActivity.addedAt} <= ${weekAgo}`,
        sql`(${planActivity.removedAt} IS NULL OR ${planActivity.removedAt} >= ${weekAgo})`,
      ),
    )
    .groupBy(planActivity.courseId);

  const previousMap = new Map(previousCounts.map((row) => [row.courseId, row.count]));
  const maximum = Math.max(1, ...currentCounts.map((row) => row.activeCount));

  return currentCounts.map((row) => {
    const previousCount = previousMap.get(row.courseId) ?? 0;
    const trendDirection = calculateTrendDirection(row.activeCount, previousCount);
    const demandIndex = Math.round(100 * row.activeCount / maximum);

    return {
      courseId: row.courseId,
      courseTitle: "", // Will be filled by API
      term,
      planCount: row.planCount,
      activeCount: row.activeCount,
      demandIndex,
      trendDirection,
    };
  });
}

/**
 * Get demand index for a single course
 */
export async function getCourseDemandIndex(term: string, courseId: string): Promise<number> {
  const db = getDb();
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const result = await db
    .select({
      planCount: sql<number>`count(distinct ${planActivity.userHash})`,
      activeCount: sql<number>`count(distinct case when ${planActivity.removedAt} is null then ${planActivity.userHash} end)`,
    })
    .from(planActivity)
    .where(and(eq(planActivity.term, term), eq(planActivity.courseId, courseId), gte(planActivity.addedAt, twoWeeksAgo)))
    .limit(1);

  const row = result[0];
  if (!row || row.planCount === 0) return 0;
  return calculateDemandIndex(row.activeCount / row.planCount, 0, 0, 100);
}
