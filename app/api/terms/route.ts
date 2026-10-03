import { availableTerms, DEFAULT_TERM } from "@/lib/umd";

// The term list changes a few times a year, but umd.io takes most of a second to answer, and every page
// load asks for it. So it is kept in this Worker's memory, in Cloudflare's edge cache (shared by the
// Worker instances in a location), and in the browser.
const MEMORY_MS = 6 * 60 * 60_000;
const EDGE_CACHE_SECONDS = 6 * 60 * 60;
let memory: { expiresAt: number; body: { terms: string[]; defaultTerm: string } } | null = null;

function edgeCache() {
  return (globalThis as { caches?: { default?: Cache } }).caches?.default ?? null;
}

const headers = { "Cache-Control": `public, max-age=3600, s-maxage=${EDGE_CACHE_SECONDS}` };

export async function GET(request: Request) {
  if (memory && memory.expiresAt > Date.now()) return Response.json(memory.body, { headers });
  const cache = edgeCache();
  const cacheKey = new Request(new URL("/api/terms?v=1", request.url).toString());
  try {
    const hit = await cache?.match(cacheKey);
    if (hit) return hit;
  } catch {
    // Cache unavailable: ask umd.io below.
  }
  try {
    // Students only plan for current and recent terms; the full umd.io history goes back years.
    const terms = (await availableTerms()).slice(0, 6);
    const body = { terms, defaultTerm: terms[0] ?? DEFAULT_TERM };
    memory = { expiresAt: Date.now() + MEMORY_MS, body };
    const response = Response.json(body, { headers });
    try { await cache?.put(cacheKey, response.clone()); } catch { /* not cached; memory still helps */ }
    return response;
  } catch {
    return Response.json({ error: "Could not load the current term list from umd.io." }, { status: 503 });
  }
}
