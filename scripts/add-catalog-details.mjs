// Adds each course's credits and prerequisite rule to the bundled Spring 2027 catalog
// (data/202701-catalog.json), so search results can show credits and the planner can check prerequisites
// without another request per course.
// Run: node scripts/add-catalog-details.mjs
// Source: Testudo's department pages (one page per department lists every course's credits and notes).
//   credits  "3", or a range such as "1–3" for variable-credit courses
//   pr       the prerequisite as a logic tree (see scripts/prerequisites.mjs); left out when the text names
//            no course (placement, standing or permission only) or there is no prerequisite
// A course Testudo no longer lists keeps neither field rather than a guess.
import { readFileSync, writeFileSync } from "node:fs";
import { prerequisiteTree } from "./prerequisites.mjs";

const TERM = "202701";
const FILE = new URL("../data/202701-catalog.json", import.meta.url);
const catalog = JSON.parse(readFileSync(FILE, "utf8"));

const text = (block, className) => block.match(new RegExp(`class="${className}">\\s*([^<]*?)\\s*<`))?.[1] ?? "";
const plain = (html) => html
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/\s+/g, " ")
  .trim();

async function departmentDetails(department) {
  const response = await fetch(`https://app.testudo.umd.edu/soc/${TERM}/${encodeURIComponent(department)}`, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${department}: Testudo returned ${response.status}`);
  const html = await response.text();
  const details = new Map();
  for (const block of html.split(/<div id="(?=[A-Z]{4}\d{3}[A-Z]?" class="course")/).slice(1)) {
    const courseId = block.slice(0, block.indexOf('"'));
    const min = text(block, "course-min-credits");
    const max = text(block, "course-max-credits");
    const credits = /^\d+(\.\d+)?$/.test(min) ? (max && max !== min && /^\d+(\.\d+)?$/.test(max) ? `${min}–${max}` : min) : undefined;
    const prerequisite = block.match(/<strong>\s*Prerequisite:?\s*<\/strong>([\s\S]*?)<\/div>/i)?.[1];
    const pr = prerequisite ? prerequisiteTree(plain(prerequisite), courseId) : null;
    details.set(courseId, { credits, pr: pr ?? undefined });
  }
  return details;
}

const departments = [...new Set(catalog.map((course) => course.department).filter((department) => /^[A-Z]{4}$/.test(department ?? "")))];
const found = new Map();
const failed = [];
let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < departments.length) {
    const department = departments[next++];
    try {
      for (const [courseId, detail] of await departmentDetails(department)) found.set(courseId, detail);
    } catch (error) {
      failed.push(`${department} (${error.message})`);
    }
  }
}));

let withCredits = 0;
let withPrerequisites = 0;
const updated = catalog.map((course) => {
  const detail = found.get(course.course_id) ?? {};
  const rest = { ...course };
  delete rest.credits;
  delete rest.pr;
  if (detail.credits) withCredits += 1;
  if (detail.pr) withPrerequisites += 1;
  return { ...rest, ...(detail.credits ? { credits: detail.credits } : {}), ...(detail.pr ? { pr: detail.pr } : {}) };
});
// One course per line keeps the file small and its diffs readable.
writeFileSync(FILE, "[\n" + updated.map((course) => "  " + JSON.stringify(course)).join(",\n") + "\n]\n");
console.log(`${withCredits} of ${catalog.length} courses have credits, ${withPrerequisites} a prerequisite rule; ${departments.length} departments read.`);
if (failed.length) console.log(`Failed: ${failed.join(", ")}`);
