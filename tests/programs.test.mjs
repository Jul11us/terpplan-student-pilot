import assert from "node:assert/strict";
import test from "node:test";
import { evaluateProgram } from "../lib/programs.ts";

const facts = {
  AAAA100: { n: "Intro", c: 3 },
  AAAA200: { n: "Middle", c: 3, pg: [["AAAA100"]] },
  AAAA300: { n: "Upper", c: 3, pg: [["AAAA200"], ["MATH140", "MATH220"]] },
  AAAA301: { n: "Upper B", c: 3 },
  AAAA302: { n: "Upper C", c: 3 },
  MATH140: { n: "Calculus I", c: 4 },
  MATH220: { n: "Elementary Calculus I", c: 3 },
};

const minor = {
  slug: "test--a-minor", name: "A Minor", kind: "minor", url: "https://example.edu", intro: null, apply: null,
  blocks: [{ title: "", role: "always", total: 15 }],
  items: [
    { kind: "course", section: "", label: "AAAA100", credits: 3, options: [["AAAA100"]], block: 0 },
    { kind: "course", section: "", label: "AAAA200", credits: 3, options: [["AAAA200"]], block: 0 },
    { kind: "choose", section: "", label: "Select two of the following:", count: 2, credits: 6, options: [["AAAA300"], ["AAAA301"], ["AAAA302"]], block: 0 },
    { kind: "choose", section: "", label: "Three credits of any AAAA 3xx course", count: null, credits: 3, options: [], block: 0 },
  ],
};

test("counts finished, in-progress and planned courses once each", () => {
  const student = new Map([["AAAA100", "done"], ["AAAA200", "inProgress"], ["AAAA301", "planned"]]);
  const result = evaluateProgram(minor, facts, student);
  assert.deepEqual(result.creditsByStatus, { done: 3, inProgress: 3, planned: 3 });
  assert.equal(result.items[2].met.length, 1);
  // One more list course (3) and the open item (3) remain.
  assert.equal(result.remainingCredits, 6);
  assert.equal(result.partial, true);
});

test("open items can be checked off by hand", () => {
  const student = new Map([["AAAA100", "done"], ["AAAA200", "done"], ["AAAA301", "done"], ["AAAA302", "done"]]);
  assert.equal(evaluateProgram(minor, facts, student, { manualDone: new Set([3]) }).remainingCredits, 0);
});

test("finds prerequisites outside the minor and the prerequisite chain length", () => {
  const result = evaluateProgram(minor, facts, new Map([["AAAA301", "done"], ["AAAA302", "done"]]));
  // Nothing forces AAAA300 here, so only the required chain AAAA100 -> AAAA200 counts.
  assert.equal(result.minSemesters, 2);
  const needsUpper = evaluateProgram({ ...minor, items: [...minor.items.slice(0, 2), { ...minor.items[2], options: [["AAAA300"]], count: 1, credits: 3 }] }, facts, new Map());
  assert.equal(needsUpper.minSemesters, 3);
  // The shallowest alternative is picked; MATH140 and MATH220 tie, so the catalog order decides.
  assert.deepEqual(needsUpper.hiddenPrerequisites, ["MATH140"]);
});

test("caps overlap with the major at two courses", () => {
  const student = new Map([["AAAA100", "done"], ["AAAA200", "done"], ["AAAA301", "done"]]);
  const result = evaluateProgram(minor, facts, student, { majorCodes: new Set(["AAAA100", "AAAA200", "AAAA301"]) });
  assert.deepEqual(result.overlap, ["AAAA100", "AAAA200", "AAAA301"]);
  assert.equal(result.overlapExcess, 1);
  // 3 for the last list course, 3 for the open item, 3 to replace the course over the cap.
  assert.equal(result.remainingCredits, 9);
});

const major = {
  slug: "test--a-major", name: "A Major", kind: "major", url: "https://example.edu", intro: null, apply: null,
  blocks: [{ title: "Bachelor of Arts", role: "default", total: 6 }, { title: "Bachelor of Science", role: "choice", total: 9 }],
  items: [
    { kind: "course", section: "", label: "AAAA100", credits: 3, options: [["AAAA100"]], block: 0 },
    { kind: "course", section: "", label: "AAAA301", credits: 3, options: [["AAAA301"]], block: 0 },
    { kind: "course", section: "", label: "AAAA100", credits: 3, options: [["AAAA100"]], block: 1 },
    { kind: "course", section: "", label: "AAAA302", credits: 3, options: [["AAAA302"]], block: 1 },
    { kind: "course", section: "", label: "MATH140", credits: 4, options: [["MATH140"]], block: 1 },
  ],
};

test("uses only the chosen catalog tables and keeps item indexes stable", () => {
  const ba = evaluateProgram(major, facts, new Map(), { overlapCap: null });
  assert.deepEqual(ba.items.map((item) => item.index), [0, 1]);
  assert.equal(ba.remainingCredits, 6);
  const bs = evaluateProgram(major, facts, new Map(), { overlapCap: null, blocks: new Set([1]) });
  assert.deepEqual(bs.items.map((item) => item.index), [2, 3, 4]);
  assert.equal(bs.remainingCredits, 10);
});

test("a second major has no overlap cap and reports shared and unique credits", () => {
  const result = evaluateProgram(major, facts, new Map([["AAAA100", "done"]]), { overlapCap: null, majorCodes: new Set(["AAAA100", "AAAA301"]) });
  assert.deepEqual(result.overlap, ["AAAA100"]);
  assert.equal(result.overlapExcess, 0);
  // AAAA301 is still to take and the first major lists it too.
  assert.equal(result.sharedRemainingCredits, 3);
  assert.equal(result.uniqueCredits, 0);
});

test("reads catalog prerequisite wording", async () => {
  const { prerequisiteGroups } = await import("../scripts/prerequisites.mjs");
  // Placement can replace MATH115, and a course never needs itself.
  assert.deepEqual(prerequisiteGroups("Minimum grade of C- in MATH115 ; or must have math eligibility of MATH140 ; and math eligibility is based on the Math Placement Test.", "MATH140"), []);
  assert.deepEqual(prerequisiteGroups("Must have math eligibility of MATH113 or higher; and math eligibility is based on the Math Placement Exam or the successful completion of MATH 003 with appropriate eligibility.", "MATH113"), []);
  assert.deepEqual(prerequisiteGroups("Must have math eligibility of MATH115 or higher; and math eligibility is based on the Math Placement Exam. Or MATH113 .", "MATH115"), []);
  // An AP or department exam is an exception; the course stays required, and "and" adds a group.
  assert.deepEqual(prerequisiteGroups("Minimum grade of C- in CMSC131 ; or must have earned a score of 5 on the A Java AP exam; or must have earned a satisfactory score on the departmental placement exam; and minimum grade of C- in MATH140 .", "CMSC132"),
    [["CMSC131"], ["MATH140"]]);
  assert.deepEqual(prerequisiteGroups("Minimum grade of C- in CMSC320 , CMSC330 , and CMSC351 ; and 1 course with a minimum grade of C- from ( MATH240 , MATH341 , MATH461 ).", "CMSC422"),
    [["CMSC320"], ["CMSC330"], ["CMSC351"], ["MATH240", "MATH341", "MATH461"]]);
  // "; or C" joins the single choice before it.
  assert.deepEqual(prerequisiteGroups("BSCI170 ; or BSCI171 .", "BSCI330"), [["BSCI170", "BSCI171"]]);
});
