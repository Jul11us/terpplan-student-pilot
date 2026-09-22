import { and, asc, eq } from "drizzle-orm";
import { currentUser, authRequired } from "@/lib/auth";
import { getDb } from "@/db";
import { watches } from "@/db/schema";
import { DEFAULT_TERM, getCourse, parseCount, sectionId } from "@/lib/umd";

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return authRequired();
  try {
    const rows = await getDb().select().from(watches).where(eq(watches.userId, user.id)).orderBy(asc(watches.courseId), asc(watches.sectionId));
    return Response.json({ authProvider: user.provider, watches: rows.map((row) => ({ ...row, meetings: JSON.parse(row.meetings), instructors: JSON.parse(row.instructors) })) });
  } catch (error) {
    console.error("Failed to load seat watches", error);
    return Response.json({ error: "Seat watches are temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return authRequired();
  let payload: { courseId?: string; term?: string; sectionId?: string };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const courseId = (payload.courseId ?? "").trim().toUpperCase();
  const term = payload.term ?? DEFAULT_TERM;
  const wantedSection = (payload.sectionId ?? "").trim().toUpperCase();
  if (!/^[A-Z]{4}\d{3}[A-Z0-9]*$/.test(courseId) || !/^\d{6}$/.test(term) || !wantedSection) {
    return Response.json({ error: "Choose a course and section first." }, { status: 400 });
  }

  try {
    const detail = await getCourse(courseId, term);
    const section = detail?.sections.find((item) => sectionId(item, courseId) === wantedSection);
    if (!detail || !section) return Response.json({ error: "That section is no longer listed for this term." }, { status: 404 });
    const db = getDb();
    const [saved] = await db.insert(watches).values({
      userId: user.id,
      courseId,
      courseTitle: String(detail.course.name ?? courseId),
      term,
      sectionId: wantedSection,
      meetings: JSON.stringify(section.meetings ?? []),
      instructors: JSON.stringify(section.instructors ?? []),
      seats: parseCount(section.seats),
      openSeats: parseCount(section.open_seats),
      waitlist: parseCount(section.waitlist),
      status: parseCount(section.open_seats) === null ? "unknown" : "ok",
      lastSuccessAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: [watches.userId, watches.term, watches.sectionId],
      set: {
        courseTitle: String(detail.course.name ?? courseId),
        meetings: JSON.stringify(section.meetings ?? []),
        instructors: JSON.stringify(section.instructors ?? []),
        seats: parseCount(section.seats),
        openSeats: parseCount(section.open_seats),
        waitlist: parseCount(section.waitlist),
        status: parseCount(section.open_seats) === null ? "unknown" : "ok",
        lastSuccessAt: new Date().toISOString(),
      },
    }).returning();
    return Response.json({ watch: { ...saved, meetings: JSON.parse(saved.meetings), instructors: JSON.parse(saved.instructors) } }, { status: 201 });
  } catch (error) {
    console.error("Failed to save seat watch", error);
    return Response.json({ error: "Could not save this seat watch. Try again." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const user = await currentUser(request);
  if (!user) return authRequired();
  const url = new URL(request.url);
  const term = url.searchParams.get("term") ?? "";
  const section = url.searchParams.get("section") ?? "";
  if (!/^\d{6}$/.test(term) || !section) return Response.json({ error: "Choose a watch to remove." }, { status: 400 });
  try {
    await getDb().delete(watches).where(and(eq(watches.userId, user.id), eq(watches.term, term), eq(watches.sectionId, section)));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to remove seat watch", error);
    return Response.json({ error: "Could not remove this seat watch." }, { status: 503 });
  }
}
