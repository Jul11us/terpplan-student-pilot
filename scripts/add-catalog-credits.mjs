// Adds each course's credits to the bundled Spring 2027 catalog (data/202701-catalog.json), so search
// results can show them without another request per course.
// Run: node scripts/add-catalog-credits.mjs
// Source: Testudo's department pages (one page per department lists every course's credits).
// Variable-credit courses are written as a range, e.g. "1–3". A course Testudo no longer lists keeps
// no credits field rather than a guess.
import { readFileSync, writeFileSync } from "node:fs";

const TERM = "202701";
const FILE = new URL("../data/202701-catalog.json", import.meta.url);
const catalog = JSON.parse(readFileSync(FILE, "utf8"));

const text = (block, className) => block.match(new RegExp(`class="${className}">\\s*([^<]*?)\\s*<`))?.[1] ?? "";

async function departmentCredits(department) {
  const response = await fetch(`https://app.testudo.umd.edu/soc/${TERM}/${encodeURIComponent(department)}`, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${department}: Testudo returned ${response.status}`);
  const html = await response.text();
  const credits = new Map();
  for (const block of html.split(/<div id="(?=[A-Z]{4}\d{3}[A-Z]?" class="course")/).slice(1)) {
    const courseId = block.slice(0, block.indexOf('"'));
    const min = text(block, "course-min-credits");
    const max = text(block, "course-max-credits");
    if (/^\d+(\.\d+)?$/.test(min)) credits.set(courseId, max && max !== min && /^\d+(\.\d+)?$/.test(max) ? `${min}–${max}` : min);
  }
  return credits;
}

const departments = [...new Set(catalog.map((course) => course.department).filter((department) => /^[A-Z]{4}$/.test(department ?? "")))];
const found = new Map();
const failed = [];
let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < departments.length) {
    const department = departments[next++];
    try {
      for (const [courseId, credits] of await departmentCredits(department)) found.set(courseId, credits);
    } catch (error) {
      failed.push(`${department} (${error.message})`);
    }
  }
}));

let withCredits = 0;
const updated = catalog.map((course) => {
  const credits = found.get(course.course_id);
  const rest = { ...course };
  delete rest.credits;
  if (credits) withCredits += 1;
  return credits ? { ...rest, credits } : rest;
});
writeFileSync(FILE, JSON.stringify(updated, null, 2) + "\n");
console.log(`${withCredits} of ${catalog.length} courses have credits; ${departments.length} departments read.`);
if (failed.length) console.log(`Failed: ${failed.join(", ")}`);
