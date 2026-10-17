import assert from "node:assert/strict";
import test from "node:test";
import { auditAmount, auditNeedsFrom, checkAuditNeeds, parseAuditNeeds } from "../lib/audit-plan.ts";
import { parseDegreeAudit } from "../lib/degree-audit.ts";

const AUDIT = `AT LEAST ONE REQUIREMENT HAS NOT BEEN SATISFIED
Doe, Jane
UID 123456789
[GenEd] Distributive Studies
 1) Humanities (DSHU)
NEEDS: 1 COURSE
[GenEd] Diversity
 2) Cultural Competence (DVCC) or 2nd
Understanding Plural Society (DVUP) course
NEEDS: 1 COURSE
[CMSC] Upper Level
Upper-level major elective
NEEDS: 1 COURSE
SELECT FROM: CMSC 426,460 OR AMSC 460
Systems courses
NEEDS: 6 CREDITS
SELECT FROM: CMSC 411,412,414,417
[UNIV]
Minimum cumulative GPA
NEEDS: 2.0 GPA
Fa25 CMSC131 4.0 A Object-Oriented Programming I
Sp26 CMSC426 3.0 IP Computer Vision`;

const plan = (terms) => Object.entries(terms).flatMap(([term, list]) => list.map((id) => ({ id, term: term === "earlier" ? null : term, credits: 3 })));

test("only the unfinished requirements and the course codes are kept from an audit", () => {
  const saved = auditNeedsFrom(parseDegreeAudit(AUDIT), new Date("2026-10-17T12:00:00Z"));
  assert.equal(saved.requirements.length, 5);
  assert.deepEqual(saved.known, ["CMSC131", "CMSC426"]);
  assert.equal(saved.savedAt, "2026-10-17T12:00:00.000Z");
  const text = JSON.stringify(saved);
  assert.equal(text.includes("Doe") || text.includes("123456789") || text.includes("Computer Vision"), false, "no name, no ID, no course history beyond codes");
  assert.deepEqual(Object.keys(saved.requirements[0]).sort(), ["courseIds", "genEdCode", "need", "title"]);
});

test("a stored audit is checked before use", () => {
  assert.equal(parseAuditNeeds(null), null);
  assert.equal(parseAuditNeeds({ requirements: [], known: [] }), null);
  const parsed = parseAuditNeeds({
    requirements: [{ title: "x".repeat(300), need: "1 COURSE", courseIds: ["CMSC460", "bad", 7], genEdCode: "NOPE" }, { title: 3, need: "1 COURSE" }],
    known: ["CMSC131", "<script>"], savedAt: "2026-10-17",
  });
  assert.equal(parsed.requirements.length, 1);
  assert.equal(parsed.requirements[0].title.length, 200);
  assert.deepEqual(parsed.requirements[0].courseIds, ["CMSC460"]);
  assert.equal(parsed.requirements[0].genEdCode, null);
  assert.deepEqual(parsed.known, ["CMSC131"]);
});

test("how much a NEEDS line asks for", () => {
  assert.deepEqual(auditAmount("2 COURSES"), { target: 2, unit: "courses" });
  assert.deepEqual(auditAmount("6.00 CREDITS"), { target: 6, unit: "credits" });
  assert.deepEqual(auditAmount("1 SUB-GROUP"), { target: null, unit: "courses" });
});

test("the plan's later courses fill the audit's lists and Gen Ed categories; the rest is for the student", () => {
  const saved = auditNeedsFrom(parseDegreeAudit(AUDIT));
  const genEds = { ARTH200: [["DSHU"], ["DVUP"]], HIST289: [["DSHU"]] };
  const courses = plan({ 202508: ["CMSC131"], 202601: ["CMSC426"], 202608: ["ARTH200", "CMSC414"], 202701: ["CMSC460", "CMSC417", "HIST289"] });
  const check = checkAuditNeeds(saved, courses, genEds);
  const [humanities, diversity, elective, systems, gpa] = check.lines;
  assert.deepEqual(humanities.courses.map((course) => course.id), ["ARTH200"]);
  assert.deepEqual(diversity.courses.map((course) => course.id), ["ARTH200"], "a DVUP course is the second Diversity course, and may also be the humanities course");
  assert.equal(elective.ok, true);
  assert.deepEqual(elective.courses.map((course) => course.id), ["CMSC460"], "CMSC426 is already on the audit");
  assert.deepEqual([systems.ok, systems.have, systems.target, systems.unit], [true, 6, 6, "credits"]);
  assert.deepEqual(systems.options, ["CMSC411", "CMSC412"]);
  assert.equal(gpa.ok, null);
  assert.equal(gpa.kind, "other");
  assert.deepEqual([check.done, check.open], [4, 1]);
  assert.deepEqual(check.later.map((course) => course.id), ["ARTH200", "CMSC414", "CMSC460", "CMSC417", "HIST289"]);
  assert.deepEqual([check.laterCredits, check.upperCredits], [15, 9]);
});

test("a course counts for one list, the shorter list first, and for one requirement of each Gen Ed kind", () => {
  const saved = parseAuditNeeds({ known: [], requirements: [
    { title: "Electives", need: "1 COURSE", courseIds: ["CMSC414", "CMSC417", "CMSC420"], genEdCode: null },
    { title: "Security", need: "1 COURSE", courseIds: ["CMSC414"], genEdCode: null },
    { title: "Humanities", need: "1 COURSE", courseIds: [], genEdCode: "DSHU" },
    { title: "Humanities again", need: "1 COURSE", courseIds: [], genEdCode: "DSHU" },
  ] });
  const check = checkAuditNeeds(saved, plan({ 202608: ["CMSC414", "ENGL250"] }), { ENGL250: [["DSHU"]] });
  assert.equal(check.lines[1].ok, true, "the one-course list takes CMSC414");
  assert.deepEqual([check.lines[0].ok, check.lines[0].have], [false, 0]);
  assert.deepEqual(check.lines[0].options, ["CMSC417", "CMSC420"]);
  assert.deepEqual([check.lines[2].ok, check.lines[3].ok], [true, false], "one course does not fill the same category twice");
});

test("a listed Gen Ed course cannot fill an either-or category again, in either audit order", () => {
  const humanities = { title: "Humanities", need: "1 COURSE", courseIds: ["ENGL250"], genEdCode: "DSHU" };
  const social = { title: "Social Sciences", need: "1 COURSE", courseIds: [], genEdCode: "DSSP" };
  for (const requirements of [[humanities, social], [social, humanities]]) {
    const saved = parseAuditNeeds({ known: [], requirements });
    const check = checkAuditNeeds(saved, plan({ 202708: ["ENGL250"] }), { ENGL250: [["DSHU", "DSSP"]] });
    assert.equal(check.done, 1, "DSHU or DSSP is one category, even when the audit lists the course explicitly");
    assert.deepEqual(check.lines.map((line) => line.ok), [true, false]);
  }
});

test("listed Gen Ed courses still fill compatible categories and a separate major list", () => {
  const major = { title: "Major elective", need: "1 COURSE", courseIds: ["ARTH200"], genEdCode: null };
  const humanities = { title: "Humanities", need: "1 COURSE", courseIds: ["ARTH200"], genEdCode: "DSHU" };
  const diversity = { title: "Diversity", need: "1 COURSE", courseIds: ["ARTH200"], genEdCode: "DVUP" };
  for (const requirements of [[major, humanities, diversity], [diversity, humanities, major]]) {
    const saved = parseAuditNeeds({ known: [], requirements });
    for (const genEds of [{ ARTH200: [["DSHU"], ["DVUP"]] }, {}]) {
      const check = checkAuditNeeds(saved, plan({ 202708: ["ARTH200"] }), genEds);
      assert.equal(check.done, 3, "a major list and separate Gen Ed categories may reuse the course, including explicit audit listings without catalog metadata");
    }
  }
});

test("two listed Gen Ed requirements cannot count the same category twice", () => {
  const requirement = { title: "Humanities", need: "1 COURSE", courseIds: ["ENGL250"], genEdCode: "DSHU" };
  const saved = parseAuditNeeds({ known: [], requirements: [requirement, { ...requirement, title: "Humanities again" }] });
  const check = checkAuditNeeds(saved, plan({ 202708: ["ENGL250"] }), { ENGL250: [["DSHU"]] });
  assert.deepEqual(check.lines.map((line) => line.ok), [true, false]);
});

test("a Gen Ed requirement with a course list does not accept an unlisted course of the same category", () => {
  const saved = parseAuditNeeds({ known: [], requirements: [
    { title: "Humanities", need: "1 COURSE", courseIds: ["ENGL250"], genEdCode: "DSHU" },
  ] });
  const check = checkAuditNeeds(saved, plan({ 202708: ["ARTH200"] }), { ARTH200: [["DSHU"]] });
  assert.equal(check.lines[0].ok, false);
  assert.deepEqual(check.lines[0].courses, []);
  assert.deepEqual(check.lines[0].options, ["ENGL250"]);
});
