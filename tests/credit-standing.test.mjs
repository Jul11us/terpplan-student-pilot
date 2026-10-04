import assert from "node:assert/strict";
import test from "node:test";
import { minimumCredits } from "../lib/credit-standing.ts";
import { parseDegreeAudit } from "../lib/degree-audit.ts";
import { parseTaken } from "../lib/taken-courses.ts";

const note = (text, kind = "other") => [{ kind, label: "Note", text }];

test("credit minimums are read from Testudo's requirement wording", () => {
  assert.equal(minimumCredits(note("Restricted to students with 24 credit hours completed. Where a BMGT exam conflicts with another regularly scheduled class, the student will be provided a makeup exam.")), 24);
  assert.equal(minimumCredits(note("Restricted to BMGT majors with 53 credit hours completed.")), 53);
  assert.equal(minimumCredits(note("Must have earned a minimum of 90 credits.", "restriction")), 90);
  assert.equal(minimumCredits(note("Must be in the Kinesiology major; and must have earned at least 75 credits.", "restriction")), 75);
  assert.equal(minimumCredits(note("Prerequisite: 60 credits and completion of ENGL101 or equivalent.")), 60);
  assert.equal(minimumCredits(note("Junior standing or higher.", "restriction")), 60);
  assert.equal(minimumCredits(note("Must have senior standing.", "restriction")), 90);
  assert.equal(minimumCredits(note("Junior or Senior standing only; Permission of AGNR-Environmental Science & Technology department.", "restriction")), 60);
});

test("credit wording that is not an entry requirement is ignored", () => {
  assert.equal(minimumCredits(note("Credit only granted for: BMGT220 or BMGT220H.", "creditOnlyFor")), null);
  assert.equal(minimumCredits(note("Cross-listed with SOCY320. Credit granted only for AAAS320 or SOCY320.")), null);
  assert.equal(minimumCredits(note("Restriction: Must be in the ACES Minor Program. Repeatable to 6 credits if content differs.")), null);
  assert.equal(minimumCredits(note("PSYC100; and 9 credits in PSYC courses.", "prerequisite")), null);
  assert.equal(minimumCredits(note("Must have completed 6 credits in SOCY courses or permission of BSOS Sociology Department.", "prerequisite")), null);
  assert.equal(minimumCredits([]), null);
  assert.equal(minimumCredits(undefined), null);
});

test("the audit counts earned and in-progress credits once per course", () => {
  const audit = parseDegreeAudit(`Fa25 CMSC131 4.0 A Programming I
Fa25 CMSC131 4.0 A Programming I
Sp26 CHEM131 3.0 D Chemistry
Sp26 MATH141 4.0 F Calculus II
Sp25 MATH140 4.00 TP CALCULUS BC/SCR 5
Fa26 ENGL101 3.0 IP Academic Writing`);
  assert.equal(audit.completedCredits, 11);
  assert.equal(audit.inProgressCredits, 3);
});

test("a saved credit count is kept, and alone is enough to keep the record", () => {
  assert.deepEqual(parseTaken({ completed: [], inProgress: [], credits: "45", source: "manual" }), { completed: [], inProgress: [], credits: 45, source: "manual", updatedAt: "" });
  assert.equal(parseTaken({ completed: ["CMSC131"], inProgress: [], credits: -3 }).credits, undefined);
  assert.equal(parseTaken({ completed: [], inProgress: [], credits: "lots" }), null);
});

test("a retake in progress cannot count already-earned credits twice", () => {
  const audit = parseDegreeAudit("Fa25 CHEM131 3.0 D Chemistry\nFa26 CHEM131 3.0 IP Chemistry");
  assert.equal(audit.completedCredits, 3);
  assert.equal(audit.inProgressCredits, 0);
});
