import assert from "node:assert/strict";
import test from "node:test";
import {
  addCourses, checkRoadmap, courseCredits, emptyRoadmap, fallOf, GEN_ED_ROWS, genEdTable, moveCourse, parseRoadmap, removeCourse,
  roadmapHasCourses, roadmapTerms, termAt, termYear, yearTerms,
} from "../lib/roadmap.ts";
import { parseDegreeAudit } from "../lib/degree-audit.ts";
import { parseTaken } from "../lib/taken-courses.ts";
import { parseSavedState } from "../lib/saved-state.ts";
import { parseSyncState, syncStateEmpty } from "../lib/plan-sync.ts";
import { GET as catalog } from "../app/api/catalog/route.ts";

const course = (credits, extra = {}) => ({ name: "Course", credits, ge: [], pr: null, terms: ["202701"], ...extra });

test("a plan's terms run fall, winter, spring, summer, and winter goes by the January after its fall", () => {
  assert.deepEqual(yearTerms("202608", 0), { fall: "202608", spring: "202701", winter: "202612", summer: "202705" });
  const terms = roadmapTerms({ start: "202608", years: 4 });
  assert.equal(terms.length, 16);
  assert.deepEqual(terms.slice(0, 5), ["202608", "202612", "202701", "202705", "202708"]);
  assert.equal(termYear("202612"), 2027);
  assert.deepEqual([new Date(2026, 9, 17), new Date(2027, 0, 10), new Date(2027, 2, 1), new Date(2027, 5, 15)].map(termAt), ["202608", "202612", "202701", "202705"]);
  assert.deepEqual(["202608", "202612", "202701", "202705"].map(fallOf), ["202608", "202608", "202608", "202608"]);
});

test("a saved plan keeps only real course codes in its own terms", () => {
  const plan = parseRoadmap({ start: "202608", years: 9, terms: { 202701: ["CMSC132", "CMSC132", "bad", 7], 203508: ["MATH240"], 202608: [] }, earlier: ["MATH140", "MATH140"], credits: { CMSC499: 3, CMSC132: 40, nope: 2 } });
  assert.deepEqual(plan, { start: "202608", years: 4, terms: { 202701: ["CMSC132"] }, earlier: ["MATH140"], credits: { CMSC499: 3 } });
  assert.equal(parseRoadmap({ start: "202601", years: 4 }), undefined, "year 1 starts in a fall");
  assert.equal(roadmapHasCourses(plan), true);
  assert.equal(roadmapHasCourses(emptyRoadmap("202608")), false);
});

test("courses move between terms, and filling in never moves what the student placed", () => {
  let plan = emptyRoadmap("202608");
  plan = addCourses(plan, [{ id: "CMSC131", term: "202608" }, { id: "MATH140", term: null }, { id: "ECON200", term: "202508" }, { id: "CMSC499", term: "203208" }]);
  assert.deepEqual(plan.terms, { 202608: ["CMSC131"] });
  assert.deepEqual(plan.earlier, ["MATH140", "ECON200"], "no term, or a term before year 1, is before the plan");
  plan = moveCourse(plan, "CMSC131", "202701");
  assert.deepEqual(plan.terms, { 202701: ["CMSC131"] });
  plan = addCourses(plan, [{ id: "CMSC131", term: "202608" }]);
  assert.deepEqual(plan.terms, { 202701: ["CMSC131"] }, "already placed: left where it is");
  plan = removeCourse({ ...plan, credits: { CMSC131: 3 } }, "CMSC131");
  assert.deepEqual([plan.terms, plan.credits], [{}, undefined]);
});

test("checks prerequisite order, fall-only and spring-only courses, repeats and credit limits for the terms ahead", () => {
  const plan = { start: "202608", years: 4, earlier: ["MATH140"], terms: {
    202608: ["CMSC131", "MATH141"],
    202612: ["ENGL101", "COMM107"],
    202701: ["CMSC132", "CMSC250", "CMSC216"],
    202708: ["CMSC351", "CMSC131"],
  }, credits: { ENGL101: 3 } };
  const info = {
    CMSC131: course("4"), MATH141: course("4", { pr: "MATH140" }), ENGL101: course("1–3"), COMM107: course("3"),
    CMSC132: course("4", { pr: "CMSC131" }), CMSC250: course("4", { pr: ["&", "~CMSC132", "MATH141"] }), CMSC216: course("4", { pr: "CMSC132" }),
    CMSC351: course("3", { pr: ["&", "CMSC216", "CMSC250"] }),
  };
  const check = checkRoadmap(plan, info, { CMSC250: "fall", CMSC351: "spring" }, "202608");
  assert.equal(check.issues["202608|MATH141"], undefined, "the term under way is not checked");
  assert.equal(check.issues["202701|CMSC250"].some((issue) => issue.kind === "prereq"), false, "CMSC132 may be taken alongside");
  assert.deepEqual(check.issues["202701|CMSC216"], [{ kind: "prereq", missing: ["CMSC132"] }], "CMSC132 has to come first");
  assert.deepEqual(check.issues["202701|CMSC250"], [{ kind: "season", only: "fall" }]);
  assert.deepEqual(check.issues["202708|CMSC351"], [{ kind: "season", only: "spring" }], "its prerequisites were taken the spring before");
  assert.deepEqual(check.issues["202708|CMSC131"], [{ kind: "repeat" }]);
  assert.deepEqual([check.terms["202612"].credits, check.terms["202612"].over, check.terms["202612"].limit], [6, true, 4], "winter allows 4 credits");
  assert.equal(check.terms["202701"].partTime, false);
  assert.equal(check.terms["202708"].partTime, true, "7 credits is part time");
  assert.equal(courseCredits("ENGL101", info.ENGL101, {}), 1, "the low end of a range");
  assert.equal(check.total, 8 + 6 + 12 + 7, "the student's own number for ENGL101; MATH140 is not in the catalog list");
  assert.deepEqual(check.earlierUnknown, ["MATH140"]);
});

test("the Gen Ed rows are filled the way that covers the most, earlier courses first", () => {
  const rows = genEdTable([
    { id: "ENGL101", term: null, groups: [["FSAW"]] },
    { id: "ARTH200", term: "202608", groups: [["DSHU", "DSSP"]] },
    { id: "HIST200", term: "202701", groups: [["DSHU"]] },
    { id: "PHIL100", term: "202708", groups: [["DSHU"]] },
    { id: "BSCI170", term: "202608", groups: [["DSNL"]] },
    { id: "CHEM131", term: "202701", groups: [["DSNL"]] },
    { id: "AAAS100", term: "202608", groups: [["DSHS"], ["DVUP"]] },
    { id: "SOCY230", term: "202701", groups: [["DSHS"], ["DVUP"], ["SCIS"]] },
    { id: "ANTH260", term: "202708", groups: [["DVCC"]] },
  ]);
  assert.equal(rows.length, GEN_ED_ROWS.length);
  const filled = (need) => rows.filter((row) => row.need === need).map((row) => row.id);
  assert.deepEqual(filled("FSAW"), ["ENGL101"]);
  assert.deepEqual(filled("DSHU"), ["HIST200", "PHIL100"]);
  assert.deepEqual(filled("DSSP"), ["ARTH200", null], "ARTH200 counts where nothing else can");
  assert.deepEqual([...filled("DSNL"), ...filled("DSNS")], ["BSCI170", "CHEM131"], "a second lab course fills the other science row");
  assert.deepEqual([...filled("DVUP"), ...filled("DIV")], ["AAAS100", "SOCY230"]);
  assert.deepEqual(filled("SCIS"), ["SOCY230", null]);
  assert.equal(rows.find((row) => row.id === "ENGL101").term, null, "before the plan");
});

test("the degree audit gives each course its term, but not AP or transfer credit", () => {
  const audit = parseDegreeAudit(`Fa26 CMSC131 4.0 IP Object-Oriented Programming I
Sp26 MATH140 4.0 A Calculus I
Fa25 ECON201 3.0 TP Principles of Macroeconomics
Wi26 COMM107 3.0 B Oral Communication
S126 ENGL101 3.0 A- Academic Writing
Sp25 CMSC132 4.0 F Object-Oriented Programming II`);
  assert.deepEqual(audit.courseTerms, { CMSC131: "202608", MATH140: "202601", COMM107: "202512", ENGL101: "202605" });
  const taken = parseTaken({ completed: ["MATH140", "ECON201"], inProgress: ["CMSC131"], terms: { MATH140: "202601", CMSC131: "202608", STAT400: "202608", ECON201: "bad" }, source: "audit" });
  assert.deepEqual(taken.terms, { MATH140: "202601", CMSC131: "202608" });
});

test("the four-year plan is saved and synced with the rest of the planner", () => {
  const roadmap = { start: "202608", years: 4, terms: { 202701: ["CMSC132"] }, earlier: [] };
  assert.deepEqual(parseSavedState({ plans: {}, roadmap }).roadmap, roadmap);
  assert.equal(syncStateEmpty(parseSyncState({ saved: { plans: {}, roadmap } })), false);
  assert.equal(syncStateEmpty(parseSyncState({ saved: { plans: {}, roadmap: { ...roadmap, terms: {} } } })), true);
});

test("the catalog API covers courses listed in either Fall 2026 or Spring 2027", async () => {
  const ask = async (params) => (await catalog(new Request("https://terpplan.test/api/catalog?" + new URLSearchParams(params)))).json();
  const { courses } = await ask({ ids: "CMSC471,CMSC454,CMSC131,NOPE999" });
  assert.deepEqual(courses.CMSC471.terms, ["202608"], "fall only this year");
  assert.deepEqual(courses.CMSC454.terms, ["202701"]);
  assert.deepEqual(courses.CMSC131.terms, ["202608", "202701"]);
  assert.equal(courses.CMSC131.credits, "4");
  assert.equal(courses.NOPE999, null);
  assert.ok((await ask({ q: "cmsc47" })).results.some((item) => item.course_id === "CMSC471"));
  assert.equal((await catalog(new Request("https://terpplan.test/api/catalog?ids=bad"))).status, 400);
});

test("the chosen major and track are kept with the plan; anything else is dropped", () => {
  const base = { start: "202608", years: 4, terms: {}, earlier: [] };
  assert.deepEqual(parseRoadmap({ ...base, major: { id: "CS", track: "data" } }).major, { id: "CS", track: "data" });
  assert.equal(parseRoadmap({ ...base, major: { id: "CS", track: "art" } }).major, undefined);
  assert.equal(parseRoadmap({ ...base, major: { id: "ENGL", track: "general" } }).major, undefined);
  // A catalog major keeps its tables and the rules the student ticked.
  const economics = { id: "catalog", slug: "economics--economics-major", blocks: [1, 1, -2, 0.5, "x"], ticked: ["1x9k2a", "1x9k2a-1", "BAD", 7] };
  assert.deepEqual(parseRoadmap({ ...base, major: economics }).major, { id: "catalog", slug: "economics--economics-major", blocks: [1], ticked: ["1x9k2a", "1x9k2a-1"] });
  assert.deepEqual(parseRoadmap({ ...base, major: { id: "catalog", slug: "economics--economics-major", blocks: [], ticked: [] } }).major, { id: "catalog", slug: "economics--economics-major", blocks: [] }, "every table switched off is a choice too");
  assert.equal(parseRoadmap({ ...base, major: { id: "catalog", slug: "../etc/passwd" } }).major, undefined);
});
