import { getSeatTrends, recordCourseHistory } from "@/lib/history-db";
import { courseIdIsValid, getCourse } from "@/lib/umd";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const term = url.searchParams.get("term") ?? "";
  const sectionIds = [...new Set((url.searchParams.get("sections") ?? "").split(",").map((id) => id.trim().toUpperCase()).filter(Boolean))];

  if (!/^\d{6}$/.test(term)) {
    return Response.json({ error: "Choose a valid term." }, { status: 400 });
  }

  if (!sectionIds.length || sectionIds.length > 50 || sectionIds.some((id) => !/^[A-Z]{4}\d{3}[A-Z]?-[A-Z0-9]{4}$/.test(id))) {
    return Response.json({ error: "Provide between 1 and 50 section IDs." }, { status: 400 });
  }

  try {
    const courseIds = [...new Set(sectionIds.map((id) => id.split("-")[0]))];
    if (courseIds.length > 10 || courseIds.some((id) => !courseIdIsValid(id))) return Response.json({ error: "Choose at most 10 valid courses." }, { status: 400 });
    await Promise.allSettled(courseIds.map(async (courseId) => {
      const detail = await getCourse(courseId, term);
      if (detail) await recordCourseHistory(term, courseId, detail.sections);
    }));
    const trends = await getSeatTrends(term, sectionIds);
    const result = Object.fromEntries(trends);
    return Response.json({ term, trends: result });
  } catch (error) {
    console.error("Seat trends error:", error);
    return Response.json({ error: "Trends could not be loaded. Try again shortly." }, { status: 503 });
  }
}
