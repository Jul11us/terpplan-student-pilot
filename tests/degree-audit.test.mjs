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
Fa25 PHYS161 3.0 I Physics
Sp25 MATH140 4.00 TP CALCULUS BC/SCR 5
Sp25 XMATH BC/AB5 0.00 TP tna CALC BC/AB SUBSCR 5`);
  // AP and transfer credit (TP) counts as completed; placeholder rows like "XMATH BC/AB5" are not courses.
  assert.deepEqual(result.completedCourseIds, ["CMSC131", "STAT400", "MATH140"]);
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

test("names numbered sub-requirements and reads their Gen Ed codes", () => {
  const result = parseDegreeAudit(`[GenEd] Distributive Studies
 1) Humanities (DSHU)
Sp25 HIST201 3.00 TP U.S. HISTORY/SCR 4
XHIST US4
Advanced Placement Exam
NEEDS: 1 COURSE
 4) Natural Sciences (DSNS or DSNL)
NEEDS: 1 SET
[GenEd] Diversity
 1) Understanding Plural Society (DVUP)
Sp25 HIST201 3.00 TP U.S. HISTORY/SCR 4
 2) Cultural Competence (DVCC) or 2nd
Understanding Plural Society (DVUP) course
NEEDS: 1 COURSE
[BMGT] Lower Level Core
Principles of Accounting I & II
 3)
NEEDS: 2 COURSES
SELECT FROM: BMGT 220,221`);
  assert.deepEqual(result.requirements.map((item) => item.genEdCode), ["DSHU", "DSNS", "DVCC", null]);
  // DVUP is met by HIST201, so it is not reported as missing.
  assert.equal(result.requirements.some((item) => item.genEdCode === "DVUP"), false);
  assert.equal(result.requirements[3].title, "Principles of Accounting I & II");
  assert.deepEqual(result.requirements[3].courseIds, ["BMGT220", "BMGT221"]);
});
