import { instructorTerm } from "@/lib/instructor";
import { courseIdIsValid, DEFAULT_TERM } from "@/lib/umd";

// One instructor's sections this term. Seat counts in it are a few minutes old at most.
const EDGE_CACHE_SECONDS = 5 * 60;

function edgeCache() {
  return (globalThis as { caches?: { default?: Cache } }).caches?.default ?? null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = (url.searchParams.get("name") ?? "").trim().replace(/\s+/g, " ");
  const term = url.searchParams.get("term") ?? DEFAULT_TERM;
  const course = (url.searchParams.get("course") ?? "").trim().toUpperCase();
  if (!name || name.length > 120) return Response.json({ error: "Choose an instructor." }, { status: 400 });
  if (!/^\d{6}$/.test(term)) return Response.json({ error: "Choose a valid term." }, { status: 400 });
  const also = courseIdIsValid(course) ? [course] : [];

  const cache = edgeCache();
  const cacheKey = new Request(`${url.origin}/api/instructor?name=${encodeURIComponent(name.toLowerCase())}&term=${term}&course=${also.join("")}`);
  try {
    const hit = await cache?.match(cacheKey);
    if (hit) return hit;
  } catch {
    // Cache unavailable: look it up below.
  }
  try {
    const result = await instructorTerm(name, term, also);
    const response = Response.json({ term, ...result, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": `public, max-age=60, s-maxage=${EDGE_CACHE_SECONDS}` } });
    try { await cache?.put(cacheKey, response.clone()); } catch { /* not cached */ }
    return response;
  } catch (error) {
    console.error("Instructor lookup failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "This instructor's sections could not be loaded. Try again shortly." }, { status: 503 });
  }
}
