import assert from "node:assert/strict";
import test from "node:test";
import { evaluateProgram } from "../lib/programs.ts";

const facts = {
  AAAA100: { n: "Intro", c: 3 },
  AAAA200: { n: "Middle", c: 3, pr: "AAAA100" },
  AAAA300: { n: "Upper", c: 3, pr: ["&", "AAAA200", ["|", "MATH140", "MATH220"]] },
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
  const { prerequisiteTree } = await import("../scripts/prerequisites.mjs");
  const read = (text, self) => prerequisiteTree(text, self);
  // Math placement can replace MATH115, and a course never needs itself.
  assert.equal(read("Minimum grade of C- in MATH115 ; or must have math eligibility of MATH140 ; and math eligibility is based on the Math Placement Test.", "MATH140"), null);
  assert.equal(read("Must have math eligibility of MATH113 or higher; and math eligibility is based on the Math Placement Exam or the successful completion of MATH 003 with appropriate eligibility.", "MATH113"), null);
  assert.equal(read("Must have math eligibility of MATH115 or higher; and math eligibility is based on the Math Placement Exam. Or MATH113 .", "MATH115"), null);
  // AP or department exams are exceptions: the course stays required; "; and" adds a requirement.
  assert.deepEqual(read("Minimum grade of C- in CMSC131 ; or must have earned a score of 5 on the A Java AP exam; or must have earned a satisfactory score on the departmental placement exam; and minimum grade of C- in MATH140 .", "CMSC132"), ["&", "CMSC131", "MATH140"]);
  assert.deepEqual(read("Minimum grade of C- in CMSC320 , CMSC330 , and CMSC351 ; and 1 course with a minimum grade of C- from ( MATH240 , MATH341 , MATH461 ).", "CMSC422"),
    ["&", "CMSC320", "CMSC330", "CMSC351", ["|", "MATH240", "MATH341", "MATH461"]]);
  // "A and B; or C" keeps both paths.
  assert.deepEqual(read("ANSC204 and ANSC205; or ANSC201 .", "ANSC210"), ["|", ["&", "ANSC204", "ANSC205"], "ANSC201"]);
  assert.deepEqual(read("MATH341 ; or MATH246 and one of ( MATH240 or MATH461 ).", "AMSC452"), ["|", "MATH341", ["&", "MATH246", ["|", "MATH240", "MATH461"]]]);
  // "either A or B and C", "2 courses from", "or higher", "concurrently enrolled", comma lists.
  assert.deepEqual(read("Minimum grade of C- in either BSCI330 or BSCI331 and BSCI332 .", "BSCI343"), ["|", "BSCI330", ["&", "BSCI331", "BSCI332"]]);
  assert.deepEqual(read("Two of the following courses: AAAS100 , AAAS101 , AAAS200 , or AAAS202 .", "AAAS399"), [2, "AAAS100", "AAAS101", "AAAS200", "AAAS202"]);
  assert.deepEqual(read("Minimum grade of C- in MATH115 or higher; minimum grade of C- in INST126 ; and 1 course with a minimum grade of C- from ( PSYC100 , SOCY105 , BSOS233 ).", "INST308"),
    ["&", "MATH115+", "INST126", ["|", "PSYC100", "SOCY105", "BSOS233"]]);
  assert.deepEqual(read("BSCI160 and BSCI170 ; and must have completed or be concurrently enrolled in CHEM131 and either BSCI180 or ( BSCI161 and BSCI171 ).", "BSCI207"),
    ["&", "BSCI160", "BSCI170", "~CHEM131", ["|", "~BSCI180", ["&", "~BSCI161", "~BSCI171"]]]);
  assert.deepEqual(read("one of COMM107 , COMM200 or COMM230", "COMM304"), ["|", "COMM107", "COMM200", "COMM230"]);
  // A language placement score and AP scores are exceptions; the course path stays.
  assert.equal(read("FREN203 ; or must have appropriate World Language Placement (WLP) score.", "FREN204"), "FREN203");
  assert.deepEqual(read("PHYS171 , PHYS141 , or PHYS161 ; or must have scored 3 or higher on AP PHYS exam.", "PHYS165"), ["|", "PHYS171", "PHYS141", "PHYS161"]);
});

test("walks prerequisite trees: alternatives, same-term courses, and 'or higher'", async () => {
  const { unmetPrerequisites } = await import("../lib/programs.ts");
  const treeFacts = {
    MATH140: { n: "Calculus I", c: 4 },
    MATH141: { n: "Calculus II", c: 4, pr: "MATH140" },
    CHEM131: { n: "Chemistry I", c: 3 },
    BSCI207: { n: "Cell Biology", c: 4, pr: ["&", "MATH141", "~CHEM131"] },
    INST308: { n: "Data", c: 3, pr: "MATH115+" },
    ANSC210: { n: "Animal", c: 3, pr: ["|", ["&", "ANSC204", "ANSC205"], "ANSC201"] },
  };
  const program = { ...minor, items: [{ kind: "course", section: "", label: "", credits: 4, options: [["BSCI207"]], block: 0 }] };
  const result = evaluateProgram(program, treeFacts, new Map());
  // MATH140 then MATH141, and CHEM131 may share BSCI207's semester: three semesters, not four.
  assert.equal(result.minSemesters, 3);
  assert.deepEqual(result.hiddenPrerequisites, ["CHEM131", "MATH140", "MATH141"]);
  const labels = { orHigher: "+", sameTerm: "*", of: (k) => `${k} of` };
  assert.deepEqual(unmetPrerequisites(treeFacts.INST308, new Map([["MATH140", "done"]]), labels), []);
  assert.deepEqual(unmetPrerequisites(treeFacts.INST308, new Map([["MATH113", "done"]]), labels), ["MATH115+"]);
  assert.deepEqual(unmetPrerequisites(treeFacts.ANSC210, new Map([["ANSC201", "done"]]), labels), []);
  assert.deepEqual(unmetPrerequisites(treeFacts.ANSC210, new Map(), labels), ["(ANSC204 + ANSC205) / ANSC201"]);
});

test("measures a list of named sequences one sequence at a time", async () => {
  const { withBaseCourses } = await import("../lib/programs.ts");
  const seqFacts = { PHYS161: { n: "P1", c: 3 }, PHYS260: { n: "P2", c: 3 }, PHYS270: { n: "P3", c: 3 }, ECON200: { n: "E1", c: 3 }, ECON201: { n: "E2", c: 3 }, ECON305: { n: "E3", c: 3 } };
  const program = { ...minor, items: [{ kind: "choose", section: "", label: "Select one of two sequences", count: 1, credits: 9, block: 0,
    options: [["PHYS161"], ["PHYS260"], ["PHYS270"], ["ECON200"], ["ECON201"], ["ECON305"]],
    alts: [{ label: "Select one of two sequences", credits: 9, from: 0 }, { label: "Sequence Two (9 credits)", credits: 9, from: 3 }] }] };
  // One course from the first sequence and two from the second do not add up to a finished sequence.
  const result = evaluateProgram(program, seqFacts, new Map([["PHYS161", "done"], ["ECON200", "done"], ["ECON201", "done"]]));
  assert.deepEqual(result.items[0].met.map((entry) => entry.option[0]), ["ECON200", "ECON201"]);
  assert.equal(result.items[0].remainingCredits, 3);
  assert.deepEqual(result.items[0].suggestions, [["ECON305"]]);
  // Honors and topic versions satisfy the base course.
  const expanded = withBaseCourses(new Map([["ENGL101H", "inProgress"], ["BMGT110F", "done"]]));
  assert.equal(expanded.get("ENGL101"), "inProgress");
  assert.equal(expanded.get("BMGT110"), "done");
});
