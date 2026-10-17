import { courseIdIsValid, DEFAULT_TERM, getCourse, type CatalogItem, umdJson } from "@/lib/umd";
import spring2027Catalog from "@/data/202701-catalog.json";
import { BoundedCache } from "@/lib/bounded-cache";
import { matchCourses } from "@/lib/catalog-match";

type CacheEntry = { expiresAt: number; courses: CatalogItem[] };
// The page shows 40 at a time; the rest are there for "Show more" and for its result filters.
export const MAX_RESULTS = 120;
const catalogCache = new BoundedCache<string, CacheEntry>(12);

// What the results list shows; prerequisite rules are for the planner (/api/prereqs), not for the list.
const summary = (course: CatalogItem) => ({ course_id: course.course_id, name: course.name, department: course.department, credits: course.credits, ...(course.ge ? { ge: course.ge } : {}) });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const compactQuery = query.replace(/\s+/g, "");
  const term = url.searchParams.get("term") ?? DEFAULT_TERM;
  if (!/^\d{6}$/.test(term)) return Response.json({ error: "Choose a valid term." }, { status: 400 });
  if (query.length > 120) return Response.json({ error: "Search text is too long." }, { status: 400 });
  if (query.length < 2) return Response.json({ results: [] });

  if (term === "202701") {
    const results = matchCourses(spring2027Catalog as CatalogItem[], query, MAX_RESULTS).map(summary);
    // The bundled catalog is a snapshot. For a full course code it does not list, ask Testudo directly,
    // so a newly added course is found instead of being reported as "not offered".
    const exactId = compactQuery.toUpperCase();
    if (!results.length && courseIdIsValid(exactId)) {
      try {
        const detail = await getCourse(exactId, term);
        const course = detail?.course as { name?: unknown; department?: unknown; credits?: unknown; max_credits?: unknown } | undefined;
        if (course && typeof course.name === "string") {
          const credits = typeof course.credits === "number" ? String(course.credits) + (typeof course.max_credits === "number" ? `–${course.max_credits}` : "") : undefined;
          return Response.json({ results: [{ course_id: exactId, name: course.name, department: typeof course.department === "string" ? course.department : exactId.slice(0, 4), credits }], term });
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
    const results = matchCourses(entry.courses, query, MAX_RESULTS).map(summary);
    return Response.json({ results, term });
  } catch {
    return Response.json({ error: "Course search is temporarily unavailable. Try again shortly." }, { status: 503 });
  }
}
