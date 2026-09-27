import { getGenEdCourses, isGenEdCode } from "@/lib/gened";

// A category takes a few Testudo requests to build, and each Worker instance has its own memory,
// so finished lists are also kept in Cloudflare's edge cache, which all instances in a location share.
const EDGE_CACHE_SECONDS = 15 * 60;

function edgeCache() {
  // Cloudflare Workers expose caches.default; elsewhere (or if the host disables it) there is none.
  return (globalThis as { caches?: { default?: Cache } }).caches?.default ?? null;
}

// Courses in one Gen Ed category for a term, with their sections, for the Gen Ed finder.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const term = url.searchParams.get("term") ?? "";
  const code = (url.searchParams.get("code") ?? "").toUpperCase();
  if (!/^\d{4}(01|05|08|12)$/.test(term)) return Response.json({ error: "Choose a valid term." }, { status: 400 });
  if (!isGenEdCode(code)) return Response.json({ error: "Choose a Gen Ed category." }, { status: 400 });

  const cache = edgeCache();
  const cacheKey = new Request(`${url.origin}/api/gened?term=${term}&code=${code}`);
  try {
    const hit = await cache?.match(cacheKey);
    if (hit) return hit;
  } catch {
    // Cache unavailable: build the list below.
  }

  try {
    const { courses, seatCheckedAt } = await getGenEdCourses(term, code);
    const response = Response.json({ term, code, courses, seatCheckedAt }, { headers: { "Cache-Control": `public, max-age=0, s-maxage=${EDGE_CACHE_SECONDS}` } });
    try {
      await cache?.put(cacheKey, response.clone());
    } catch {
      // Not cached; the in-memory cache in lib/gened still helps this instance.
    }
    return response;
  } catch (error) {
    console.error("Gen Ed lookup failed", term, code, error);
    return Response.json({ error: "Gen Ed courses could not be loaded. Try again shortly." }, { status: 503 });
  }
}
