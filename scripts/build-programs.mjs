// Builds data/umd-programs.json from the UMD undergraduate catalog (academiccatalog.umd.edu):
// each minor's and major's requirement tables, plus credits and prerequisites for the courses they list.
// Run: node scripts/build-programs.mjs            (set PROGRAM_HTML_CACHE=<dir> to reuse downloaded pages)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prerequisiteGroups } from "./prerequisites.mjs";

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
// Wording that always starts a new list, even right after another one.
const STRONG_CHOICE = /select|choose|one of|two of|three of|of the following|from the following/i;

// Which catalog tables apply by default. A program often lists alternatives in separate tables under
// headings ("Bachelor of Science", "Data Science Specialization", "Track 2"); the student picks those.
const ALWAYS_BLOCK = /all speciali|all students|required of all|all tracks/i;
const CHOICE_BLOCK = /track|speciali[sz]ation|concentration|option\b|bachelor of|\bB\.[AS]\.|degree|field|emphasis|suggested|sample|recommended/i;
const CORE_BLOCK = /^$|required|core|prerequisite|requirements?:?$|foundation|first & second|prior study|benchmark|pre-professional|professional courses|elective|additional/i;

function blockRole(title, kind) {
  if (ALWAYS_BLOCK.test(title)) return "always";
  if (CHOICE_BLOCK.test(title)) return "choice";
  if (CORE_BLOCK.test(title)) return "always";
  // Minors rarely offer alternatives; an unexplained heading in a major usually names one.
  return kind === "minor" ? "always" : "choice";
}

// Splits the requirements tab into blocks, one per course-list table, titled by the heading above it.
function parseBlocks(html, kind) {
  const blocks = [];
  const items = [];
  let heading = "";
  for (const match of html.matchAll(/<(h[2-5])[^>]*>([\s\S]*?)<\/\1>|<table class="sc_courselist"[\s\S]*?<\/table>/g)) {
    if (match[1]) { heading = text(match[2]); continue; }
    const parsed = parseTable(match[0]);
    if (!parsed.items.length) continue;
    const block = blocks.length;
    blocks.push({ title: heading, role: blockRole(heading, kind), total: parsed.total });
    items.push(...parsed.items.map((item) => ({ ...item, block })));
  }
  // With only alternatives (B.A. or B.S.), the first one is the default.
  if (blocks.length && !blocks.some((block) => block.role === "always")) blocks[0].role = "default";
  return { blocks, items };
}

// Turns one catalog course-list table into requirement items:
//   course: one required course; any listed option (a bundle like "GEOL100 & GEOL110") satisfies it.
//   choose: pick `count` options (or `credits` worth) from the list.
function parseTable(table) {
  const items = [];
  let total = null;
  {
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
        if (group && !group.options.length && hours === null && !/areaheader/.test(rowClass)) continue;
        // "Maximum 3 credits from the following" adds capped choices to the list above it.
        const previous = items.at(-1);
        if (/^(maximum|at most|up to)\b/i.test(label) && previous?.kind === "choose") {
          group = previous;
          group.indented = false;
          continue;
        }
        // Inside an open list, a heading without its own credits is a sub-heading of that list:
        // "Sequence Two (9 credits)" names one alternative, "Lower Level Electives" or "Minimum 3 credits
        // from ..." splits the pool of a list that already states its total.
        const alternativeName = /^(sequence|option|pathway)\s+\w+/i.test(label);
        const minimumNote = /^(minimum|at least)\b/i.test(label);
        const plainHeading = !STRONG_CHOICE.test(label);
        if (group && hours === null && (alternativeName || (group.options.length && (plainHeading || minimumNote)) || (minimumNote && group.credits))) {
          section = label;
          group.indented = false;
          continue;
        }
        const count = choiceCount(label);
        const labelCredits = /(\d+)\s*(?:credits?|semester hours)/i.exec(label);
        if (hours !== null || count !== null || CHOICE_LABEL.test(label)) {
          // "Minimum of 9 credits from the following" states its credits in the label.
          const credits = hours ?? (labelCredits && /minimum|at least|from|select|choose/i.test(label) ? Number(labelCredits[1]) : null);
          // "Select eight courses ...; must include:" is a parent of the lists that follow; its own rows are
          // the named must-take courses, and the lists below already carry the rest of its credits.
          const parent = /(must include|including):?$/i.test(label);
          group = { kind: "choose", section, label, count: parent || (labelCredits && count === Number(labelCredits[1])) ? null : count, credits: parent ? null : credits, options: [], header: /areaheader/.test(rowClass) };
          items.push(group);
        } else {
          section = label;
          // A plain sub-heading inside a list ("Area 2: Information Processing" under "Select five
          // courses from these areas") keeps the list open for the course rows below it.
          // A credit heading ("Lower Level Requirements · 6") stays open over its sub-lists too.
          if (!group?.options.length && !(group?.header && group.credits)) group = null;
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
  return { items: items.filter((item) => item.options.length || (item.kind === "choose" && item.credits)).map((item) => { delete item.indented; delete item.header; return item; }), total };
}

function courseBlocks(html) {
  const courses = {};
  for (const block of html.split('<div class="courseblock">').slice(1)) {
    const title = text(/<p class="courseblocktitle[^"]*">([\s\S]*?)<\/p>/.exec(block)?.[1] ?? "");
    const head = /^([A-Z]{4}\d{3}[A-Z]?)\s+(.*?)\s*\((\d+(?:\.\d+)?)(?:-\d+)?\s+Credits?\)/i.exec(title);
    if (!head) continue;
    const prereqHtml = /<strong>\s*Prerequisite:?\s*<\/strong>([\s\S]*?)<\/p>/i.exec(block)?.[1] ?? "";
    const prereqText = text(prereqHtml);
    const groups = prerequisiteGroups(prereqText, head[1]);
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
    const { blocks, items } = parseBlocks(region, kind);
    const overview = text(overviewHtml.replace(/<table[\s\S]*?<\/table>/g, " "));
    const intro = text(/<p>([\s\S]*?)<\/p>/.exec(region)?.[1] ?? "");
    // Selective programs ask students to apply or meet entrance requirements first.
    // "Admission to the Major" is a heading on nearly every major page, so it is not a signal by itself.
    const gate = /\b(is selective|selective admission|limited enrollment program|to apply(?= please|,|:| for (?:the|admission)| to the (?:minor|major|program))|apply (?:to|for) (?:the|this) (?:minor|major|program)|application (?:to the|for the|form)|admission requirements|admitted to the (?:minor|major|program)|entrance requirements|gateway requirements)\b/gi;
    const applyText = `${overview} ${intro}`;
    // "... is not a Limited Enrollment Program" says the opposite.
    const gateMatch = [...applyText.matchAll(gate)].find((match) => !/\bnot (?:an? )?$/i.test(applyText.slice(Math.max(0, match.index - 12), match.index)));
    // The sentence around the match; catalog text often lacks periods between headings.
    const sentenceStart = gateMatch ? applyText.lastIndexOf(". ", gateMatch.index) + 2 : 0;
    const snippetStart = Math.max(0, sentenceStart, (gateMatch?.index ?? 0) - 120);
    // The catalog often says "information on how to apply can be found at <link>"; keep that link.
    const gateTest = new RegExp(gate.source, "i");
    const gateParagraph = gateMatch ? (`${overviewHtml} ${region}`.match(/<p[\s>][\s\S]*?<\/p>/g) ?? []).find((paragraph) => gateTest.test(text(paragraph))) : null;
    const applyUrl = gateParagraph ? /href="(https?:\/\/[^"]+)"/.exec(gateParagraph)?.[1] ?? null : null;
    const applySentence = gateMatch ? applyText.slice(snippetStart, gateMatch.index + 200).replace(snippetStart > sentenceStart ? /^\S*\s+/ : /^/, "").replace(/\s+\S*$/, "").trim() : null;
    programs.push({
      slug: url.replace(/\/$/, "").split("/").slice(-2).join("--").toLowerCase(),
      name, kind, url,
      intro: intro.slice(0, 400) || null,
      apply: applySentence ? applySentence.slice(0, 300) : null,
      applyUrl,
      blocks, items,
    });
  }

  // Course facts for every listed course and, a few levels down, their prerequisites.
  const courses = {};
  const fetchedDepartments = new Set();
  let wanted = new Set(programs.flatMap((program) => program.items.flatMap((item) => item.options.flat())));
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

  // Keep only courses a program can reach, to keep the snapshot small.
  const keep = new Set();
  const visit = (code) => {
    if (keep.has(code) || !courses[code]) return;
    keep.add(code);
    for (const group of courses[code].pg ?? []) group.forEach(visit);
  };
  programs.forEach((program) => program.items.forEach((item) => item.options.flat().forEach(visit)));
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
