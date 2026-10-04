import { getCourseOfferingHistory } from "@/lib/history-db";
import { courseIdIsValid } from "@/lib/umd";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const courseId = (url.searchParams.get("id") ?? "").trim().toUpperCase();
  const lang = (url.searchParams.get("lang") ?? "en") as "en" | "zh";

  if (!courseIdIsValid(courseId)) {
    return Response.json({ error: "Enter a valid course code." }, { status: 400 });
  }

  if (!["en", "zh"].includes(lang)) {
    return Response.json({ error: "Language must be 'en' or 'zh'." }, { status: 400 });
  }

  try {
    const history = await getCourseOfferingHistory(courseId, lang);
    if (!history) {
      return Response.json({ courseId, terms: [], pattern: "irregular" as const });
    }
    return Response.json(history);
  } catch (error) {
    console.error("Course history error:", error);
    return Response.json({ error: "Course history could not be loaded. Try again shortly." }, { status: 503 });
  }
}
