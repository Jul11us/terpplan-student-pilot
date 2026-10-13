import { instructorWords, searchInstructors } from "@/lib/instructor-search";

// Instructor names matching what was typed in the planner's search box. Names change rarely: kept a day.
const EDGE_CACHE_SECONDS = 24 * 60 * 60;

function edgeCache() {
  return (globalThis as { caches?: { default?: Cache } }).caches?.default ?? null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().replace(/\s+/g, " ");
  const words = instructorWords(query);
  if (!words) return Response.json({ results: [], more: false });

  const cache = edgeCache();
  const cacheKey = new Request(`${url.origin}/api/instructor/search?q=${encodeURIComponent(words.join(" "))}`);
  try {
    const hit = await cache?.match(cacheKey);
    if (hit) return hit;
  } catch {
    // Cache unavailable: look it up below.
  }
  try {
    const found = await searchInstructors(words.join(" "));
    const response = Response.json(found, { headers: { "Cache-Control": `public, max-age=3600, s-maxage=${EDGE_CACHE_SECONDS}` } });
    try { await cache?.put(cacheKey, response.clone()); } catch { /* not cached */ }
    return response;
  } catch (error) {
    console.error("Instructor search failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Instructors could not be searched. Try again shortly." }, { status: 503 });
  }
}
