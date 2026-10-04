import { and, asc, eq } from "drizzle-orm";
import { currentUser, authRequired } from "@/lib/auth";
import { getDb } from "@/db";
import { watches } from "@/db/schema";
import { MAX_SECTIONS_PER_REQUEST, MAX_WATCHED_COURSES_PER_USER, MAX_WATCHES_PER_USER } from "@/lib/alerts";
import { DEFAULT_TERM, getCourse, parseCount, sectionId } from "@/lib/umd";
import { readJsonObject, sameOriginMutation } from "@/lib/request-security";

export async function GET(request: Request) {
  const user = await currentUser(request);
  // Signed-out visitors are the normal first-load case, so answer with an empty list rather than a 401.
  if (!user) return Response.json({ authenticated: false, watches: [] });
  try {
    const rows = await getDb().select().from(watches).where(eq(watches.userId, user.id)).orderBy(asc(watches.courseId), asc(watches.sectionId));
    return Response.json({ authenticated: true, authProvider: user.provider, watches: rows.map((row) => ({ ...row, meetings: JSON.parse(row.meetings), instructors: JSON.parse(row.instructors) })) });
  } catch (error) {
    console.error("Failed to load seat watches", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "Seat watches are temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = sameOriginMutation(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return authRequired();
  // One section (sectionId), or several sections of the same course (sectionIds) for "any section opens".
  const parsed = await readJsonObject(request, 8192);
  if (parsed.error) return parsed.error;
  const payload = parsed.value;
  const courseId = typeof payload.courseId === "string" ? payload.courseId.trim().toUpperCase() : "";
  const term = typeof payload.term === "string" ? payload.term : DEFAULT_TERM;
  const requested: unknown[] = Array.isArray(payload.sectionIds) ? payload.sectionIds : [payload.sectionId];
  const wantedSections = [...new Set(requested.filter((id): id is string => typeof id === "string").map((id) => id.trim().toUpperCase()).filter(Boolean))];
  if (courseId.length > 12 || !/^[A-Z]{4}\d{3}[A-Z0-9]*$/.test(courseId) || !/^\d{6}$/.test(term) || !wantedSections.length || wantedSections.some((id) => id.length > 40)) {
    return Response.json({ error: "Choose a course and section first." }, { status: 400 });
  }
  if (wantedSections.length > MAX_SECTIONS_PER_REQUEST) {
    return Response.json({ error: `Choose up to ${MAX_SECTIONS_PER_REQUEST} sections at a time.` }, { status: 400 });
  }

  try {
    const detail = await getCourse(courseId, term);
    const found = wantedSections.map((wanted) => detail?.sections.find((item) => sectionId(item, courseId) === wanted));
    if (!detail || found.some((section) => !section)) return Response.json({ error: "That section is no longer listed for this term." }, { status: 404 });
    const db = getDb();
    const existing = await db.select({ sectionId: watches.sectionId, term: watches.term, courseId: watches.courseId }).from(watches).where(eq(watches.userId, user.id));
    const added = wantedSections.filter((wanted) => !existing.some((item) => item.term === term && item.sectionId === wanted));
    const courses = new Set([...existing.map((item) => item.term + "|" + item.courseId), term + "|" + courseId]);
    if (added.length && (courses.size > MAX_WATCHED_COURSES_PER_USER || existing.length + added.length > MAX_WATCHES_PER_USER)) {
      return Response.json({ error: `You can watch up to ${MAX_WATCHED_COURSES_PER_USER} courses (${MAX_WATCHES_PER_USER} sections). Remove one to add another.`, code: "watchLimit" }, { status: 409 });
    }
    const inserts = found.map((section, index) => {
      const wantedSection = wantedSections[index]!;
      return db.insert(watches).values({
        userId: user.id,
        courseId,
        courseTitle: String(detail.course.name ?? courseId),
        term,
        sectionId: wantedSection,
        meetings: JSON.stringify(section!.meetings ?? []),
        instructors: JSON.stringify(section!.instructors ?? []),
        seats: parseCount(section!.seats),
        openSeats: parseCount(section!.open_seats),
        waitlist: parseCount(section!.waitlist),
        status: parseCount(section!.open_seats) === null ? "unknown" : "ok",
        lastSuccessAt: detail.seatCheckedAt,
      }).onConflictDoUpdate({
        target: [watches.userId, watches.term, watches.sectionId],
        set: {
          courseTitle: String(detail.course.name ?? courseId),
          meetings: JSON.stringify(section!.meetings ?? []),
          instructors: JSON.stringify(section!.instructors ?? []),
          seats: parseCount(section!.seats),
          openSeats: parseCount(section!.open_seats),
          waitlist: parseCount(section!.waitlist),
          status: parseCount(section!.open_seats) === null ? "unknown" : "ok",
          lastSuccessAt: detail.seatCheckedAt,
        },
      }).returning();
    });
    // D1 runs the whole batch in one transaction. The migration's insert trigger
    // enforces account limits even when another request passed the early check.
    const saved = await db.batch(inserts as [typeof inserts[number], ...typeof inserts[number][]]);
    const savedRows = saved.flat().map((row) => ({ ...row, meetings: JSON.parse(row.meetings), instructors: JSON.parse(row.instructors) }));
    return Response.json({ watch: savedRows[0], watches: savedRows }, { status: 201 });
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    if (cause instanceof Error && cause.message.includes("watch_limit")) {
      return Response.json({ error: `You can watch up to ${MAX_WATCHED_COURSES_PER_USER} courses (${MAX_WATCHES_PER_USER} sections). Remove one to add another.`, code: "watchLimit" }, { status: 409 });
    }
    console.error("Failed to save seat watch", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "Could not save this seat watch. Try again." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const denied = sameOriginMutation(request);
  if (denied) return denied;
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
    console.error("Failed to remove seat watch", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "Could not remove this seat watch." }, { status: 503 });
  }
}
