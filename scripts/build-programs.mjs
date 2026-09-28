// Builds data/umd-programs.json from the UMD undergraduate catalog (academiccatalog.umd.edu):
// each minor's and major's requirement tables, plus credits and prerequisites for the courses they list.
// Run: node scripts/build-programs.mjs            (set PROGRAM_HTML_CACHE=<dir> to reuse downloaded pages)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CATALOG = "https://academiccatalog.umd.edu";
const cacheDir = process.env.PROGRAM_HTML_CACHE;
if (cacheDir) mkdirSync(cacheDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function page(url) {
  const name = url.replace(/\/$/, "").split("/").slice(-2).join("__") + ".html";
  const cached = cacheDir && join(cacheDir, name);
  if (cached && existsSync(cached)) return readFileSync(cached, "utf8");
  await sleep(250);
  const response = await fetch(url, { headers: { "user-agent": "TerpPlan catalog snapshot (terpplan@proton.me)" } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const html = await response.text();
  if (cached) writeFileSync(cached, html);
  return html;
}

function text(value) {
  return value
    .replace(/<sup>[\s\S]*?<\/sup>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;| /gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_m, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/​/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const codesIn = (html) => [...new Set(Array.from(html.matchAll(/showCourse\(this, '([A-Z]{4}\d{3}[A-Z]?)'\)/g), (match) => match[1]))];
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

// How many courses a "Select two of the following" style row asks for, when it says so.
function choiceCount(label) {
  const match = /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b(?!\s*(?:credits?|semester hours|hours))(?=(?:\s+[a-z0-9-]+){0,4}?\s+(?:of|from|courses?|classes|electives?|\())/i.exec(label);
  if (!match) return null;
  const word = match[1].toLowerCase();
  return NUMBER_WORDS[word] ?? Number(word);
}

const CHOICE_LABEL = /select|choose|one of|two of|three of|of the following|from the following|electives?\b|courses? from/i;

// Turns catalog course-list tables into requirement items:
//   course: one required course; any listed option (a bundle like "GEOL100 & GEOL110") satisfies it.
//   choose: pick `count` options (or `credits` worth) from the list.
function parseTables(html) {
  const items = [];
  let total = null;
  for (const table of html.match(/<table class="sc_courselist"[\s\S]*?<\/table>/g) ?? []) {
    let section = "";
    let group = null; // the choose item that indented rows are added to
    for (const [, rowClass, row] of table.matchAll(/<tr class="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/g)) {
      const hoursText = text(/<td class="hourscol">([\s\S]*?)<\/td>/.exec(row)?.[1] ?? "");
      const hours = /^\d+(?:\.\d+)?$/.test(hoursText) ? Number(hoursText) : /^\d+-\d+$/.test(hoursText) ? Number(hoursText.split("-")[0]) : null;
      const comment = /class="courselistcomment[^"]*"[^>]*>([\s\S]*?)<\/span>/.exec(row);
      const codes = codesIn(row);
      const indented = /blockindent/.test(row);
      if (/listsum/.test(rowClass)) { if (hours) total = hours; continue; }
      if (/orclass/.test(rowClass)) {
        const last = group ?? items.at(-1);
        if (last && codes.length) last.options.push(codes);
        continue;
      }
      if (comment && !codes.length) {
        const label = text(comment[1]);
        if (!label || /^or$/i.test(label)) continue;
        // A note inside a list that has not started yet ("A third course from the pairs above") keeps the list open.
        if (group && !group.options.length && !/areaheader/.test(rowClass)) continue;
        // "Maximum 3 credits from the following" adds capped choices to the list above it.
        const previous = items.at(-1);
        if (/^(maximum|at most|up to)\b/i.test(label) && previous?.kind === "choose") {
          group = previous;
          group.indented = false;
          continue;
        }
        const count = choiceCount(label);
        if (hours !== null || count !== null || CHOICE_LABEL.test(label)) {
          group = { kind: "choose", section, label, count, credits: hours, options: [] };
          items.push(group);
        } else {
          section = label;
          group = null;
        }
        continue;
      }
      if (!codes.length) continue;
      const rowText = text(row);
      // "GEOL100 & GEOL110" must be taken together; other multi-code rows list alternatives.
      const options = /&/.test(rowText) ? [codes] : codes.map((code) => [code]);
      // Suggested courses are not requirements.
      if (/recommended|optional|suggested/i.test(section) && !group) continue;
      // A list heading without its own credit total ("Select one of the following:") owns every course row
      // up to the next heading, unless its list is indented; then an unindented row ends the list.
      if (group && (indented || hours === null || (group.credits === null && !group.indented))) {
        if (indented) group.indented = true;
        group.options.push(...options);
        continue;
      }
      group = null;
      items.push({ kind: "course", section, label: text(row.replace(/<td class="hourscol">[\s\S]*?<\/td>/, "")).slice(0, 160), credits: hours, options });
    }
  }
  // A choice row without a course list ("3 credits of any LING 3xx course") stays as an open item when it
  // states its credits, so the remaining total is not understated; the student checks it off by hand.
  return { items: items.filter((item) => item.options.length || (item.kind === "choose" && item.credits)).map((item) => { delete item.indented; return item; }), total };
}

function courseBlocks(html) {
  const courses = {};
  for (const block of html.split('<div class="courseblock">').slice(1)) {
    const title = text(/<p class="courseblocktitle[^"]*">([\s\S]*?)<\/p>/.exec(block)?.[1] ?? "");
    const head = /^([A-Z]{4}\d{3}[A-Z]?)\s+(.*?)\s*\((\d+(?:\.\d+)?)(?:-\d+)?\s+Credits?\)/i.exec(title);
    if (!head) continue;
    const prereqHtml = /<strong>\s*Prerequisite:?\s*<\/strong>([\s\S]*?)<\/p>/i.exec(block)?.[1] ?? "";
    const prereqText = text(prereqHtml);
    // Read as AND of OR-groups: "A, B, and C" needs all three; "1 course from (A, B)" or "A or B" needs one.
    const groups = prereqText
      .split(/;|\band\b(?![^()]*\))/i)
      .flatMap((part) => {
        const codes = [...new Set(Array.from(part.matchAll(/\b([A-Z]{4}\d{3}[A-Z]?)\b/g), (match) => match[1]))];
        return /\bor\b|\bfrom\b|\bone of\b|\b1 course\b/i.test(part) ? [codes] : codes.map((code) => [code]);
      })
      .filter((group) => group.length);
    courses[head[1]] = { n: head[2], c: Number(head[3]), ...(prereqText ? { p: prereqText.slice(0, 240), pg: groups } : {}) };
  }
  return courses;
}

async function main() {
  const sitemap = await page(`${CATALOG}/sitemap.xml`);
  const urls = [...new Set(Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]))]
    .filter((url) => url.includes("/undergraduate/colleges-schools/") && url.split("/").length >= 8);
  const programs = [];
  for (const url of urls) {
    const html = await page(url);
    const name = text(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "");
    const kind = /\bMinor\b/.test(name) ? "minor" : /\bMajor\b/.test(name) ? "major" : null;
    if (!kind) continue;
    // The page has an overview tab (#textcontainer) and, for most programs, a requirements tab.
    const tab = (id) => {
      const start = html.indexOf(`id="${id}"`);
      if (start < 0) return "";
      const next = html.slice(start + 10).search(/<div id="[a-z]*textcontainer"/);
      return html.slice(start, next >= 0 ? start + 10 + next : undefined);
    };
    const overviewHtml = tab("textcontainer");
    const region = tab("requirementstextcontainer") || overviewHtml;
    const { items, total } = parseTables(region);
    const overview = text(overviewHtml.replace(/<table[\s\S]*?<\/table>/g, " "));
    const intro = text(/<p>([\s\S]*?)<\/p>/.exec(region)?.[1] ?? "");
    // Selective programs ask students to apply or meet entrance requirements first.
    const applySentence = `${overview} ${intro}`.split(/(?<=\.)\s+/).find((sentence) => /\b(selective|apply|application|admitted|admission|limited enrollment|entrance requirements|gateway)\b/i.test(sentence));
    programs.push({
      slug: url.replace(/\/$/, "").split("/").slice(-2).join("--").toLowerCase(),
      name, kind, url,
      total, intro: intro.slice(0, 400) || null,
      apply: applySentence ? applySentence.slice(0, 300) : null,
      items,
    });
  }

  // Course facts for every listed course and, a few levels down, their prerequisites.
  const courses = {};
  const fetchedDepartments = new Set();
  let wanted = new Set(programs.filter((program) => program.kind === "minor").flatMap((program) => program.items.flatMap((item) => item.options.flat())));
  for (let round = 0; round < 4 && wanted.size; round++) {
    const departments = [...new Set([...wanted].map((code) => code.slice(0, 4)))].filter((department) => !fetchedDepartments.has(department));
    for (const department of departments) {
      fetchedDepartments.add(department);
      try { Object.assign(courses, courseBlocks(await page(`${CATALOG}/undergraduate/approved-courses/${department.toLowerCase()}/`))); }
      catch (error) { console.warn(String(error)); }
    }
    const next = new Set();
    for (const code of wanted) for (const group of courses[code]?.pg ?? []) for (const prereq of group) if (!courses[prereq]) next.add(prereq);
    wanted = next;
  }

  // Keep only courses a minor can reach, to keep the snapshot small.
  const keep = new Set();
  const visit = (code) => {
    if (keep.has(code) || !courses[code]) return;
    keep.add(code);
    for (const group of courses[code].pg ?? []) group.forEach(visit);
  };
  programs.filter((program) => program.kind === "minor").forEach((program) => program.items.forEach((item) => item.options.flat().forEach(visit)));
  const snapshot = {
    source: CATALOG,
    builtAt: new Date().toISOString().slice(0, 10),
    programs: programs.sort((a, b) => a.name.localeCompare(b.name)),
    courses: Object.fromEntries([...keep].sort().map((code) => [code, courses[code]])),
  };
  writeFileSync(new URL("../data/umd-programs.json", import.meta.url), JSON.stringify(snapshot));
  const minors = programs.filter((program) => program.kind === "minor");
  console.log(`${minors.length} minors (${minors.filter((program) => !program.items.length).length} without a course table), ${programs.length - minors.length} majors, ${keep.size} courses`);
}

await main();
