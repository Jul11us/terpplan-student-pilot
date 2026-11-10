// Builds data/professor-ratings.json: every instructor PlanetTerp lists, with their average rating and page slug.
// The schedule generator reads ratings from here first, so a plan with many large courses (ENGL101 alone has
// dozens of instructors) no longer runs into the per-request PlanetTerp lookup limit. Names missing from the
// file (new instructors) are still looked up live.
// Run: node scripts/build-professor-ratings.mjs   (a minute or so; rerun once a term, with home-reviews)
import { writeFileSync } from "node:fs";

const PAGE = 100;
const rows = [];
for (let offset = 0; ; offset += PAGE) {
  let page;
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`https://planetterp.com/api/v1/professors?limit=${PAGE}&offset=${offset}`, { signal: AbortSignal.timeout(30_000) });
    if (response.ok) { page = await response.json(); break; }
    if (attempt >= 3) throw new Error(`PlanetTerp returned ${response.status} at offset ${offset}.`);
    await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
  }
  if (!Array.isArray(page)) throw new Error("PlanetTerp returned an unexpected body.");
  rows.push(...page);
  if (page.length < PAGE) break;
}

// name → [average rating or null, slug]. Ratings are rounded to what the site shows (two places).
const professors = {};
for (const row of rows) {
  const name = String(row?.name ?? "").trim().replace(/\s+/g, " ");
  const slug = String(row?.slug ?? "").trim();
  if (!name || !slug) continue;
  const rating = Number(row.average_rating);
  const value = row.average_rating === null || row.average_rating === undefined || !Number.isFinite(rating) ? null : Math.round(rating * 100) / 100;
  // PlanetTerp occasionally lists one name twice (professor and TA); keep the entry that has a rating.
  const key = name.toLocaleLowerCase("en-US");
  if (professors[key] && professors[key][1] !== null && value === null) continue;
  professors[key] = [name, value, slug];
}

const entries = Object.values(professors);
if (entries.length < 1000) throw new Error(`Only ${entries.length} instructors were returned; not overwriting the file.`);
writeFileSync(new URL("../data/professor-ratings.json", import.meta.url), JSON.stringify({
  builtAt: new Date().toISOString().slice(0, 10),
  professors: entries,
}) + "\n");
console.log(`${entries.length} instructors (${entries.filter((entry) => entry[1] !== null).length} rated) from ${rows.length} rows`);
