import { eq } from "drizzle-orm";
import { currentUser, authRequired } from "@/lib/auth";
import { getDb } from "@/db";
import { watches } from "@/db/schema";
import { checkWatchGroup, groupByCourse, latestCheck } from "@/lib/seat-check";

const MIN_INTERVAL_MS = 60_000;

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return authRequired();
  const db = getDb();
  try {
    const rows = await db.select().from(watches).where(eq(watches.userId, user.id));
    const alerts: { sectionId: string; courseId: string; openSeats: number }[] = [];
    const now = Date.now();
    for (const group of groupByCourse(rows)) {
      const latestAttempt = latestCheck(group);
      if (latestAttempt && now - latestAttempt < MIN_INTERVAL_MS) continue;
      const result = await checkWatchGroup(db, group);
      alerts.push(...result.pageAlerts);
    }
    const updated = await db.select().from(watches).where(eq(watches.userId, user.id));
    return Response.json({ authProvider: user.provider, watches: updated.map((row) => ({ ...row, meetings: JSON.parse(row.meetings), instructors: JSON.parse(row.instructors) })), alerts, checkedAt: new Date().toISOString(), minIntervalSeconds: 60 });
  } catch (error) {
    console.error("Seat monitoring failed", error);
    return Response.json({ error: "Seat monitoring is temporarily unavailable." }, { status: 503 });
  }
}
