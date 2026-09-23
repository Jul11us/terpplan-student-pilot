import { and, eq } from "drizzle-orm";
import type { getDb } from "@/db";
import { watches } from "@/db/schema";
import { getCourseSectionsSnapshot, parseCount, sectionId } from "@/lib/umd";

type Db = ReturnType<typeof getDb>;
export type WatchRow = typeof watches.$inferSelect;

export type GroupCheckResult = {
  ok: boolean;
  // Rows whose open seats went from 0 to more than 0 in this check.
  openedFromFull: WatchRow[];
  // Rows that count as a new opening for the in-page alert (existing page behaviour).
  pageAlerts: { sectionId: string; courseId: string; openSeats: number }[];
};

function rowFilter(row: WatchRow) {
  return and(eq(watches.userId, row.userId), eq(watches.term, row.term), eq(watches.sectionId, row.sectionId));
}

// Reads the course once and updates every watch in the group (same term + course).
// Shared by the in-page check and the background runner so both apply identical rules.
export async function checkWatchGroup(db: Db, group: WatchRow[]): Promise<GroupCheckResult> {
  const sample = group[0];
  const result: GroupCheckResult = { ok: false, openedFromFull: [], pageAlerts: [] };
  if (!sample) return result;
  const checkedAt = new Date().toISOString();
  try {
    const snapshot = await getCourseSectionsSnapshot(sample.courseId, sample.term);
    const sectionData = Array.isArray(snapshot.sections) ? snapshot.sections : [];
    const updates = group.map((row) => {
      const found = sectionData.find((item) => sectionId(item, row.courseId) === row.sectionId);
      const openSeats = parseCount(found?.open_seats);
      if (!found || openSeats === null) {
        return db.update(watches).set({ status: found ? "unknown" : "failed", lastCheckedAt: checkedAt }).where(rowFilter(row));
      }
      // Alert rule: only a change from full (0) to open (> 0) queues an email, once per opening.
      // If the seats are gone again before the email goes out, the stale alert is dropped.
      const openedFromFull = row.openSeats === 0 && openSeats > 0;
      if (openedFromFull) result.openedFromFull.push(row);
      const alertPendingAt = openedFromFull ? checkedAt : openSeats === 0 ? null : row.alertPendingAt;
      const newOpening = openSeats > 0 && (row.lastSuccessAt === null || (row.openSeats ?? 0) < openSeats) && row.lastNotifiedOpen !== openSeats;
      if (newOpening) result.pageAlerts.push({ sectionId: row.sectionId, courseId: row.courseId, openSeats });
      return db.update(watches).set({
        seats: parseCount(found.seats),
        openSeats,
        waitlist: parseCount(found.waitlist),
        status: "ok",
        lastCheckedAt: checkedAt,
        lastSuccessAt: snapshot.seatCheckedAt ?? checkedAt,
        lastNotifiedOpen: openSeats > 0 ? (newOpening ? openSeats : row.lastNotifiedOpen) : null,
        alertPendingAt,
      }).where(rowFilter(row));
    });
    for (const update of updates) await update;
    result.ok = true;
  } catch (error) {
    console.error("Seat check failed", sample.courseId, error);
    for (const row of group) {
      await db.update(watches).set({ status: row.lastSuccessAt ? "stale" : "failed", lastCheckedAt: checkedAt }).where(rowFilter(row));
    }
  }
  return result;
}

export function groupByCourse(rows: WatchRow[]) {
  const groups = new Map<string, WatchRow[]>();
  for (const row of rows) {
    const key = `${row.term}|${row.courseId}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()];
}

export function latestCheck(group: WatchRow[]) {
  return Math.max(0, ...group.map((row) => row.lastCheckedAt ? Date.parse(row.lastCheckedAt) : 0));
}
