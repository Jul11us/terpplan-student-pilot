#!/usr/bin/env node
// Observe real course data through the deployed/local API; never inserts sample data.
const [term, origin, ...courses] = process.argv.slice(2);
if (!/^\d{6}$/.test(term ?? "") || !origin || !courses.length || courses.some((id) => !/^[A-Z]{4}\d{3}[A-Z]?$/.test(id))) throw new Error("Usage: node scripts/collect-seat-data.mjs TERM SITE_ORIGIN COURSE [COURSE...]");
const site = new URL(origin);
if (!["http:", "https:"].includes(site.protocol) || site.username || site.password) throw new Error("Choose a site origin without credentials.");
for (const courseId of [...new Set(courses)]) {
  const url = new URL("/api/course", site);
  url.search = new URLSearchParams({ id: courseId, term }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Course ${courseId} returned ${response.status}.`);
  const data = await response.json();
  if (!data.historyRecorded) throw new Error(`History storage was not available for ${courseId}.`);
  console.log(`${courseId}: observed ${data.sections?.length ?? 0} sections in ${term}.`);
}
