// TerpPlan's service worker: lets "My week" (and the last-seen pages) open without a network connection.
// Pages are network-first, so a connected student always gets the current site; hashed build files are
// cache-first, since their names change whenever their contents do. API calls are never cached here.

const PAGES = "terpplan-pages-v2";
const FILES = "terpplan-files-v1";
const OFFLINE_PAGE = "/week";
const PRECACHE = [OFFLINE_PAGE, "/manifest.webmanifest", "/icon-192.png", "/favicon.svg"];

const isBuildFile = (url) => /^\/(assets|_next)\//.test(url.pathname) || /\.(js|css|woff2?|png|svg|webp|ico)$/.test(url.pathname);

// The page's own scripts and styles, so /week can start offline right after the first install.
async function cacheWithItsFiles(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) return;
  const pages = await caches.open(PAGES);
  await pages.put(path, response.clone());
  const html = await response.text();
  // Script tags, preloads, and the chunk paths named inside the page's inline React data.
  const files = [...html.matchAll(/\/(?:assets|_next)\/[\w~.\-/]+\.(?:js|css)/g)].map((match) => match[0]);
  const store = await caches.open(FILES);
  await Promise.all([...new Set(files)].map((file) => store.add(file).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await cacheWithItsFiles(OFFLINE_PAGE).catch(() => undefined);
    const store = await caches.open(FILES);
    await Promise.all(PRECACHE.slice(1).map((file) => store.add(file).catch(() => undefined)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([PAGES, FILES]);
    await Promise.all((await caches.keys()).filter((key) => key.startsWith("terpplan-") && !keep.has(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  // Token-bearing confirmation pages must always use the network, never an offline copy.
  if (url.pathname === "/unsubscribe") return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        // One copy per page (no query string), the latest one that loaded.
        if (response.ok) (await caches.open(PAGES)).put(url.pathname, response.clone());
        return response;
      } catch {
        const pages = await caches.open(PAGES);
        return (await pages.match(url.pathname, { ignoreVary: true })) ?? (await pages.match(OFFLINE_PAGE, { ignoreVary: true })) ?? Response.error();
      }
    })());
    return;
  }

  if (isBuildFile(url)) {
    event.respondWith((async () => {
      const store = await caches.open(FILES);
      const cached = await store.match(request, { ignoreVary: true });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) store.put(request, response.clone());
      return response;
    })());
  }
});
