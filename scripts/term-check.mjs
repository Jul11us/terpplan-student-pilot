// Once a term, before registration opens: what UMD has changed that TerpPlan keeps by hand. It reads the
// university's pages, compares them with this code and data, and prints only the differences; it changes nothing.
//   1. Terms: Testudo's term list against the planner's term and the class calendars in lib/term-calendar.ts.
//   2. The catalog year against the year the site names.
//   3. CS distributive areas and special topics (undergrad.cs.umd.edu) against lib/cs-major.ts.
//   4. Final exam schedules (registrar.umd.edu) against the tables in lib/final-exams.ts.
//   5. Minors' and majors' requirements in the catalog against data/umd-programs.json, rebuilt into a temporary
//      file by scripts/build-programs.mjs (about 500 pages, a few minutes; --skip-catalog leaves this out).
// Run: npm run check:term      (PROGRAM_HTML_CACHE=<dir> reuses catalog pages downloaded before)
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AREAS, TOPICS } from "../lib/cs-major.ts";
import { TERM_CALENDARS, termEnded } from "../lib/term-calendar.ts";
import { EXAM_TABLES, examsOver, LANGUAGE_COURSES, MATH_COURSES, MWF_SLOTS, TUTH_SLOTS } from "../lib/final-exams.ts";

const ROOT = new URL("..", import.meta.url);
const HEADERS = { "user-agent": "TerpPlan term check (terpplan@proton.me)" };
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");

async function page(url) {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

const SEASONS = { Spring: "01", Summer: "05", Fall: "08", Winter: "12" };
// "Fall 2026" -> "202608"; Winter 2027 is the January after Fall 2026, so "202612".
export const termCode = (season, year) => season === "Winter" ? `${Number(year) - 1}12` : `${year}${SEASONS[season]}`;
export const termName = (code) => `${Object.keys(SEASONS).find((season) => SEASONS[season] === code.slice(4))} ${Number(code.slice(0, 4)) + (code.endsWith("12") ? 1 : 0)}`;

const plain = (html) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// The department's General Track page: each "Area N" heading's list. A special topics course carries the terms it
// counts in ("course will fulfill requirement for students who are enrolled ... in Fall 2024 and Fall 2025").
export function parseCsAreas(html) {
  const areas = {}, topics = {};
  for (const section of html.split(/<h2[^>]*>/i).slice(1)) {
    const area = /^Area\s+([1-5])\b/i.exec(plain(section.split(/<\/h2>/i)[0]))?.[1];
    if (!area) continue;
    const list = section.split(/<h2/i)[0];
    for (const item of list.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
      const line = plain(item[1]);
      const number = /^CMSC\s*(\d{3}[A-Z]?)\s*\(/.exec(line)?.[1];
      if (!number) continue;
      const id = `CMSC${number}`;
      const rule = /will fulfill requirement[^)]*/i.exec(line)?.[0];
      if (!rule) { areas[id] = [...new Set([...(areas[id] ?? []), Number(area)])].sort((a, b) => a - b); continue; }
      const terms = [];
      let season = null;
      for (const token of rule.matchAll(/\b(Spring|Summer|Fall|Winter)\b|\b(20\d\d)\b/g)) {
        if (token[1]) season = token[1];
        else if (season) terms.push(termCode(season, token[2]));
      }
      topics[id] = { area: Number(area), terms: [...new Set(terms)].sort() };
    }
  }
  return { areas, topics };
}

// What the page says that lib/cs-major.ts does not, one line each.
export function compareCsAreas(page, code = { areas: AREAS, topics: TOPICS }) {
  const lines = [];
  const list = (values) => values.join(", ");
  // CMSC471 is in two areas, listed in either order.
  const sorted = (areas) => areas ? [...areas].sort((a, b) => a - b).join(",") : undefined;
  for (const id of [...new Set([...Object.keys(page.areas), ...Object.keys(code.areas)])].sort()) {
    const now = sorted(page.areas[id]), kept = sorted(code.areas[id]);
    if (now === kept) continue;
    lines.push(!kept ? `${id} is now listed in area ${now}: add it to AREAS.` : !now ? `${id} (area ${kept}) is no longer in an area list: check whether it was renumbered or dropped.` : `${id} is now area ${now}, not ${kept}.`);
  }
  for (const id of [...new Set([...Object.keys(page.topics), ...Object.keys(code.topics)])].sort()) {
    const now = page.topics[id], kept = code.topics[id];
    if (!kept) lines.push(`${id} is a new special topic for area ${now.area}, in ${list(now.terms.map(termName))}: add it to TOPICS.`);
    else if (!now) lines.push(`${id} is no longer on the page: keep its terms in TOPICS (students who took it still count it) unless the department says otherwise.`);
    else {
      const added = now.terms.filter((term) => !kept.terms.includes(term));
      const dropped = kept.terms.filter((term) => !now.terms.includes(term));
      if (now.area !== kept.area) lines.push(`${id} now counts for area ${now.area}, not ${kept.area}.`);
      if (added.length) lines.push(`${id} also counts in ${list(added.map(termName))}: add ${list(added.map((term) => `"${term}"`))} to its terms.`);
      if (dropped.length) lines.push(`${id} no longer lists ${list(dropped.map(termName))}.`);
    }
  }
  return lines;
}

// Programs added or gone, each program's requirement rows that changed, and courses whose facts changed.
export function diffPrograms(before, after) {
  const lines = [];
  const bySlug = (snapshot) => new Map(snapshot.programs.map((program) => [program.slug, program]));
  const old = bySlug(before), next = bySlug(after);
  for (const [slug, program] of next) if (!old.has(slug)) lines.push(`+ New ${program.kind}: ${program.name}`);
  for (const [slug, program] of old) if (!next.has(slug)) lines.push(`- No longer in the catalog: ${program.name} (${slug})`);
  const row = (program, item) => [program.blocks[item.block]?.title || "", item.section, item.label, item.count ?? "", item.credits ?? "", item.options.map((option) => option.join("+")).join(" / ")].filter(Boolean).join(" · ");
  const minus = (a, b) => { const left = [...b]; return a.filter((key) => { const at = left.indexOf(key); if (at < 0) return true; left.splice(at, 1); return false; }); };
  for (const [slug, program] of next) {
    const was = old.get(slug);
    if (!was) continue;
    const a = was.items.map((item) => row(was, item)), b = program.items.map((item) => row(program, item));
    const removed = minus(a, b), added = minus(b, a);
    const blocks = JSON.stringify(was.blocks.map((block) => block.title)) !== JSON.stringify(program.blocks.map((block) => block.title));
    if (!removed.length && !added.length && !blocks && was.apply === program.apply) continue;
    lines.push(`~ ${program.name}${blocks ? " (its tables were renamed or reordered)" : ""}${was.apply !== program.apply ? " (its application rule changed)" : ""}`);
    const cut = (text) => text.length > 150 ? `${text.slice(0, 148)}…` : text;
    for (const key of removed.slice(0, 6)) lines.push(`    - ${cut(key)}`);
    for (const key of added.slice(0, 6)) lines.push(`    + ${cut(key)}`);
    if (removed.length > 6 || added.length > 6) lines.push(`    … ${Math.max(0, removed.length - 6) + Math.max(0, added.length - 6)} more rows`);
  }
  const changed = Object.keys(after.courses).filter((code) => before.courses[code] && JSON.stringify(before.courses[code]) !== JSON.stringify(after.courses[code])).sort();
  if (changed.length) lines.push(`~ ${changed.length} listed course${changed.length === 1 ? "" : "s"} changed title, credits or prerequisites: ${changed.slice(0, 12).join(", ")}${changed.length > 12 ? ", …" : ""}`);
  return lines;
}

// Source files (app/, lib/, scripts/) that name a term code, for moving the planner to a new term.
function filesNaming(code) {
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(new URL(directory, ROOT), { withFileTypes: true })) {
      const path = `${directory}${entry.name}`;
      if (entry.isDirectory()) walk(`${path}/`);
      else if (/\.(ts|tsx|mjs)$/.test(entry.name) && path !== "scripts/term-check.mjs" && read(path).includes(code)) found.push(path);
    }
  };
  ["app/", "lib/", "scripts/"].forEach(walk);
  return found.sort();
}

async function checkTerms() {
  const listed = [...new Set([...(await page("https://app.testudo.umd.edu/soc/")).matchAll(/<option[^>]*value="(\d{6})"/g)].map((match) => match[1]))].sort();
  const planner = /const TESTUDO_TERM = "(\d{6})"/.exec(read("lib/umd.ts"))?.[1];
  if (!listed.length || !planner) throw new Error("Testudo's term list or lib/umd.ts's TESTUDO_TERM could not be read.");
  const lines = [];
  const ahead = listed.filter((term) => term > planner && /(01|08)$/.test(term));
  if (ahead.length) {
    const next = ahead[0];
    lines.push(`Testudo now lists ${termName(next)} (${next}); the planner is on ${termName(planner)} (${planner}). When its schedule is complete, move the planner on:`);
    lines.push(`    - lib/umd.ts: TESTUDO_TERM, and TESTUDO_TERMS (the new term and the one in progress)`);
    lines.push(`    - node scripts/add-catalog-details.mjs ${next}, then use data/${next}-catalog.json where data/${planner}-catalog.json is imported`);
    lines.push(`    - lib/cs-major.ts TOPICS and lib/term-calendar.ts for ${termName(next)} (see below)`);
    lines.push(`    - files that name ${planner}: ${filesNaming(planner).join(", ")}`);
  }
  // Terms not over yet need their class days (summer sessions differ by section, so summer has none).
  for (const term of listed.filter((term) => !term.endsWith("05") && !termEnded(term, new Date()))) {
    if (!TERM_CALENDARS[term]) lines.push(`No class calendar for ${termName(term)} (${term}) in lib/term-calendar.ts: add its first and last class days and breaks from https://provost.umd.edu/calendar (calendar export and My week use them).`);
  }
  return { ok: `Testudo lists ${listed.map(termName).join(", ")}; the planner is on ${termName(planner)}, and the terms not over yet have class calendars.`, lines };
}

async function checkCatalogYear() {
  const year = /(\d{4})-(\d{4}) Catalog/.exec(await page("https://academiccatalog.umd.edu/undergraduate/"));
  if (!year) throw new Error("The catalog's year could not be read.");
  const current = `${year[1]}–${year[2]}`;
  const lines = [];
  const walk = (directory) => {
    for (const entry of readdirSync(new URL(directory, ROOT), { withFileTypes: true })) {
      const path = `${directory}${entry.name}`;
      if (entry.isDirectory()) { walk(`${path}/`); continue; }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const source = read(path).split("\n");
      source.forEach((text, index) => {
        // "catalog" may follow on the next line of a comment.
        const near = `${text} ${source[index + 1] ?? ""}`;
        for (const match of text.matchAll(/\b(20\d\d)[–-](20\d\d)\b/g)) {
          if (/catalog/i.test(near) && `${match[1]}–${match[2]}` !== current) lines.push(`${path}:${index + 1} names the ${match[1]}–${match[2]} catalog; the catalog is now ${current}.`);
        }
      });
    }
  };
  ["app/", "lib/"].forEach(walk);
  if (lines.length) lines.push(`A new catalog year usually also changes requirements: run this check without --skip-catalog, and check the CS rules in lib/cs-major.ts against the new catalog.`);
  return { ok: `The catalog is ${current}, as the site says.`, lines };
}

async function checkCs() {
  const listed = parseCsAreas(await page("https://undergrad.cs.umd.edu/general-track-degree-requirements"));
  if (!Object.keys(listed.areas).length) throw new Error("No area lists were found on the department's page; its layout may have changed.");
  const lines = compareCsAreas(listed);
  if (lines.length) lines.push(`Then update lib/cs-major.ts (AREAS, TOPICS) and tests/cs-major.test.mjs if a case there changed.`);
  return { ok: `The department's areas and special topics match lib/cs-major.ts.`, lines };
}

// A Registrar final exam page: its term ("Fall 2026 Final Exams") and the courses in its common exam list.
export function parseExamPage(html) {
  const text = plain(html.replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")).replace(/The Current Page is /g, "");
  const title = /(Spring|Fall) (20\d\d) Final Exams/.exec(text);
  const commonAt = text.search(/Common Final Exam/i);
  const courses = new Set();
  if (commonAt >= 0) for (const match of text.slice(commonAt).matchAll(/\b([A-Z]{4}) ?(\d{3}[A-Z]?)\b/g)) courses.add(match[1] + match[2]);
  if (/STAT\/DATA100/.test(text)) { courses.add("STAT100"); courses.add("DATA100"); }
  return { term: title ? termCode(title[1], title[2]) : null, courses };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CLOCK = String.raw`\d{1,2}(?::\d{2})?\s*[ap]\.?\s?m\.?`;
const DATE = String.raw`(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(${MONTHS.join("|")})\s+(\d{1,2})`;

// "8am", "1:30pm", "4 p.m.", "10:30 a.m." -> minutes after midnight.
export function clockMinutes(text) {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*([ap])/i.exec(text.trim());
  if (!match) return null;
  const hour = Number(match[1]) % 12 + (match[3].toLowerCase() === "p" ? 12 : 0);
  return hour * 60 + Number(match[2] ?? 0);
}

// The page's exam slots: standard ones by class start time (MWF and TuTh lists), and common ones by course, each
// with its date ("2026-12-14") and exam time in minutes.
export function parseExamSlots(html, year) {
  const text = plain(html.replace(/<(script|style)[\s\S]*?<\/\1>/g, " "));
  const mwfAt = text.search(/Courses meeting on MWF/i), tuthAt = text.search(/Courses meeting on TuTh/i);
  // The common list comes after the TuTh list (the page also names it once near the top, in its contents).
  const commonFrom = tuthAt >= 0 ? text.slice(tuthAt).search(/Common Final Exam/i) + tuthAt : -1;
  const date = (month, day) => `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const standard = (part) => [...part.matchAll(new RegExp(String.raw`(${CLOCK})\s*-\s*(${CLOCK})\s+${DATE}\s+(${CLOCK})\s*-\s*(${CLOCK})`, "gi"))]
    .map((match) => ({ from: clockMinutes(match[1]), to: clockMinutes(match[2]), date: date(match[3], match[4]), start: clockMinutes(match[5]), end: clockMinutes(match[6]) }));
  const common = commonFrom < tuthAt ? [] : [...text.slice(commonFrom).matchAll(new RegExp(String.raw`\b([A-Z]{4} ?\d{3}[A-Z]?|STAT/DATA100|LANGUAGES|MATH)\b.{0,60}?${DATE}\s+(${CLOCK})\s*-\s*(${CLOCK})`, "g"))]
    .map((match) => ({ label: match[1].replace(" ", ""), date: date(match[2], match[3]), start: clockMinutes(match[4]), end: clockMinutes(match[5]) }));
  return { mwf: mwfAt >= 0 && tuthAt > mwfAt ? standard(text.slice(mwfAt, tuthAt)) : [], tuth: commonFrom > tuthAt ? standard(text.slice(tuthAt, commonFrom)) : [], common };
}

const clockText = (minutes) => `${Math.floor(minutes / 60) % 12 || 12}:${String(minutes % 60).padStart(2, "0")}${minutes < 720 ? "am" : "pm"}`;

// Slots whose date or time on the page differs from a table (or that only one side has).
export function compareExamSlots(page, table, slots = { mwf: MWF_SLOTS, tuth: TUTH_SLOTS }) {
  const lines = [];
  const at = (time) => `${table.dates[time.day] ?? "?"} ${clockText(time.start)}–${clockText(time.end)}`;
  const shown = (row) => `${row.date} ${clockText(row.start)}–${clockText(row.end)}`;
  for (const [name, label] of [["mwf", "MWF"], ["tuth", "TuTh"]]) {
    const listed = page[name];
    if (!listed.length) { lines.push(`No ${label} standard slots could be read from the page; its layout may have changed.`); continue; }
    for (const row of listed) {
      const ours = slots[name].find(([from, to]) => from === row.from && to === row.to);
      if (!ours) lines.push(`${label} classes starting ${clockText(row.from)}–${clockText(row.to)}: on the page (${shown(row)}) but not in the table.`);
      else if (at(ours[2]) !== shown(row)) lines.push(`${label} classes starting ${clockText(row.from)}–${clockText(row.to)}: the page says ${shown(row)}, the table ${at(ours[2])}.`);
    }
    for (const [from, to] of slots[name]) if (!listed.some((row) => row.from === from && row.to === to)) lines.push(`${label} classes starting ${clockText(from)}–${clockText(to)}: in the table but not on the page.`);
  }
  const groups = { "STAT/DATA100": ["STAT100", "DATA100"], LANGUAGES: LANGUAGE_COURSES, MATH: MATH_COURSES };
  for (const row of page.common) {
    for (const course of groups[row.label] ?? [row.label]) {
      const ours = table.common[course];
      if (ours && at(ours) !== shown(row)) lines.push(`${course} common exam: the page says ${shown(row)}, the table ${at(ours)}.`);
    }
  }
  return lines;
}

// Courses whose common exam differs between the page and a table. MATH courses are listed by number in a note, so
// only the first MATH code can be read from the page and MATH is not checked for removals.
export function compareExamCourses(listed, table) {
  const lines = [];
  const known = new Set(Object.keys(table));
  const added = [...listed].filter((course) => !known.has(course)).sort();
  const dropped = [...known].filter((course) => !listed.has(course) && !course.startsWith("MATH")).sort();
  if (added.length) lines.push(`Common exams on the Registrar's page but not in the table: ${added.join(", ")}.`);
  if (dropped.length) lines.push(`Common exams in the table but no longer on the Registrar's page: ${dropped.join(", ")}.`);
  return lines;
}

async function checkExams() {
  const lines = [], seen = [], pages = new Map();
  for (const season of ["fall", "spring"]) {
    const url = `https://registrar.umd.edu/registration/register-classes/final-exams/${season}`;
    pages.set(url, await page(url));
    const { term, courses } = parseExamPage(pages.get(url));
    if (!term) throw new Error(`${url} names no term; its layout may have changed.`);
    seen.push(termName(term));
    if (!EXAM_TABLES[term]) {
      lines.push(`The Registrar has posted ${termName(term)} final exams (${url}); lib/final-exams.ts has no table for ${term}, so the site still estimates it. Add its exam dates and common exams.`);
      continue;
    }
    const html = pages.get(url);
    const slots = parseExamSlots(html, term.slice(0, 4));
    for (const line of [...compareExamCourses(courses, EXAM_TABLES[term].common), ...compareExamSlots(slots, EXAM_TABLES[term])]) lines.push(`${termName(term)}: ${line}`);
  }
  // Six weeks before the term ends, Testudo lists each course's own exam time and room; until then it says the
  // official schedule is not available.
  for (const term of Object.keys(EXAM_TABLES).filter((code) => !examsOver(code, new Date()))) {
    const url = `https://app.testudo.umd.edu/soc/exam/search?courseId=CMSC&sectionId=&termId=${term}`;
    if (!/not available until mid-semester/i.test(await page(url))) lines.push(`Testudo now lists exact ${termName(term)} final exams (${url}). Spot-check a few courses against the site's exam times, and tell students to go by Testudo.`);
  }
  if (lines.length) lines.push(`Then update EXAM_TABLES in lib/final-exams.ts and run npm test.`);
  return { ok: `The Registrar's ${seen.join(" and ")} final exam schedules match lib/final-exams.ts.`, lines };
}

function checkPrograms() {
  const directory = mkdtempSync(join(tmpdir(), "terpplan-programs-"));
  const out = join(directory, "umd-programs.json");
  try {
    console.log("    Rebuilding the catalog snapshot into a temporary file (a few minutes)…");
    const run = spawnSync(process.execPath, [fileURLToPath(new URL("scripts/build-programs.mjs", ROOT)), "--out", out], { stdio: ["ignore", "inherit", "inherit"], env: process.env });
    if (run.status !== 0) throw new Error("scripts/build-programs.mjs did not finish.");
    const lines = diffPrograms(JSON.parse(read("data/umd-programs.json")), JSON.parse(readFileSync(out, "utf8")));
    if (lines.length) lines.push(`To take them: node scripts/build-programs.mjs, bump PROGRAMS_DATA_VERSION in lib/programs.ts, and run npm test.`);
    return { ok: "The catalog's minors and majors match data/umd-programs.json.", lines };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function main() {
  const skipCatalog = process.argv.includes("--skip-catalog");
  console.log(`TerpPlan term check · ${new Date().toISOString().slice(0, 10)} · nothing is changed\n`);
  const sections = [["1. Terms", checkTerms], ["2. Catalog year", checkCatalogYear], ["3. CS areas and special topics", checkCs], ["4. Final exams", checkExams], ...(skipCatalog ? [] : [["5. Catalog requirements", checkPrograms]])];
  let failed = false, found = 0;
  for (const [title, check] of sections) {
    console.log(title);
    try {
      const { ok, lines } = await check();
      if (!lines.length) console.log(`    ✓ ${ok}`);
      for (const line of lines) console.log(line.startsWith("    ") ? `    ${line}` : `    ! ${line}`);
      found += lines.length;
    } catch (error) {
      failed = true;
      console.log(`    ✗ Could not check: ${error instanceof Error ? error.message : error}`);
    }
    console.log("");
  }
  if (skipCatalog) console.log("Catalog requirements were skipped (--skip-catalog).");
  console.log(found ? "Review the lines marked ! above; nothing was changed." : failed ? "Some checks could not run; nothing was changed." : "Nothing to update this term.");
  if (failed) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
