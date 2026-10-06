// Builds data/hard-courses.json for the "Hardest courses to get" page (/hard-courses): for every course in the
// bundled Spring 2027 catalog, how many seats were still open at the end of each recent regular term.
// Run: node --import tsx scripts/build-hard-courses.mjs   (about 10 minutes; rerun once a term)
// Source: Testudo's multi-course sections page, 25 courses per request. Past terms show the seats left once the
// term ran (Testudo hides their waitlists), and the current term shows them after add/drop.
// Only courses that were nearly full in at least one term and big enough to matter are kept, so the file stays
// small; the ranking itself happens on the page (lib/hard-courses.ts).
import { readFileSync, writeFileSync } from "node:fs";
import { parseTestudoSections } from "../lib/umd.ts";

const TERMS = ["202508", "202601", "202608"];
const MIN_SEATS = 30;
const NEARLY_FULL = 0.9;
const catalog = JSON.parse(readFileSync(new URL("../data/202701-catalog.json", import.meta.url), "utf8"));
const courses = catalog.filter((course) => /^[A-Z]{4}\d{3}[A-Z]?$/.test(course.course_id));
const titles = new Map(courses.map((course) => [course.course_id, course.name]));

async function sectionsPage(term, ids) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(`https://app.testudo.umd.edu/soc/${term}/sections?courseIds=${ids.join(",")}`, { signal: AbortSignal.timeout(45_000) });
      if (!response.ok) throw new Error(`Testudo returned ${response.status}`);
      return await response.text();
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
    }
  }
}

async function termSeats(term) {
  const result = new Map();
  const batches = [];
  for (let start = 0; start < courses.length; start += 25) batches.push(courses.slice(start, start + 25).map((course) => course.course_id));
  let next = 0, done = 0;
  async function worker() {
    while (next < batches.length) {
      const ids = batches[next++];
      const html = await sectionsPage(term, ids);
      const parts = new Map(html.split(/<div id="(?=[A-Z]{4}\d{3}[A-Z]?" class="course-sections")/).slice(1).map((part) => [part.slice(0, part.indexOf('"')), part]));
      for (const id of ids) {
        const part = parts.get(id);
        if (!part) continue;
        // Sections without a seat count (or with none) are placeholders such as independent study.
        const sections = parseTestudoSections(part, id).filter((section) => typeof section.seats === "number" && section.seats > 0 && typeof section.open_seats === "number");
        if (!sections.length) continue;
        result.set(id, {
          seats: sections.reduce((sum, section) => sum + section.seats, 0),
          open: sections.reduce((sum, section) => sum + section.open_seats, 0),
          sections: sections.length,
          fullSections: sections.filter((section) => section.open_seats === 0).length,
        });
      }
      done += 1;
      if (done % 20 === 0) process.stdout.write(`${term}: ${done}/${batches.length}\n`);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return result;
}

const byTerm = {};
for (const term of TERMS) byTerm[term] = await termSeats(term);

const kept = [];
for (const { course_id: id } of courses) {
  const terms = {};
  for (const term of TERMS) {
    const seats = byTerm[term].get(id);
    if (seats) terms[term] = seats;
  }
  const readings = Object.values(terms);
  const nearlyFull = readings.some((reading) => reading.seats >= MIN_SEATS && 1 - reading.open / reading.seats >= NEARLY_FULL);
  if (nearlyFull) kept.push({ id, title: titles.get(id) ?? "", terms });
}

writeFileSync(new URL("../data/hard-courses.json", import.meta.url), JSON.stringify({ builtAt: new Date().toISOString().slice(0, 10), terms: TERMS, courses: kept }) + "\n");
console.log(`kept ${kept.length} of ${courses.length} courses; offered per term:`, TERMS.map((term) => `${term} ${byTerm[term].size}`).join(", "));
