import assert from "node:assert/strict";
import test from "node:test";
import { checkCsMajor, csBenchmarks, csCode } from "../lib/cs-major.ts";
import { roadmapTerms } from "../lib/roadmap.ts";

// A plan as the page passes it: each course once, earlier courses first, then by term.
const plan = (earlier, terms) => [
  ...earlier.map(([id, credits]) => ({ id, term: null, credits })),
  ...Object.entries(terms).sort().flatMap(([term, list]) => list.map(([id, credits]) => ({ id, term, credits }))),
];
const line = (check, key) => check.lines.find((item) => item.key === key);
const ids = (item) => item.courses.map((course) => course.id);

// A data science student who starts in Fall 2026 with AP credit for MATH140 and ECON201.
const dataScience = plan([["MATH140", 4], ["ECON201", 3]], {
  202608: [["CMSC131", 4], ["MATH141", 4], ["LING200", 3], ["UMEI005", 6]],
  202701: [["CMSC132", 4], ["CMSC250", 4], ["ENGL101", 3]],
  202708: [["CMSC216", 4], ["CMSC320", 3], ["STAT400", 3], ["MATH240", 4], ["COMM107", 3]],
  202801: [["CMSC330", 3], ["CMSC351", 3], ["STAT401", 3]],
  202808: [["CMSC422", 3], ["CMSC424", 3], ["CMSC421", 3], ["STAT430", 3]],
  202901: [["CMSC454", 3], ["CMSC414", 3], ["CMSC434", 3], ["STAT440", 3]],
  202908: [["STAT422", 3], ["CMSC471", 3]],
});

test("a complete data science plan meets every requirement, with the concentration in MATH/STAT", () => {
  const check = checkCsMajor("data", dataScience, {});
  assert.deepEqual(check.lines.filter((item) => !item.ok).map((item) => item.key), []);
  assert.equal(check.done, check.lines.length);
  assert.deepEqual(ids(line(check, "STAT4XX")), ["STAT400"], "data science names STAT400");
  assert.deepEqual(ids(line(check, "MATHSTAT")), ["MATH240"], "linear algebra");
  assert.deepEqual(ids(line(check, "dataOne")), ["CMSC421"]);
  assert.deepEqual(ids(line(check, "dataTheory")), ["CMSC454"]);
  assert.deepEqual(ids(line(check, "dataTwo")), ["CMSC414", "CMSC434"]);
  assert.deepEqual(check.areas, [1, 2, 3, 4]);
  assert.deepEqual(ids(line(check, "ulc")), ["STAT401", "STAT430", "STAT440", "STAT422"], "STAT400 is used for the major, so it is not in the concentration");
  assert.equal(check.ulc.discipline, "MATH/STAT");
});

test("the LEP benchmarks are checked at the terms the plan reaches 45 and 75 credits", () => {
  const terms = roadmapTerms({ start: "202608", years: 4 });
  assert.deepEqual(csBenchmarks(dataScience, terms).map((item) => [item.at, item.term, item.missing]), [[45, "202708", []], [75, "202901", []]]);
  // CMSC132 put off until after the 45-credit review.
  const late = dataScience.map((course) => course.id === "CMSC132" ? { ...course, term: "202801" } : course);
  const [first] = csBenchmarks(late, terms);
  assert.equal(first.term, "202708");
  assert.deepEqual(first.missing.map((text) => text.en), ["CMSC132"]);
  assert.equal(csBenchmarks(plan([], { 202608: [["CMSC131", 4]] }), terms)[0].term, null, "never reaches 45 credits");
});

test("the general track takes five area courses from at least three areas, at most three counted in one", () => {
  const systems = plan([], { 202808: [["CMSC411", 3], ["CMSC412", 4], ["CMSC414", 3], ["CMSC417", 3]], 202901: [["CMSC420", 3]] });
  let check = checkCsMajor("general", systems, {});
  assert.equal(line(check, "areas").ok, false);
  assert.equal(line(check, "areas").have, 4, "a fourth systems course cannot be counted for an area");
  assert.deepEqual(ids(line(check, "electives")), ["CMSC417"], "it is an elective instead");
  check = checkCsMajor("general", [...systems, { id: "CMSC451", term: "202908", credits: 3 }], {});
  assert.equal(line(check, "areas").ok, true);
  // CMSC471 counts for area 2 or area 3, whichever brings a new area.
  const visual = plan([], { 202808: [["CMSC420", 3], ["CMSC421", 3], ["CMSC422", 3]], 202901: [["CMSC471", 3], ["CMSC451", 3]] });
  assert.equal(line(checkCsMajor("general", visual, {}), "areas").ok, true);
});

test("special topics count for an area only in the terms the department lists", () => {
  const listed = checkCsMajor("general", plan([], { 202701: [["CMSC498N", 3]] }), {});
  assert.deepEqual(ids(line(listed, "areas")), ["CMSC498N"], "Spring 2027 is listed for area 1");
  const other = checkCsMajor("general", plan([], { 202708: [["CMSC498N", 3]] }), {});
  assert.deepEqual(ids(line(other, "areas")), []);
  assert.deepEqual(ids(line(other, "electives")), ["CMSC498N"], "another term: an upper level elective");
});

test("cross-listed courses count as the CMSC course, and stay out of the concentration", () => {
  assert.equal(csCode("PHYS457"), "CMSC457");
  assert.equal(csCode("MATH141H"), "MATH141");
  const quantum = checkCsMajor("quantum", plan([], { 202808: [["PHYS457", 3], ["PHYS467", 3]] }), {});
  assert.deepEqual(ids(line(quantum, "CMSC457")), ["PHYS457"]);
  const ulc = checkCsMajor("general", plan([], { 202808: [["MATH456", 3], ["ENGL393", 3], ["ENGL301", 3], ["ENGL302", 3], ["ENGL303", 2]] }), { ENGL393: { name: "Technical Writing", credits: "3", ge: [["FSPW"]], pr: null, terms: [] } });
  assert.equal(ulc.ulc.discipline, "ENGL");
  assert.deepEqual(ids(line(ulc, "ulc")), ["ENGL301", "ENGL302"], "not the professional writing course, nor one under 3 credits");
  assert.equal(line(ulc, "ulc").ok, false);
});

test("machine learning's numerical option is one choice, whichever course fills it", () => {
  const check = checkCsMajor("ml", plan([], { 202808: [["CMSC460", 3], ["MATH401", 3], ["CMSC472", 3]] }), {});
  assert.deepEqual(ids(line(check, "mlTwo")), ["CMSC460", "CMSC472"]);
});
