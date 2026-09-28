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
  slug: "test--a-minor", name: "A Minor", kind: "minor", url: "https://example.edu", total: 15, intro: null, apply: null,
  items: [
    { kind: "course", section: "", label: "AAAA100", credits: 3, options: [["AAAA100"]] },
    { kind: "course", section: "", label: "AAAA200", credits: 3, options: [["AAAA200"]] },
    { kind: "choose", section: "", label: "Select two of the following:", count: 2, credits: 6, options: [["AAAA300"], ["AAAA301"], ["AAAA302"]] },
    { kind: "choose", section: "", label: "Three credits of any AAAA 3xx course", count: null, credits: 3, options: [] },
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
