import assert from "node:assert/strict";
import test from "node:test";
import { compareCsAreas, diffPrograms, parseCsAreas, termCode, termName } from "../scripts/term-check.mjs";

// The shape of undergrad.cs.umd.edu/general-track-degree-requirements: an <h2> per area, then a list.
const page = `
<h2>Area 1: Systems</h2>
<ul>
<li>CMSC 412 (4) Operating Systems <span style="color:#ff0000">*</span></li>
<li>CMSC 498B (3) Selected Topics in Computer Science; Cloud Computing (course will fulfill requirement for students who are enrolled the course in Fall 2024 and Fall 2025 semesters <em>*only*</em>)</li>
</ul>
<h2>Area 3: Software Engineering and Programming Languages</h2>
<ul>
<li>CMSC 431 (3) Privacy Engineering (formerly CMSC 498G)</li>
<li>CMSC 471 (3) Introduction to Data Visualization</li>
<li>CMSC 498G (3) Special Topics in Computer Science; Introduction to Privacy (course will fulfill requirement for students who are enrolled in the course in Spring 2025 and 2026)</li>
</ul>
<h2>Area 2: Information Processing</h2>
<ul><li>CMSC 471 (3) Introduction to Data Visualization</li></ul>
<h2>CMSC Upper Level Electives</h2>
<ul><li>CMSC 498A (1 - 3) Selected Topics in Computer Science; Independent Study</li></ul>`;

test("term codes and names: winter goes by the January after the fall", () => {
  assert.deepEqual([termCode("Fall", "2026"), termCode("Spring", "2027"), termCode("Winter", "2027"), termCode("Summer", "2027")], ["202608", "202701", "202612", "202705"]);
  assert.deepEqual(["202608", "202612", "202701"].map(termName), ["Fall 2026", "Winter 2027", "Spring 2027"]);
});

test("the department's area lists: courses by area, special topics with the terms they count in", () => {
  const parsed = parseCsAreas(page);
  assert.deepEqual(parsed.areas, { CMSC412: [1], CMSC431: [3], CMSC471: [2, 3] }, "electives below the areas are left out");
  assert.deepEqual(parsed.topics, { CMSC498B: { area: 1, terms: ["202408", "202508"] }, CMSC498G: { area: 3, terms: ["202501", "202601"] } }, "\"Spring 2025 and 2026\"");
  assert.deepEqual(compareCsAreas(parsed, { areas: { CMSC412: [1], CMSC431: [3], CMSC471: [2, 3] }, topics: parsed.topics }), [], "CMSC471 in two areas is the same either way round");
});

test("what the page says that the code does not is reported, one line each", () => {
  const parsed = parseCsAreas(page);
  const lines = compareCsAreas(parsed, {
    areas: { CMSC412: [1], CMSC471: [2, 3], CMSC417: [1] },
    topics: { CMSC498B: { area: 1, terms: ["202408"] }, CMSC498X: { area: 1, terms: ["202008"] } },
  });
  assert.equal(lines.length, 5);
  assert.match(lines.find((line) => line.startsWith("CMSC431")), /now listed in area 3/);
  assert.match(lines.find((line) => line.startsWith("CMSC417")), /no longer in an area list/);
  assert.match(lines.find((line) => line.startsWith("CMSC498B")), /also counts in Fall 2025: add "202508"/);
  assert.match(lines.find((line) => line.startsWith("CMSC498G")), /new special topic for area 3, in Spring 2025, Spring 2026/);
  assert.match(lines.find((line) => line.startsWith("CMSC498X")), /keep its terms/);
});

test("a rebuilt catalog snapshot against the bundled one: programs added or gone, rows changed, course facts changed", () => {
  const program = (slug, items, extra = {}) => ({ slug, name: slug, kind: "minor", blocks: [{ title: "", role: "always", total: null }], apply: null, items, ...extra });
  const item = (label, options, extra = {}) => ({ kind: "course", section: "", label, credits: 3, options, block: 0, ...extra });
  const before = {
    programs: [program("same", [item("AAAA100", [["AAAA100"]])]), program("changed", [item("BBBB100", [["BBBB100"]]), item("BBBB200", [["BBBB200"]])]), program("gone", [])],
    courses: { AAAA100: { n: "A", c: 3 }, BBBB100: { n: "B", c: 3 } },
  };
  const after = {
    programs: [program("same", [item("AAAA100", [["AAAA100"]])]), program("changed", [item("BBBB200", [["BBBB200"]]), item("BBBB300", [["BBBB300"], ["BBBB301"]])], { apply: "Students must apply." }), program("new", [])],
    courses: { AAAA100: { n: "A", c: 3 }, BBBB100: { n: "B", c: 4 } },
  };
  assert.deepEqual(diffPrograms(before, after), [
    "+ New minor: new",
    "- No longer in the catalog: gone (gone)",
    "~ changed (its application rule changed)",
    "    - BBBB100 · 3 · BBBB100",
    "    + BBBB300 · 3 · BBBB300 / BBBB301",
    "~ 1 listed course changed title, credits or prerequisites: BBBB100",
  ]);
  assert.deepEqual(diffPrograms(before, before), [], "the same snapshot: nothing to report");
});

test("a Registrar final exam page: its term and common exams, compared with a table", async () => {
  const { parseExamPage, compareExamCourses } = await import("../scripts/term-check.mjs");
  const html = `<main><h1>Fall 2027 Final Exams</h1><p>Standard: 8am - 8:45am Monday</p><h2>Common Final Exam Time Slots</h2>
    <table><tr><td>CMSC131</td><td>Wednesday</td></tr><tr><td>STAT/DATA100</td></tr><tr><td>KORA 102</td></tr></table><p>MATH003, 107, 140H</p></main>`;
  const page = parseExamPage(html);
  assert.equal(page.term, "202708");
  assert.deepEqual([...page.courses].sort(), ["CMSC131", "DATA100", "KORA102", "MATH003", "STAT100"]);
  const table = { CMSC131: {}, CMSC132: {}, STAT100: {}, DATA100: {}, KORA102: {}, MATH003: {}, MATH140: {} };
  assert.deepEqual(compareExamCourses(page.courses, table), ["Common exams in the table but no longer on the Registrar's page: CMSC132."]);
});

test("Registrar exam slots: dates and times are read and compared with a table, not only course names", async () => {
  const { parseExamSlots, compareExamSlots, clockMinutes } = await import("../scripts/term-check.mjs");
  assert.deepEqual(["8am", "1:30pm", "4 p.m.", "10:30 a.m.", "12pm"].map(clockMinutes), [480, 810, 960, 630, 720]);
  const html = `<main><a>Common Time Slots</a><h2>Standard</h2><p>Courses meeting on MWF, MW, M, W, or F:</p>
    <table><tr><td>8am - 8:45am</td><td>Monday, December 13</td><td>1:30pm - 3:30pm</td></tr><tr><td>9am - 9:45am</td><td>Thursday, December 16</td><td>1:30pm - 3:30pm</td></tr></table>
    <p>Courses meeting on TuTh, Tu, or Th:</p><table><tr><td>8am - 9:15am</td><td>Friday, December 17</td><td>1:30 p.m. - 3:30 p.m.</td></tr></table>
    <h2>Common Final Exam Time Slots</h2><table><tr><td>CMSC330</td><td>Tuesday, December 14</td><td>6:30pm - 8:30pm</td></tr>
    <tr><td>MATH <a>see note 2</a> for courses</td><td>Monday, December 13</td><td>4pm - 6pm</td></tr></table></main>`;
  const page = parseExamSlots(html, "2027");
  assert.deepEqual(page.mwf[0], { from: 480, to: 525, date: "2027-12-13", start: 810, end: 930 });
  assert.equal(page.tuth.length, 1);
  assert.deepEqual(page.common.map((row) => row.label), ["CMSC330", "MATH"]);
  const slot = (day, start, end) => ({ day, start, end });
  const table = { dates: ["2027-12-13", "2027-12-14", "2027-12-15", "2027-12-16", "2027-12-17", "2027-12-20"], common: { CMSC330: slot(1, 1110, 1230), MATH140: slot(0, 990, 1110) } };
  const slots = { mwf: [[480, 525, slot(0, 810, 930)], [540, 585, slot(3, 810, 930)], [600, 645, slot(5, 630, 750)]], tuth: [[480, 555, slot(4, 810, 930)]] };
  assert.deepEqual(compareExamSlots(page, table, slots), [
    "MWF classes starting 10:00am–10:45am: in the table but not on the page.",
    "MATH140 common exam: the page says 2027-12-13 4:00pm–6:00pm, the table 2027-12-13 4:30pm–6:30pm.",
  ]);
});
