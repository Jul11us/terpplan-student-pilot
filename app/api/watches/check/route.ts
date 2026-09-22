import { and, eq } from "drizzle-orm";
import { currentUserId, authRequired } from "@/lib/auth";
import { getDb } from "@/db";
import { watches } from "@/db/schema";
import { DEFAULT_TERM, parseCount, sectionId, umdJson, type UmdSection } from "@/lib/umd";

const MIN_INTERVAL_MS = 60_000;

export async function POST(request: Request) {
  const userId = currentUserId(request);
  if (!userId) return authRequired();
  const db = getDb();
  try {
    const rows = await db.select().from(watches).where(eq(watches.userId, userId));
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.courseId}|${row.term}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    const alerts: { sectionId: string; courseId: string; openSeats: number }[] = [];
    const now = Date.now();
    for (const group of groups.values()) {
      const sample = group[0];
      if (!sample) continue;
      const latestAttempt = Math.max(...group.map((item) => item.lastCheckedAt ? Date.parse(item.lastCheckedAt) : 0));
      if (latestAttempt && now - latestAttempt < MIN_INTERVAL_MS) continue;
      try {
        const sectionData = await umdJson<UmdSection[]>(`/courses/${encodeURIComponent(sample.courseId)}/sections?semester=${encodeURIComponent(sample.term || DEFAULT_TERM)}`);
        const checkedAt = new Date().toISOString();
        for (const row of group) {
          const found = Array.isArray(sectionData) ? sectionData.find((item) => sectionId(item, row.courseId) === row.sectionId) : undefined;
          const openSeats = parseCount(found?.open_seats);
          const seats = parseCount(found?.seats);
          const waitlist = parseCount(found?.waitlist);
          if (!found || openSeats === null) {
            await db.update(watches).set({ status: found ? "unknown" : "failed", lastCheckedAt: checkedAt }).where(and(eq(watches.userId, userId), eq(watches.term, row.term), eq(watches.sectionId, row.sectionId)));
            continue;
          }
          const newOpening = openSeats > 0 && (row.lastSuccessAt === null || (row.openSeats ?? 0) < openSeats) && row.lastNotifiedOpen !== openSeats;
          if (newOpening) alerts.push({ sectionId: row.sectionId, courseId: row.courseId, openSeats });
          await db.update(watches).set({
            seats,
            openSeats,
            waitlist,
            status: "ok",
            lastCheckedAt: checkedAt,
            lastSuccessAt: checkedAt,
            lastNotifiedOpen: openSeats > 0 ? (newOpening ? openSeats : row.lastNotifiedOpen) : null,
          }).where(and(eq(watches.userId, userId), eq(watches.term, row.term), eq(watches.sectionId, row.sectionId)));
        }
      } catch (error) {
        console.error("Seat check failed", sample.courseId, error);
        const checkedAt = new Date().toISOString();
        for (const row of group) {
          await db.update(watches).set({ status: row.lastSuccessAt ? "stale" : "failed", lastCheckedAt: checkedAt }).where(and(eq(watches.userId, userId), eq(watches.term, row.term), eq(watches.sectionId, row.sectionId)));
        }
      }
    }
    const updated = await db.select().from(watches).where(eq(watches.userId, userId));
    return Response.json({ watches: updated.map((row) => ({ ...row, meetings: JSON.parse(row.meetings), instructors: JSON.parse(row.instructors) })), alerts, checkedAt: new Date().toISOString(), minIntervalSeconds: 60 });
  } catch (error) {
    console.error("Seat monitoring failed", error);
    return Response.json({ error: "Seat monitoring is temporarily unavailable." }, { status: 503 });
  }
}
