import { courseIdIsValid, DEFAULT_TERM, getCourse, type CatalogItem, umdJson } from "@/lib/umd";
import spring2027Catalog from "@/data/202701-catalog.json";

type CacheEntry = { expiresAt: number; courses: CatalogItem[] };
const catalogCache = new Map<string, CacheEntry>();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const compactQuery = query.replace(/\s+/g, "");
  const term = url.searchParams.get("term") ?? DEFAULT_TERM;
  if (!/^\d{6}$/.test(term)) return Response.json({ error: "Choose a valid term." }, { status: 400 });
  if (query.length < 2) return Response.json({ results: [] });

  if (term === "202701") {
    const results = (spring2027Catalog as CatalogItem[])
      .filter((course) => {
        const compactCourseId = course.course_id.toLowerCase().replace(/\s+/g, "");
        const haystack = `${course.course_id} ${course.name} ${course.department ?? ""}`.toLowerCase();
        return haystack.includes(query) || compactCourseId.includes(compactQuery);
      })
      .slice(0, 40);
    // The bundled catalog is a snapshot. For a full course code it does not list, ask Testudo directly,
    // so a newly added course is found instead of being reported as "not offered".
    const exactId = compactQuery.toUpperCase();
    if (!results.length && courseIdIsValid(exactId)) {
      try {
        const detail = await getCourse(exactId, term);
        const course = detail?.course as { name?: unknown; department?: unknown } | undefined;
        if (course && typeof course.name === "string") {
          return Response.json({ results: [{ course_id: exactId, name: course.name, department: typeof course.department === "string" ? course.department : exactId.slice(0, 4) }], term });
        }
      } catch {
        // Fall through to the empty result; the page then says the course is not offered this term.
      }
    }
    return Response.json({ results, term });
  }

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
