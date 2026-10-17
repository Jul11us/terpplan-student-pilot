import { matchCourses } from "@/lib/catalog-match";
import { catalogCourses } from "@/lib/course-catalog";
import { courseIdIsValid } from "@/lib/umd";

const MAX_IDS = 80;
const SEARCH_LIMIT = 12;
const CACHE = { "Cache-Control": "public, max-age=3600" };

// Courses for the four-year plan, from every course listed in Fall 2026 or Spring 2027 (lib/course-catalog.ts).
// ?q= searches them; ?ids= gives each one's title, credits, Gen Ed codes, prerequisite rule and the terms that
// list it, or null when neither term does.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ids = url.searchParams.get("ids");
  if (ids !== null) {
    const list = [...new Set(ids.split(",").map((id) => id.trim().toUpperCase()).filter(Boolean))];
    if (!list.length || list.length > MAX_IDS || list.some((id) => !courseIdIsValid(id))) return Response.json({ error: "Choose between 1 and 80 valid course codes." }, { status: 400 });
    const { byId } = catalogCourses();
    const courses = Object.fromEntries(list.map((id) => {
      const course = byId.get(id);
      return [id, course ? { name: course.name, credits: course.credits ?? null, ge: course.ge ?? [], pr: course.pr ?? null, terms: course.terms } : null];
    }));
    return Response.json({ courses }, { headers: CACHE });
  }
  const query = (url.searchParams.get("q") ?? "").trim();
  if (query.length > 120) return Response.json({ error: "Search text is too long." }, { status: 400 });
  const results = matchCourses(catalogCourses().list, query, SEARCH_LIMIT)
    .map((course) => ({ course_id: course.course_id, name: course.name, credits: course.credits ?? null, ge: course.ge ?? [], terms: course.terms }));
  return Response.json({ results }, { headers: CACHE });
}
