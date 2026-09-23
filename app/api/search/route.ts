import { DEFAULT_TERM, type CatalogItem, umdJson } from "@/lib/umd";

type CacheEntry = { expiresAt: number; courses: CatalogItem[] };
const catalogCache = new Map<string, CacheEntry>();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const compactQuery = query.replace(/\s+/g, "");
  const term = url.searchParams.get("term") ?? DEFAULT_TERM;
  if (!/^\d{6}$/.test(term)) return Response.json({ error: "Choose a valid term." }, { status: 400 });
  if (query.length < 2) return Response.json({ results: [] });

  try {
    let entry = catalogCache.get(term);
    if (!entry || entry.expiresAt <= Date.now()) {
      const courses = await umdJson<CatalogItem[]>(`/courses/list?semester=${encodeURIComponent(term)}`);
      if (!Array.isArray(courses)) throw new Error("Invalid catalog response.");
      entry = { courses, expiresAt: Date.now() + 5 * 60_000 };
      catalogCache.set(term, entry);
    }
    const results = entry.courses
      .filter((course) => {
        const haystack = `${course.course_id} ${course.name} ${course.department ?? ""}`.toLowerCase();
        const compactCourseId = course.course_id.toLowerCase().replace(/\s+/g, "");
        return haystack.includes(query) || compactCourseId.includes(compactQuery);
      })
      .slice(0, 40);
    return Response.json({ results, term });
  } catch {
    return Response.json({ error: "Course search is temporarily unavailable. Try again shortly." }, { status: 503 });
  }
}
