import assert from "node:assert/strict";
import test from "node:test";
import { parseCourseIds, parseDegreeAudit } from "../lib/degree-audit.ts";
import { degreeAuditPageLines } from "../lib/degree-audit-pdf.ts";

test("reads unmet Gen Ed and named course requirements without retaining student identity", () => {
  const result = parseDegreeAudit(`AT LEAST ONE REQUIREMENT HAS NOT BEEN SATISFIED
Doe, Jane
Computer Science
[GenEd]
Humanities (DSHU)
NEEDS: 3 CREDITS
SELECT FROM: HIST 110,200 OR ENGL 201
[UNIV]
Upper-level major elective
NEEDS: 1 COURSE
SELECT FROM: CMSC 426,460 OR AMSC 460
Fa25 CMSC131 4.0 A Introduction to Computer Science`);
  assert.equal(result.status, "in_progress");
  assert.deepEqual(result.requirements.map((item) => item.genEdCode), ["DSHU", null]);
  assert.deepEqual(result.requirements[0].courseIds, ["HIST110", "HIST200", "ENGL201"]);
  assert.deepEqual(result.requirements[1].courseIds, ["CMSC426", "CMSC460", "AMSC460"]);
  assert.deepEqual(result.completedCourseIds, ["CMSC131"]);
  assert.deepEqual(result.inProgressCourseIds, []);
  assert.equal(JSON.stringify(result).includes("Doe"), false);
});

test("failed and withdrawn attempts remain eligible while in-progress courses are identified", () => {
  const result = parseDegreeAudit(`Fa25 CMSC132 4.0 F Programming II
Sp26 MATH141 4.0 W Calculus II
Su26 HIST110 3.0 WF History
Fa26 ENGL101 3.0 IP Academic Writing
Sp25 CMSC131 4.0 B+ Programming I
Fa25 STAT400 3.0 P Statistics
Fa25 CHEM131 4.0 D Chemistry
Fa25 PHYS161 3.0 I Physics`);
  assert.deepEqual(result.completedCourseIds, ["CMSC131", "STAT400"]);
  assert.deepEqual(result.inProgressCourseIds, ["ENGL101"]);
});

test("keeps generic unmet requirements visible without inventing course options", () => {
  const result = parseDegreeAudit(`[UNIV]
Minimum cumulative GPA
NEEDS: 2.0 GPA`);
  assert.equal(result.status, "unknown");
  assert.equal(result.requirements.length, 1);
  assert.deepEqual(result.requirements[0].courseIds, []);
  assert.equal(result.requirements[0].genEdCode, null);
});

test("does not interpret non-audit numbers as course IDs", () => {
  assert.deepEqual(parseCourseIds("CMSC 426,460 OR AMSC 460"), ["CMSC426", "CMSC460", "AMSC460"]);
  assert.deepEqual(parseCourseIds("3 credits and 2027 semester"), []);
});

test("rebuilds PDF text rows in reading order", () => {
  const rows = degreeAuditPageLines([
    { str: "FROM:", x: 110, y: 80, width: 36 },
    { str: "CMSC", x: 150, y: 80, width: 32 },
    { str: "NEEDS:", x: 10, y: 100, width: 45 },
    { str: "3 CREDITS", x: 60, y: 100, width: 56 },
    { str: "SELECT", x: 10, y: 80, width: 45 },
    { str: "426,460", x: 185, y: 80, width: 46 },
  ]);
  assert.deepEqual(rows, ["NEEDS: 3 CREDITS", "SELECT FROM: CMSC 426,460"]);
});
