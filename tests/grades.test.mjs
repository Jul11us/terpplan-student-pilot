import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  DEFAULT_LETTER_SCALE,
  computeGpa,
  computeGpaTerms,
  courseNumber,
  graduateExclusionReason,
  isZeroLevel,
  letterFromPercent,
  normaliseLetter,
  qualityPoints,
  truncate3,
} from "../lib/grades/gpa.ts";

import {
  autoMapCategories,
  canonicalCategory,
  categoryGroupIds,
  categorySimilarity,
  computeCourseGrade,
  labelsAreSameWork,
  requiredOnRemaining,
} from "../lib/grades/grading.ts";

import { extractGradingScheme, schemeFromParsed } from "../lib/grades/syllabus.ts";
import { docxXmlToText, fileKind, pdfPageLines, readZipEntry } from "../lib/grades/syllabus-file.ts";
import { mergeCanvasData, exportSource, bookmarkletHref } from "../lib/grades/canvas.ts";
import { sampleTerm } from "../lib/grades/sample.ts";
import { looksForCredit, partitionByCredit } from "../lib/grades/credit.ts";

/* ------------------------------------------------------------------ GPA --- */

test("the registrar's own worked example comes out at 2.253, truncated not rounded", () => {
  // ENGL101 A/3, MATH115 B-/3, PHYS121 C+/4, MUSC205 F/3 → 29.3 ÷ 13 = 2.2538… → 2.253
  const result = computeGpa([
    { code: "ENGL101", credits: 3, letter: "A" },
    { code: "MATH115", credits: 3, letter: "B-" },
    { code: "PHYS121", credits: 4, letter: "C+" },
    { code: "MUSC205", credits: 3, letter: "F" },
  ]);
  assert.equal(result.gpa, 2.253);
  assert.equal(result.totalCredits, 13);
  assert.equal(result.totalQualityPoints, 29.3);
  assert.equal(result.exact?.toFixed(4), "2.2538");
});

test("truncation never rounds up", () => {
  assert.equal(truncate3(2.253846153846154), 2.253);
  assert.equal(truncate3(2.253), 2.253);
  assert.equal(truncate3(3.9999), 3.999);
  assert.equal(truncate3(4), 4);
});

test("quality points match policy III-6.20(A)", () => {
  assert.equal(qualityPoints("A+"), 4.0, "A+ is 4.0, not 4.3");
  assert.equal(qualityPoints("D-"), 0.7);
  assert.equal(qualityPoints("F"), 0);
  assert.equal(qualityPoints("XF"), 0);
  for (const mark of ["I", "P", "S", "W", "NGR"]) {
    assert.equal(qualityPoints(mark), null, `${mark} must be excluded`);
  }
  assert.equal(normaliseLetter(" a- "), "A-");
  assert.equal(normaliseLetter("Aminus"), "A-");
});

test("I, P, S and W are skipped entirely and zero-level courses do not count", () => {
  const mixed = computeGpa([
    { code: "MATH140", credits: 4, letter: "A" },
    { code: "ENGL101", credits: 3, letter: "P" },
    { code: "HIST200", credits: 3, letter: "W" },
    { code: "CHEM131", credits: 3, letter: "I" },
  ]);
  assert.equal(mixed.totalCredits, 4);
  assert.equal(mixed.skipped.length, 3);
  assert.equal(mixed.gpa, 4);

  const zero = computeGpa([
    { code: "MATH003", credits: 3, letter: "A" },
    { code: "MATH140", credits: 4, letter: "C" },
  ]);
  assert.equal(zero.totalCredits, 4);
  assert.equal(zero.gpa, 2);
  assert.ok(isZeroLevel("MATH003"));
  assert.equal(courseNumber("ENGL101H"), 101);
});

test("graduate rules differ: D is 0.0, only 400-level and above count", () => {
  assert.equal(qualityPoints("D", "graduate"), 0.0);
  assert.equal(qualityPoints("D", "undergraduate"), 1.0);
  assert.equal(qualityPoints("D-", "graduate"), 0.0);

  const grad = computeGpa(
    [
      { code: "BMGT601", credits: 3, letter: "A" }, // 600-level → counts
      { code: "CMSC411", credits: 3, letter: "B" }, // 400-level → counts
      { code: "CMSC499", credits: 3, letter: "S" }, // S-graded   → out
      { code: "BMGT500", credits: 3, letter: "A" }, // 500-level  → out
      { code: "CMSC799", credits: 3, letter: "A" }, // 799        → out
      { code: "CMSC898", credits: 1, letter: "A" }, // 898        → out
      { code: "CMSC899", credits: 1, letter: "A" }, // 899        → out
      { code: "ENGL101", credits: 3, letter: "A" }, // below 400  → out
    ],
    { level: "graduate" },
  );
  assert.equal(grad.totalCredits, 6);
  assert.equal(grad.gpa, 3.5);
  assert.equal(grad.skipped.length, 6);
  assert.equal(graduateExclusionReason("BMGT500", "A")?.key, "gpa.skip.grad500");
  assert.equal(graduateExclusionReason("BMGT601", "A"), null, "600-level counts");
});

test("a repeated course counts every attempt unless the first-24-credit exception applies", () => {
  const both = computeGpa([
    { code: "CMSC131", credits: 4, letter: "D", term: "Fall 2024" },
    { code: "CMSC131", credits: 4, letter: "A", term: "Spring 2025" },
  ]);
  assert.equal(both.totalCredits, 8);
  assert.equal(both.gpa, 2.5);

  const dropped = computeGpa([
    { code: "CMSC131", credits: 4, letter: "D", term: "Fall 2024", dropLower: true },
    { code: "CMSC131", credits: 4, letter: "A", term: "Spring 2025", dropLower: true },
  ]);
  assert.equal(dropped.totalCredits, 4, "only the higher attempt survives");
  assert.equal(dropped.gpa, 4);
  assert.equal(dropped.dropped.length, 1);
});

test("a graduate repeat takes the most recent grade even when it is lower", () => {
  const result = computeGpa(
    [
      { code: "CMSC411", credits: 3, letter: "A", term: "Fall 2024", termIndex: 1 },
      { code: "CMSC411", credits: 3, letter: "C", term: "Spring 2025", termIndex: 2 },
    ],
    { level: "graduate" },
  );
  assert.equal(result.gpa, 2);
});

test("term and cumulative GPAs are computed separately", () => {
  const { terms, cumulative } = computeGpaTerms([
    { code: "MATH140", credits: 4, letter: "A", term: "Spring 2025", termIndex: 1 },
    { code: "CMSC132", credits: 4, letter: "B", term: "Fall 2025", termIndex: 2 },
    { code: "PHYS121", credits: 4, letter: "C", term: "Fall 2025", termIndex: 2 },
  ]);
  assert.equal(terms.length, 2);
  assert.equal(terms.find((t) => t.term === "Spring 2025")?.gpa, 4);
  assert.equal(terms.find((t) => t.term === "Fall 2025")?.gpa, 2.5, "B (4cr) + C (4cr) → (12 + 8) ÷ 8");
  assert.equal(cumulative.gpa, 3, "A + B + C → 36 ÷ 12");
});

test("a percent maps to a letter through the scale", () => {
  assert.equal(letterFromPercent(93), "A");
  assert.equal(letterFromPercent(92.9), "A-");
  assert.equal(letterFromPercent(0), "F");
  assert.equal(DEFAULT_LETTER_SCALE.length, 13);
});

/* -------------------------------------------------------------- grading --- */

test("category labels map to canonical buckets, including Chinese", () => {
  assert.equal(canonicalCategory("HW"), "homework");
  assert.equal(canonicalCategory("Problem Sets"), "homework");
  assert.equal(canonicalCategory("Midterm Exam"), "exam");
  assert.equal(canonicalCategory("In-Class Participation"), "participation");
  assert.equal(canonicalCategory("Lab Reports"), "lab");
  assert.equal(canonicalCategory("作业"), "homework");
  assert.equal(canonicalCategory("期中考试"), "exam");
  assert.equal(canonicalCategory("期末"), "final");
  assert.equal(canonicalCategory("课堂参与"), "participation");
});

test("two different midterms are not the same row", () => {
  assert.ok(!labelsAreSameWork("Midterm Exam 1", "Midterm Exam 2"));
  assert.ok(!labelsAreSameWork("Quiz 1", "Quiz 2"));
  assert.ok(!labelsAreSameWork("Written Homework", "Online Homework"));
  assert.ok(labelsAreSameWork("the final exam", "Final Exam"));
  assert.ok(labelsAreSameWork("Final Exam", "Final Exams"));
  assert.ok(categorySimilarity("Homework", "Problem Sets") > 0.7);
});

test("a syllabus maps onto Canvas assignment groups by name", () => {
  const mapping = autoMapCategories(
    [{ id: "a", name: "Homework" }, { id: "b", name: "Midterm Exam" }, { id: "c", name: "Final Exam" }],
    [{ id: 11, name: "Homework" }, { id: 12, name: "Midterms" }, { id: 13, name: "Final" }],
  );
  assert.equal(mapping.a?.groupId, 11);
  assert.equal(mapping.b?.groupId, 12);
  assert.equal(mapping.c?.groupId, 13);
});

const fullCourse = {
  code: "CMSC132",
  scheme: {
    source: "syllabus",
    confirmed: true,
    categories: [
      { id: "hw", name: "Homework", weight: 20, canvasGroupId: 1 },
      { id: "mt", name: "Midterm", weight: 30, canvasGroupId: 2 },
      { id: "fin", name: "Final", weight: 50, canvasGroupId: 3 },
    ],
  },
  canvas: {
    groups: [{ id: 1, name: "Homework" }, { id: 2, name: "Midterms" }, { id: 3, name: "Final" }],
    items: [
      { id: 101, name: "HW1", assignment_group_id: 1, points_possible: 100, score: 90 },
      { id: 102, name: "HW2", assignment_group_id: 1, points_possible: 100, score: 80 },
      { id: 103, name: "Midterm", assignment_group_id: 2, points_possible: 100, score: 70 },
      { id: 104, name: "Final", assignment_group_id: 3, points_possible: 100, score: 60 },
    ],
  },
};

test("a fully graded course is weighted by the syllabus", () => {
  const g = computeCourseGrade(fullCourse);
  assert.equal(g.categories[0]?.currentPct, 85);
  assert.equal(g.categories[1]?.currentPct, 70);
  // 0.20×85 + 0.30×70 + 0.50×60 = 17 + 21 + 30 = 68
  assert.equal(g.current.pct, 68);
  assert.equal(g.weightTotal, 100);
  assert.equal(g.warnings.length, 0);
});

test("ungraded work is excluded from the current score and assumed at full marks for the ceiling", () => {
  const partial = {
    code: "X",
    scheme: {
      source: "syllabus",
      confirmed: true,
      categories: [
        { id: "hw", name: "Homework", weight: 20, canvasGroupId: 1 },
        { id: "fin", name: "Final", weight: 50, canvasGroupId: 2 },
        { id: "part", name: "Participation", weight: 30, canvasGroupId: 3 },
      ],
    },
    canvas: {
      groups: [{ id: 1, name: "Homework" }, { id: 2, name: "Final" }, { id: 3, name: "Participation" }],
      items: [
        { id: 201, name: "HW1", assignment_group_id: 1, points_possible: 100, score: 90 },
        { id: 202, name: "HW2", assignment_group_id: 1, points_possible: 100, score: null },
        { id: 203, name: "Final", assignment_group_id: 2, points_possible: 200, score: null },
        // Participation has nothing posted at all.
      ],
    },
  };
  const g = computeCourseGrade(partial);
  assert.equal(g.current.pct, 90, "only Homework counts, re-normalised");
  assert.equal(g.currentCovered, 20);
  assert.equal(g.categories[0]?.projectedPct, 95);
  assert.equal(g.categories[1]?.projectedPct, 100);
  assert.equal(g.categories[2]?.projectedPct, 100, "an empty category falls back to the fill value");
  // 0.20×95 + 0.50×100 + 0.30×100 = 99
  assert.equal(g.projected.pct, 99);
  assert.equal(computeCourseGrade(partial, { ungradedFillPercent: 80 }).projected.pct, 81);
});

test("a drop-lowest policy removes the weakest item", () => {
  const g = computeCourseGrade({
    code: "Z",
    scheme: {
      source: "syllabus",
      confirmed: true,
      categories: [{ id: "q", name: "Quizzes", weight: 100, canvasGroupId: 9, dropLowest: 1 }],
    },
    canvas: {
      groups: [{ id: 9, name: "Quizzes" }],
      items: [
        { id: 301, name: "Q1", assignment_group_id: 9, points_possible: 10, score: 2 },
        { id: 302, name: "Q2", assignment_group_id: 9, points_possible: 10, score: 8 },
        { id: 303, name: "Q3", assignment_group_id: 9, points_possible: 10, score: 10 },
      ],
    },
  });
  assert.equal(g.current.pct, 90, "(8 + 10) ÷ 20");
  assert.equal(g.droppedItems.length, 1);
});

test("two midterms sharing one Canvas group are separated by assignment name", () => {
  const g = computeCourseGrade({
    code: "S",
    scheme: {
      source: "syllabus",
      confirmed: true,
      categories: [
        { id: "m1", name: "Midterm Exam 1", weight: 15, canvasGroupId: 21 },
        { id: "m2", name: "Midterm Exam 2", weight: 15, canvasGroupId: 21 },
        { id: "fin", name: "Final Exam", weight: 70, canvasGroupId: 22 },
      ],
    },
    canvas: {
      groups: [{ id: 21, name: "Midterms" }, { id: 22, name: "Final" }],
      items: [
        { id: 401, name: "Midterm Exam 1", assignment_group_id: 21, points_possible: 100, score: 80 },
        { id: 402, name: "Midterm Exam 2", assignment_group_id: 21, points_possible: 100, score: 60 },
        { id: 403, name: "Final Exam", assignment_group_id: 22, points_possible: 100, score: 90 },
      ],
    },
  });
  assert.equal(g.categories[0]?.currentPct, 80);
  assert.equal(g.categories[1]?.currentPct, 60);
  assert.equal(g.categories[0]?.totalCount, 1);
  assert.equal(g.categories[1]?.totalCount, 1);
  assert.equal(g.current.pct, 84, "0.15×80 + 0.15×60 + 0.70×90");
  assert.ok(g.warnings.some((w) => w.key.startsWith("warn.sharedGroups")));
});

test("a score typed in by hand counts toward the category it is filed under", () => {
  const g = computeCourseGrade({
    code: "M",
    scheme: { source: "syllabus", confirmed: true, categories: [{ id: "part", name: "Participation", weight: 100, canvasGroupId: null }] },
    canvas: { groups: [], items: [] },
    manualItems: [{ id: "m1", name: "Lecture attendance", categoryId: "part", earned: 18, possible: 20 }],
  });
  assert.equal(g.current.pct, 90);
});

test("weights that do not total 100 and unmapped groups are both reported", () => {
  const g = computeCourseGrade({
    code: "W",
    scheme: {
      source: "syllabus",
      confirmed: true,
      categories: [
        { id: "a", name: "Homework", weight: 20, canvasGroupId: 1 },
        { id: "b", name: "Final", weight: 50, canvasGroupId: 2 },
      ],
    },
    canvas: { groups: [{ id: 1, name: "Homework" }, { id: 2, name: "Final" }, { id: 3, name: "Quizzes" }], items: [] },
  });
  assert.ok(g.warnings.some((w) => w.key === "warn.weightsNot100" && w.params?.total === 70));
  assert.equal(g.unmappedGroups.length, 1);
});

test("what-if maths tells you what the remaining work needs to average", () => {
  const course = {
    code: "P",
    scheme: {
      source: "syllabus",
      confirmed: true,
      categories: [
        { id: "hw", name: "Homework", weight: 50, canvasGroupId: 1 },
        { id: "fin", name: "Final", weight: 50, canvasGroupId: 2 },
      ],
    },
    canvas: {
      groups: [{ id: 1, name: "Homework" }, { id: 2, name: "Final" }],
      items: [
        { id: 1, name: "HW1", assignment_group_id: 1, points_possible: 100, score: 80 },
        { id: 2, name: "Final", assignment_group_id: 2, points_possible: 100, score: null },
      ],
    },
  };
  // 50% of the weight is banked at 80%, so 90% overall needs (90 - 40) / 50 × 100 = 100.
  assert.equal(requiredOnRemaining(course, 90).needed, 100);
  assert.equal(requiredOnRemaining(course, 90).possible, true);
  assert.equal(requiredOnRemaining(course, 95).possible, false, "unreachable");
  assert.equal(requiredOnRemaining(course, 70).needed, 60, "70 overall still needs 60 on the final");
  assert.equal(requiredOnRemaining(course, 40).alreadySecured, true, "40 is already banked");
});

test("a course with no data produces no current score", () => {
  const g = computeCourseGrade({ code: "N", scheme: { source: "syllabus", confirmed: true, categories: [{ id: "a", name: "All", weight: 100 }] }, canvas: { groups: [], items: [] } });
  assert.equal(g.current.pct, null);
  assert.equal(g.projected.pct, 100);
});

/* ------------------------------------------------------------- syllabus --- */

const canonicalOf = canonicalCategory;

test("a dotted-leader grading list is read with its weights and scale", () => {
  const parsed = extractGradingScheme(`
    CMSC132 — Object-Oriented Programming II

    Grading Policy
    Your final grade will be computed as follows:
      Homework .................... 20%
      Projects .................... 25%
      Midterm Exam 1 .............. 15%
      Midterm Exam 2 .............. 15%
      Final Exam .................. 25%
    Late work is not accepted.

    Grading Scale
    A+ 97-100
    A  93-96
    A- 90-92
    B+ 87-89
    B  83-86
    B- 80-82
    C+ 77-79
    C  73-76
    C- 70-72
    D+ 67-69
    D  63-66
    D- 60-62
    F  below 60
  `, { canonicalOf });

  assert.equal(parsed.categories.length, 5);
  assert.equal(parsed.weightTotal, 100);
  assert.deepEqual(parsed.categories.map((c) => c.name), ["Homework", "Projects", "Midterm Exam 1", "Midterm Exam 2", "Final Exam"]);
  assert.equal(parsed.letterScale.find((s) => s.letter === "A")?.min, 93);
  assert.equal(parsed.letterScale.find((s) => s.letter === "A-")?.min, 90);
  assert.equal(parsed.letterScale.length, 13);
  assert.ok(!parsed.warnings.some((w) => w.level === "bad"));
});

test("a tab-separated table is read and its Total row ignored", () => {
  const parsed = extractGradingScheme(`
    Course Requirements and Grading
    Component\tWeight
    Weekly Quizzes\t10%
    Lab Reports\t20%
    Midterm\t25%
    Final Project\t45%
    Total\t100%
  `, { canonicalOf });
  assert.equal(parsed.categories.length, 4);
  assert.ok(!parsed.categories.some((c) => c.name === "Total"));
  assert.equal(parsed.weightTotal, 100);
});

test("prose that wraps across lines is reassembled", () => {
  const parsed = extractGradingScheme(`
    Assessment Overview
    Homework is worth 30% of your final grade. The midterm exam is worth
    30%, and the final exam is worth 40% of your final grade.
    You must earn at least 60% to pass this course.
  `, { canonicalOf });
  assert.equal(parsed.categories.length, 3);
  assert.equal(parsed.weightTotal, 100);
  assert.ok(!parsed.categories.some((c) => /pass|earn/i.test(c.name)), "the pass threshold is not a category");
});

test("a point-based scheme is converted to percentages", () => {
  const parsed = extractGradingScheme(`
    Basis of Grading
    This course is graded out of 1000 points.
    Homework: 300 points
    Quizzes: 150 points
    Midterm Exam: 250 points
    Final Exam: 300 points
  `, { canonicalOf });
  assert.equal(parsed.weightTotal, 100);
  assert.equal(parsed.categories.find((c) => /Homework/i.test(c.name))?.weight, 30);
  assert.equal(parsed.categories.find((c) => /Final/i.test(c.name))?.weight, 30);
  assert.ok(!parsed.categories.some((c) => /graded out of/i.test(c.name)), "the point total is not a category");
});

test("a drop policy attaches to the right category", () => {
  const parsed = extractGradingScheme(`
    Grading
    Weekly quizzes 20%
    Homework 30%
    Final Exam 50%
    The lowest quiz grade will be dropped.
  `, { canonicalOf });
  assert.equal(parsed.categories.find((c) => /quiz/i.test(c.name))?.dropLowest, 1);
  assert.equal(parsed.categories.find((c) => /homework/i.test(c.name))?.dropLowest, 0);
});

test("leading percentages and dot leaders without spaces both work", () => {
  const leading = extractGradingScheme(`
    Grade Breakdown
    15% Participation
    35% Midterm
    50% Final Exam
  `, { canonicalOf });
  assert.equal(leading.categories.length, 3);
  assert.equal(leading.categories.find((c) => /Participation/i.test(c.name))?.weight, 15);

  const leaders = extractGradingScheme(`
    Grading
    Papers..........40%
    Presentations...20%
    Participation...40%
  `, { canonicalOf });
  assert.equal(leaders.categories.length, 3);
  assert.equal(leaders.weightTotal, 100);
});

test("a right-to-left scale is read", () => {
  const parsed = extractGradingScheme(`
    Grading
    Homework 50%
    Final 50%
    Letter Grades
    93-100 = A
    90-92 = A-
    87-89 = B+
    83-86 = B
    80-82 = B-
    77-79 = C+
    73-76 = C
    below 73 = F
  `, { canonicalOf });
  assert.equal(parsed.letterScale.find((s) => s.letter === "A")?.min, 93);
  assert.equal(parsed.letterScale.find((s) => s.letter === "B+")?.min, 87);
  assert.equal(parsed.categories.length, 2, "the scale rows are not weights");
});

test("a Chinese syllabus parses, including a weight with no space before the figure", () => {
  const parsed = extractGradingScheme(`
    课程评分标准
    本课程总评成绩由以下部分组成：
      作业 20%
      期中考试 30%
      期末考试 50%

    等级划分
    A   93-100
    A-  90-92
    B+  87-89
    B   83-86
    B-  80-82
    C+  77-79
    C   73-76
    F   60 分以下
  `, { canonicalOf });
  assert.equal(parsed.categories.length, 3);
  assert.equal(parsed.weightTotal, 100);
  assert.equal(parsed.categories.find((c) => c.name.includes("作业"))?.weight, 20);
  assert.equal(parsed.categories.find((c) => c.name.includes("期中"))?.weight, 30);
  assert.equal(parsed.letterScale.find((s) => s.letter === "A")?.min, 93);

  const unspaced = extractGradingScheme(`
    评分构成
    作业20%
    小测15%
    期末考试65%
  `, { canonicalOf });
  assert.equal(unspaced.categories.length, 3);
  assert.equal(unspaced.weightTotal, 100);
  assert.equal(unspaced.categories.find((c) => c.name.includes("小测"))?.weight, 15);
});

test("a syllabus with no grading section says so instead of inventing one", () => {
  const parsed = extractGradingScheme("This syllabus covers attendance and office hours. Please come to class.", { canonicalOf });
  assert.equal(parsed.categories.length, 0);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.warnings.some((w) => w.level === "bad"));
});

test("a parsed syllabus is pre-mapped onto Canvas groups", () => {
  const parsed = extractGradingScheme(`
    Grading
    Homework 40%
    Midterm Exam 30%
    Final Exam 30%
  `, { canonicalOf });
  const scheme = schemeFromParsed(parsed, [
    { id: 11, name: "Homework" },
    { id: 12, name: "Midterms" },
    { id: 13, name: "Final" },
  ]);
  assert.equal(scheme.source, "syllabus");
  assert.equal(scheme.confirmed, false, "the student must confirm before it is used");
  assert.equal(scheme.categories.find((c) => c.name === "Homework")?.canvasGroupId, 11);
  assert.equal(scheme.categories.find((c) => c.name === "Midterm Exam")?.canvasGroupId, 12);
  assert.equal(scheme.categories.find((c) => c.name === "Final Exam")?.canvasGroupId, 13);
});

/* --------------------------------------------------------- syllabus file --- */

// Build a real (if minimal) .docx in memory: a ZIP with one deflated entry. Using the platform's
// own CompressionStream keeps this honest — the reader is exercised against a genuine deflate
// archive rather than a stub.
async function makeZip(entries) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const data = enc.encode(entry.text);
    const cs = new CompressionStream("deflate-raw");
    const writer = cs.writable.getWriter();
    writer.write(data);
    writer.close();
    const comp = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    const name = enc.encode(entry.name);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 8, true);
    lv.setUint32(18, comp.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);

    parts.push(local, comp);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(20, comp.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    central.push(cd);

    offset += local.length + comp.length;
  }

  const cdSize = central.reduce((sum, c) => sum + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const all = [...parts, ...central, eocd];
  const out = new Uint8Array(all.reduce((sum, c) => sum + c.length, 0));
  let at = 0;
  for (const chunk of all) { out.set(chunk, at); at += chunk.length; }
  return out;
}

const DOCX_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
  <w:p><w:r><w:t>CMSC216 — Introduction to Computer Systems</w:t></w:r></w:p>
  <w:p><w:r><w:t>Grading Policy</w:t></w:r></w:p>
  <w:tbl>
    <w:tr><w:tc><w:p><w:r><w:t>Component</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Weight</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>Projects</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>30%</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>Homework</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>15%</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>Midterm Exam 1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>15%</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>Midterm Exam 2</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>15%</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>Final Exam</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>25%</w:t></w:r></w:p></w:tc></w:tr>
  </w:tbl>
  <w:p><w:r><w:t>The lowest homework grade will be dropped.</w:t></w:r></w:p>
  <w:p><w:r><w:t>Late projects lose 10% per day.</w:t></w:r></w:p>
  <w:p><w:r><w:t>Grading Scale</w:t></w:r></w:p>
  <w:p><w:r><w:t>A 93-96</w:t></w:r></w:p>
  <w:p><w:r><w:t>A- 90-92</w:t></w:r></w:p>
  <w:p><w:r><w:t>B+ 87-89</w:t></w:r></w:p>
  <w:p><w:r><w:t>B 83-86</w:t></w:r></w:p>
  <w:p><w:r><w:t>B- 80-82</w:t></w:r></w:p>
  <w:p><w:r><w:t>C+ 77-79</w:t></w:r></w:p>
  <w:p><w:r><w:t>C 73-76</w:t></w:r></w:p>
  <w:p><w:r><w:t>F below 60</w:t></w:r></w:p>
  <w:p><w:r><w:t>Academic Integrity</w:t></w:r></w:p>
  <w:p><w:r><w:t>All work must be your own. Referred to the Office of Student Conduct.</w:t></w:r></w:p>
</w:body></w:document>`;

test("a .docx is unpacked by hand, with no extra dependency", async () => {
  const zip = await makeZip([
    { name: "[Content_Types].xml", text: "<Types/>" },
    { name: "word/document.xml", text: DOCX_SAMPLE },
  ]);

  const found = await readZipEntry(zip.buffer, "word/document.xml");
  assert.ok(found, "the document part is located through the ZIP central directory");
  assert.equal(await readZipEntry(zip.buffer, "word/missing.xml"), null);

  const text = docxXmlToText(new TextDecoder().decode(found));
  const flat = text.replace(/\s+/g, " ");
  // The table must survive as tab-separated rows, or the weights lose their labels.
  assert.ok(/Homework\t15%/.test(text), `expected "Homework\\t15%" in:\n${text}`);
  assert.ok(/Final Exam\t25%/.test(text), "the last row survives too");
  assert.ok(flat.includes("The lowest homework grade will be dropped."));
});

test("a Word table becomes a grading structure", async () => {
  const zip = await makeZip([{ name: "word/document.xml", text: DOCX_SAMPLE }]);
  const text = docxXmlToText(new TextDecoder().decode(await readZipEntry(zip.buffer, "word/document.xml")));
  const parsed = extractGradingScheme(text, { canonicalOf: canonicalCategory });

  assert.equal(parsed.categories.length, 5);
  assert.equal(parsed.weightTotal, 100);
  assert.deepEqual(
    parsed.categories.map((c) => `${c.name}=${c.weight}`),
    ["Projects=30", "Homework=15", "Midterm Exam 1=15", "Midterm Exam 2=15", "Final Exam=25"],
  );
  assert.equal(parsed.categories.find((c) => c.name === "Homework")?.dropLowest, 1);
  assert.equal(parsed.letterScale.find((s) => s.letter === "A")?.min, 93);
  assert.ok(!parsed.categories.some((c) => /integrity|conduct|per day/i.test(c.name)), "prose is not a weight");
});

test("the docx XML pass handles entities and inline breaks", () => {
  const xml = `<w:document><w:body><w:p><w:r><w:t>Homework &amp; Labs</w:t></w:r><w:br/><w:r><w:t>20% &lt;minimum&gt;</w:t></w:r></w:p></w:body></w:document>`;
  const text = docxXmlToText(xml);
  assert.ok(text.includes("Homework & Labs"), text);
  assert.ok(text.includes("20% <minimum>"), text);
  assert.equal(text.split("\n").length, 2, "the break starts a new line");
});

/* ------------------------------------------------------------ pdf lines --- */

test("pdf text items are reassembled by position, not document order", () => {
  // A grading table: label and weight are separate items on the same baseline.
  const items = [
    { str: "Projects", transform: [11, 0, 0, 11, 72, 700], width: 44 },
    { str: "30%", transform: [11, 0, 0, 11, 420, 700], width: 20 },
    { str: "Homework", transform: [11, 0, 0, 11, 72, 684], width: 52 },
    { str: "15%", transform: [11, 0, 0, 11, 420, 684], width: 20 },
    // Deliberately out of order in the array.
    { str: "Grading Policy", transform: [13, 0, 0, 13, 72, 730], width: 90 },
  ];
  const text = pdfPageLines(items);
  const lines = text.split("\n");
  assert.deepEqual(lines, ["Grading Policy", "Projects\t30%", "Homework\t15%"]);

  const parsed = extractGradingScheme(text, { canonicalOf: canonicalCategory });
  assert.equal(parsed.weightTotal, 45, "two of the rows read");
  assert.equal(parsed.categories.find((c) => c.name === "Projects")?.weight, 30);
});

test("overlapping pdf runs are separated rather than fused", () => {
  // A heading and the first row can share a baseline; without a separator they glue together.
  const text = pdfPageLines([
    { str: "Grading Scale", transform: [13, 0, 0, 13, 72, 600], width: 85 },
    { str: "A+", transform: [11, 0, 0, 11, 72, 600], width: 16 },
    { str: "97-100", transform: [11, 0, 0, 11, 420, 600], width: 40 },
  ]);
  assert.equal(text, "Grading Scale A+\t97-100");
});

test("file kinds are recognised from the name and the MIME type", () => {
  assert.equal(fileKind({ name: "syllabus.pdf" }), "pdf");
  assert.equal(fileKind({ name: "Syllabus.DOCX" }), "docx");
  assert.equal(fileKind({ name: "old.doc" }), "doc");
  assert.equal(fileKind({ name: "notes.txt" }), "txt");
  assert.equal(fileKind({ name: "a.pdf", type: "application/pdf" }), "pdf");
  assert.equal(fileKind({ name: "mystery" }), null);
  assert.equal(fileKind({ name: "scan.png" }), null);
});

/* ------------------------------------------------------- sample first term --- */

test("the sample term is coherent: every course scores, every scheme totals 100", () => {
  const courses = sampleTerm();
  assert.equal(courses.length, 2);
  assert.ok(courses.every((c) => c.source === "sample"), "flagged so real data can replace it");

  for (const course of courses) {
    const total = course.scheme.categories.reduce((sum, c) => sum + c.weight, 0);
    assert.equal(total, 100, `${course.code} weights total ${total}`);

    const grade = computeCourseGrade(course);
    assert.equal(grade.warnings.filter((w) => w.level !== "info").length, 0,
      `${course.code} raises a warning: ${grade.warnings.map((w) => w.key).join(", ")}`);
    assert.ok(grade.current.pct !== null && grade.current.pct > 0 && grade.current.pct <= 100,
      `${course.code} current is ${grade.current.pct}`);
    assert.ok(grade.projected.pct !== null && grade.projected.pct >= grade.current.pct,
      "the ceiling is never below the current score");

    const letter = letterFromPercent(grade.current.pct);
    assert.ok(/^[A-F][+-]?$/.test(letter), `${course.code} letter is ${letter}`);
  }
});

test("the sample term produces a GPA the summary can show", () => {
  const rows = sampleTerm().map((course, index) => {
    const grade = computeCourseGrade(course);
    return {
      code: course.code,
      credits: course.credits,
      letter: letterFromPercent(grade.current.pct),
      termIndex: index,
      repeatKey: course.code,
    };
  });
  const { gpa, totalCredits, counted } = computeGpa(rows);
  assert.equal(counted.length, 2);
  assert.equal(totalCredits, 8);
  assert.ok(gpa !== null && gpa > 0 && gpa <= 4, `sample GPA is ${gpa}`);

  // CMSC132: Projects 88.5% (30) + Homework 90% after dropping the 12/20 (15)
  //          + Midterm 1 88% (15) + Midterm 2 81% (15), the ungraded final excluded.
  const cmsc = computeCourseGrade(sampleTerm()[0]);
  assert.equal(cmsc.current.pct, 87.2, "(30x88.5 + 15x90 + 15x88 + 15x81) / 75");
  assert.equal(cmsc.droppedItems.length, 1, "the sample exercises drop-lowest");
  // The sample deliberately puts both midterms in one Canvas group, so it carries the
  // informational note about matching by assignment name — nothing that needs fixing.
  assert.equal(cmsc.warnings.filter((w) => w.level !== "info").length, 0, "nothing to act on");
  assert.ok(cmsc.warnings.some((w) => w.key.startsWith("warn.sharedGroups")),
    "and it shows the two-midterms-one-group case");
});

/* -------------------------- a real UMD syllabus: schedule first, tables after --- */

// The shape that broke the parser in the field: the word "grades" appears in a schedule line
// long before the real heading, the weight table is a Word table, and the letter scale carries a
// third GPA column plus two letters in one band ("A / A+").
const BMGT_SYLLABUS = [
  "BMGT110F - Introduction to the Business Value Chain",
  "",
  "12/11/17 & 1/26\tBusiness Ethics\tNMM Chapter 3\tProf. Mund",
  "13/11/24 & 11/26\tOperations Management (11/24) and no class (11/26) - Thanksgiving\tNMM Chapter 8\tProf. Mund",
  "15/12/8 & 12/10\tTeam Presentations (12/8) and Exam #2 (12/10)\t\tProf. Mund",
  "",
  "Connect SmartBook for each week is due Sunday at 11:59pm at the end of that week.",
  "",
  "Midterm grades posted",
  "",
  "Wednesday to Sunday, November 25-29",
  "Thanksgiving recess, no classes. Our Thursday session is cancelled.",
  "",
  "Wednesday, December 2",
  "Group final paper due, 11:59pm",
  "",
  "Grading Structure",
  "Assignment\tPercentage %",
  "Connect SmartBook Exercises\t15%",
  "Discussion Posts & Class Participation\t10%",
  "Group Project\t25%",
  "Exam #1\t25%",
  "Exam #2\t25%",
  "Total\t100%",
  "",
  "MSGSE indicates a Major Scheduled Graded Event, which is subject to the University absence policy.",
  "",
  "Letter Grades",
  "Grade average\tLetter\tGPA",
  "93-100\tA / A+\t4.0",
  "90-92.9\tA-\t3.7",
  "87-89.9\tB+\t3.3",
  "83-86.9\tB\t3.0",
  "80-82.9\tB-\t2.7",
  "77-79.9\tC+\t2.3",
  "73-76.9\tC\t2.0",
].join("\n");

test("the grading heading is the real one, not a schedule line that merely says 'grades'", () => {
  const parsed = extractGradingScheme(BMGT_SYLLABUS, { canonicalOf: canonicalCategory });
  assert.equal(parsed.gradingHeading, "Grading Structure",
    `picked ${JSON.stringify(parsed.gradingHeading)}`);
  // And the excerpt shown to the student must contain the table they are being asked to confirm.
  // The excerpt is normalised text (tabs already collapsed to single spaces), so assert the row
  // survives as ONE line rather than as a tab.
  assert.ok(/^Connect SmartBook Exercises 15%$/m.test(parsed.snippet),
    `snippet was:\n${parsed.snippet}`);
  assert.ok(!/Thanksgiving recess/.test(parsed.snippet),
    "the schedule before the table must not be what gets shown");
});

test("the weights come out of the Word table", () => {
  const parsed = extractGradingScheme(BMGT_SYLLABUS, { canonicalOf: canonicalCategory });
  assert.equal(parsed.weightTotal, 100);
  assert.deepEqual(parsed.categories.map((c) => `${c.name}=${c.weight}`), [
    "Connect SmartBook Exercises=15",
    "Discussion Posts & Class Participation=10",
    "Group Project=25",
    "Exam #1=25",
    "Exam #2=25",
  ]);
});

test("a letter scale with a GPA column and two letters per band is read", () => {
  const parsed = extractGradingScheme(BMGT_SYLLABUS, { canonicalOf: canonicalCategory });
  assert.equal(parsed.scaleConfident, true, `scale was ${JSON.stringify(parsed.letterScale)}`);
  const min = (letter) => parsed.letterScale.find((s) => s.letter === letter)?.min;
  assert.equal(min("A"), 93, "93-100 A / A+");
  assert.equal(min("A-"), 90, "90-92.9 A- 3.7 — the trailing GPA must not defeat the match");
  assert.equal(min("B+"), 87);
  assert.equal(min("B"), 83);
  assert.equal(min("B-"), 80);
  assert.equal(min("C+"), 77);
  assert.equal(min("C"), 73);
  assert.equal(parsed.letterScale.length, 7);
});

/* ------------------------------------------- several Canvas groups, one category --- */

test("one category can draw from several Canvas groups", () => {
  const grade = computeCourseGrade({
    code: "MULTI",
    scheme: {
      source: "syllabus",
      confirmed: true,
      categories: [
        { id: "sb", name: "Connect SmartBook Exercises", weight: 40, canvasGroupIds: [1, 2] },
        { id: "fin", name: "Final Exam", weight: 60, canvasGroupIds: [3] },
      ],
    },
    canvas: {
      groups: [{ id: 1, name: "SmartBook" }, { id: 2, name: "Exercises" }, { id: 3, name: "Final" }],
      items: [
        { id: 1, name: "SB1", assignment_group_id: 1, points_possible: 10, score: 9 },
        { id: 2, name: "EX1", assignment_group_id: 2, points_possible: 10, score: 7 },
        { id: 3, name: "Final", assignment_group_id: 3, points_possible: 100, score: 80 },
      ],
    },
  });
  assert.deepEqual(grade.categories[0].canvasGroupIds, [1, 2]);
  assert.equal(grade.categories[0].totalCount, 2, "both groups feed the one category");
  assert.equal(grade.categories[0].currentPct, 80, "(9 + 7) ÷ 20");
  assert.equal(grade.current.pct, 80, "0.4×80 + 0.6×80");
  assert.equal(grade.unmappedGroups.length, 0, "nothing is left unclaimed");
  assert.equal(grade.warnings.filter((w) => w.key.startsWith("warn.unmappedGroups")).length, 0);
});

test("the older single-group field is still read", () => {
  const legacy = {
    code: "OLD",
    scheme: {
      source: "syllabus",
      confirmed: true,
      categories: [{ id: "hw", name: "Homework", weight: 100, canvasGroupId: 7 }],
    },
    canvas: {
      groups: [{ id: 7, name: "Homework" }],
      items: [{ id: 1, name: "HW1", assignment_group_id: 7, points_possible: 10, score: 8 }],
    },
  };
  assert.deepEqual(categoryGroupIds(legacy.scheme.categories[0]), [7]);
  assert.equal(computeCourseGrade(legacy).current.pct, 80);
});

test("deselecting every group leaves the category unmapped rather than falling back", () => {
  // canvasGroupId is kept as the first selection for older readers, so an empty selection must not
  // be resurrected by that field still holding the previous value.
  const cat = { id: "x", name: "X", weight: 100, canvasGroupIds: [], canvasGroupId: 5 };
  assert.deepEqual(categoryGroupIds(cat), []);
});

test("no Canvas group feeds two categories unless it really does", () => {
  const grade = computeCourseGrade({
    code: "SPLIT",
    scheme: {
      source: "syllabus",
      confirmed: true,
      categories: [
        { id: "a", name: "Exam 1", weight: 50, canvasGroupIds: [1] },
        { id: "b", name: "Exam 2", weight: 50, canvasGroupIds: [2] },
      ],
    },
    canvas: {
      groups: [{ id: 1, name: "Exams" }, { id: 2, name: "Exams" }],
      items: [
        { id: 1, name: "Exam 1", assignment_group_id: 1, points_possible: 100, score: 90 },
        { id: 2, name: "Exam 2", assignment_group_id: 2, points_possible: 100, score: 70 },
      ],
    },
  });
  assert.equal(grade.categories[0].currentPct, 90);
  assert.equal(grade.categories[1].currentPct, 70);
  assert.equal(grade.warnings.filter((w) => w.key.startsWith("warn.sharedGroups")).length, 0,
    "separate groups are not a shared group, even when they share a name");
});

/* ------------------------------------------------- non-credit Canvas shells --- */

// The real enrolment list that prompted this: four graded courses among eight non-credit shells.
const CANVAS_TERM = [
  { code: "AI-info-literacy", want: false },
  { code: "BMGT110F", want: true },
  { code: "BMGT298J", want: true },
  { code: "CMSC131", want: true },
  { code: "ENGL101H", want: true },
  { code: "Excel 2026/2027", want: false },
  { code: "GEMS101", want: true },
  { code: "GemsYear1", want: false },
  { code: "SVPAAP_NCR_ISOF26", want: false },
  { code: "micromobility-at-umd", want: false },
  { code: "STTS26", want: false },
  { code: "FERPA Tutorial", want: false },
];

test("for-credit UMD courses are told apart from non-credit Canvas shells", () => {
  for (const { code, want } of CANVAS_TERM) {
    assert.equal(looksForCredit(code).forCredit, want, `${code} → expected forCredit=${want}`);
  }
});

test("the course-code rule holds for the awkward shapes", () => {
  // Section suffixes and section lists must not defeat it.
  assert.equal(looksForCredit("BMGT110F-0401,0501,0601").forCredit, true);
  assert.equal(looksForCredit("CMSC131-0101").forCredit, true);
  // Zero-level courses still count as courses; the GPA engine is what excludes them.
  assert.equal(looksForCredit("MATH003").forCredit, true);
  // Near misses that share letters with a real code.
  assert.equal(looksForCredit("EXCEL2026").forCredit, false, "EXCEL is five letters");
  assert.equal(looksForCredit("STTS26").forCredit, false, "only two digits");
  assert.equal(looksForCredit("").forCredit, false);
});

test("non-credit courses are set aside, not deleted, and hand-added ones are untouched", () => {
  const courses = [
    { code: "CMSC131", source: "canvas", forCredit: true },
    { code: "STTS26", source: "canvas", forCredit: false },
    { code: "FERPA Tutorial", source: "canvas", forCredit: false },
    { code: "MATH141", source: "manual" },
    { code: "ENGL101", source: "sample" },
  ];
  const { forCredit, nonCredit } = partitionByCredit(courses);
  assert.deepEqual(forCredit.map((c) => c.code), ["CMSC131", "MATH141", "ENGL101"],
    "manual and sample courses are never judged");
  assert.deepEqual(nonCredit.map((c) => c.code), ["STTS26", "FERPA Tutorial"]);

  // The verdict is also applied at merge time, so a course synced without the flag still lands right.
  assert.equal(looksForCredit("STTS26").forCredit, false);
});

/* ------------------------------------------- automatic mapping onto groups --- */

test("real UMD labels match their Canvas groups, platform names included", () => {
  // Textbook and submission platforms are the usual reason a pair fails: the platform name is the
  // only word the two share. Every one of these used to score below the 0.34 threshold.
  const pairs = [
    ["Connect SmartBook Exercises", "SmartBook"],
    ["Connect SmartBook Exercises", "Connect"],
    ["Connect SmartBook Exercises", "McGraw-Hill Connect"],
    ["WebAssign Homework", "Homework"],
    ["Discussion Posts & Class Participation", "Discussions"],
    ["Discussion Posts & Class Participation", "Discussion Board Participation"],
    ["Group Project", "Projects"],
    ["Exam #1", "Exams"],
    ["Midterm Exam 1", "Midterms"],
    ["Lab Reports", "Labs"],
    ["Weekly Quizzes", "Quizzes"],
    ["Term Paper", "Papers"],
    ["Attendance", "Participation"],
    ["Reading Responses", "Readings"],
    ["Problem Sets", "Assignments"],
    ["Homework", "Assignments"],
    ["ALEKS Homework", "ALEKS"],
    ["Pearson Mastering", "Mastering"],
    ["zyBooks Labs", "zyBooks"],
    ["Gradescope Submissions", "Assignments"],
    ["Case Studies", "Case Study"],
    ["In-Class Activities", "Participation"],
    ["Group Work", "Group Project"],
    ["Written Assignments", "Writing"],
    ["Perusall Annotations", "Readings"],
    ["Top Hat Questions", "Participation"],
    ["Reflections", "Journals"],
  ];
  const failed = pairs.filter(([a, b]) => categorySimilarity(a, b) < 0.34);
  assert.deepEqual(failed, [], "these pairs must all clear the threshold");
});

test("a lone generic Canvas group catches every category", () => {
  const cats = [
    { id: "c1", name: "Connect SmartBook Exercises" },
    { id: "c2", name: "Discussion Posts & Class Participation" },
    { id: "c3", name: "Group Project" },
    { id: "c4", name: "Exam #1" },
    { id: "c5", name: "Exam #2" },
  ];
  const one = autoMapCategories(cats, [{ id: 1, name: "Assignments" }]);
  assert.equal(Object.keys(one).length, 5, "every category lands somewhere");
  assert.equal(one.c1.confidence, 0.82, "the by-name match keeps its confidence");
  assert.equal(one.c2.confidence, 0.3, "the leftovers are flagged low-confidence");
  assert.equal(one.c5.generic, true, "and marked as a fallback");
  assert.equal(one.c1.generic, undefined, "a named match is not marked");
});

test("a specific group beats the generic fallback", () => {
  const cats = [
    { id: "c1", name: "Connect SmartBook Exercises" },
    { id: "c2", name: "Discussion Posts & Class Participation" },
    { id: "c3", name: "Group Project" },
    { id: "c4", name: "Exam #1" },
  ];
  const many = autoMapCategories(cats, [
    { id: 1, name: "Assignments" }, { id: 2, name: "Exams" }, { id: 3, name: "Projects" },
  ]);
  assert.equal(many.c4.groupId, 2, "exam goes to Exams, not the fallback");
  assert.equal(many.c3.groupId, 3, "project goes to Projects");
  assert.equal(many.c2.groupId, 1, "participation falls back to Assignments");
  assert.equal(many.c2.generic, true);
  assert.equal(many.c4.generic, undefined);
});

test("two midterms may share one Canvas group", () => {
  // The item-level split exists for exactly this, so the mapper must not claim groups exclusively.
  const two = autoMapCategories(
    [{ id: "m1", name: "Midterm Exam 1" }, { id: "m2", name: "Midterm Exam 2" }],
    [{ id: 7, name: "Midterms" }],
  );
  assert.equal(two.m1.groupId, 7);
  assert.equal(two.m2.groupId, 7);
});

/* ------------------------------------------------ what do I need for X%? --- */

test("an unreachable target is reported as unreachable, not as 80% needed", () => {
  // One category, half of it graded at 50%. The best possible outcome is 75%, so 90% cannot be
  // reached — but the category's running percentage (50%) used to be banked as though the whole
  // category were graded, and the ungraded half was then counted again as weight still to come.
  const course = {
    code: "PART",
    scheme: {
      source: "syllabus",
      confirmed: true,
      categories: [{ id: "all", name: "Everything", weight: 100, canvasGroupIds: [1] }],
    },
    canvas: {
      groups: [{ id: 1, name: "Assignments" }],
      items: [
        { id: 1, name: "Graded", assignment_group_id: 1, points_possible: 100, score: 50 },
        { id: 2, name: "Ungraded", assignment_group_id: 1, points_possible: 100, score: null },
      ],
    },
  };

  const g = computeCourseGrade(course);
  assert.equal(g.categories[0].earned, 50);
  assert.equal(g.categories[0].possible, 100, "possible covers the graded items only");
  assert.equal(g.categories[0].ungradedPossible, 100);

  const need = requiredOnRemaining(course, 90);
  assert.equal(need.possible, false, "90% is out of reach");
  assert.ok(need.needed > 100, `needed should exceed 100, got ${need.needed}`);
  assert.equal(need.banked, 25, "half the points banked at half the category");
  assert.equal(need.remainingWeight, 50);

  // And the ceiling really is 75%.
  assert.equal(g.projected.pct, 75);
});

test("a partly graded category asks for what is genuinely still needed", () => {
  // Homework fully graded at 100%; Exams half graded at 60%. 50 banked + 15 banked = 65, with 25
  // left to play for, so 90% overall needs the remaining exam to be perfect.
  const course = {
    code: "MIX",
    scheme: {
      source: "syllabus",
      confirmed: true,
      categories: [
        { id: "hw", name: "Homework", weight: 50, canvasGroupIds: [1] },
        { id: "ex", name: "Exams", weight: 50, canvasGroupIds: [2] },
      ],
    },
    canvas: {
      groups: [{ id: 1, name: "Homework" }, { id: 2, name: "Exams" }],
      items: [
        { id: 1, name: "HW", assignment_group_id: 1, points_possible: 100, score: 100 },
        { id: 2, name: "Exam 1", assignment_group_id: 2, points_possible: 100, score: 60 },
        { id: 3, name: "Exam 2", assignment_group_id: 2, points_possible: 100, score: null },
      ],
    },
  };

  const need = requiredOnRemaining(course, 90);
  assert.equal(need.banked, 65);
  assert.equal(need.remainingWeight, 25);
  assert.equal(need.needed, 100, "the remaining exam must be perfect");

  // 65% is already secured; 40% is not.
  assert.equal(requiredOnRemaining(course, 60).alreadySecured, true);
  assert.equal(requiredOnRemaining(course, 80).alreadySecured, false);
});

/* ------------------------------------------------------ re-importing --- */

test("a second import merges, keeping the student's own work and the course id", () => {
  // The first import brings a course across.
  const payload = {
    format: "terpplan.canvas-export",
    me: { name: "Dayou He" },
    courses: [{
      canvasId: 555001, code: "BMGT110F", title: "Intro to the Business Value Chain",
      term: "Fall 2026", canvasCurrentScore: 91, canvasCurrentGrade: "A-",
      canvasUrl: "https://umd.instructure.com/courses/555001", syllabusBody: null,
    }],
    detail: { 555001: { groups: [{ id: 1, name: "Assignments", weight: null, position: 1 }], items: [] } },
  };

  let courses = [];
  const first = mergeCanvasData(courses, payload, () => "course-generated-1");
  assert.equal(first.added, 1);
  courses = first.courses;
  const idAfterFirst = courses[0].id;

  // The student then fills in what Canvas cannot supply.
  Object.assign(courses[0], {
    credits: 3,
    overrides: { letter: "A" },
    manualItems: [{ id: "m1", name: "Participation", categoryId: "c", earned: 10, possible: 10 }],
    scheme: { source: "syllabus", confirmed: true, categories: [{ id: "c", name: "Everything", weight: 100, canvasGroupIds: [1] }] },
  });

  // A mid-term refresh re-imports the same course.
  const second = mergeCanvasData(courses, payload, () => "course-generated-2");
  assert.equal(second.updated, 1, "the second import updates rather than adds");
  assert.equal(second.added, 0);
  courses = second.courses;
  assert.equal(courses.length, 1, "no duplicate course");

  const kept = courses[0];
  assert.equal(kept.id, idAfterFirst, "the course id is stable across imports");
  assert.equal(kept.credits, 3, "credit hours survive a re-import");
  assert.deepEqual(kept.overrides, { letter: "A" }, "the letter override survives");
  assert.equal(kept.manualItems.length, 1, "hand-typed scores survive");
  assert.equal(kept.scheme.categories.length, 1, "the grading scheme survives");
  assert.equal(kept.canvasCurrentScore, 91, "the Canvas half is refreshed");
});

/* --------------------------------------------- Canvas in unweighted mode --- */

test("an unweighted Canvas course matches Canvas, which grades by total points", () => {
  // Exams 90/100 and Homework 10/100 + 10/100. Canvas has apply_assignment_group_weights = false,
  // so it computes 110/300 = 36.67%. Equal-weighting the two groups gives 50% instead.
  const course = {
    code: "UNWEIGHTED",
    weighted: false,
    canvas: {
      groups: [{ id: 1, name: "Exams", weight: null }, { id: 2, name: "Homework", weight: null }],
      items: [
        { id: 1, name: "Exam", assignment_group_id: 1, points_possible: 100, score: 90 },
        { id: 2, name: "HW 1", assignment_group_id: 2, points_possible: 100, score: 10 },
        { id: 3, name: "HW 2", assignment_group_id: 2, points_possible: 100, score: 10 },
      ],
    },
  };
  const g = computeCourseGrade(course);
  assert.equal(g.categories.length, 2);
  assert.equal(g.categories[0].currentPct, 90);
  assert.equal(g.categories[1].currentPct, 10);
  // Weighted by group totals: 100 points of exams, 200 of homework.
  assert.deepEqual(g.categories.map((c) => c.weight), [100, 200]);
  assert.equal(Math.round(g.current.pct * 100) / 100, 36.67, "matches Canvas");
  assert.ok(g.warnings.some((w) => w.key === "info.canvasNoWeights"), "and says so");
});

test("a weighted Canvas course still uses group weights", () => {
  const course = {
    code: "WEIGHTED",
    weighted: true,
    canvas: {
      groups: [{ id: 1, name: "Exams", weight: 70 }, { id: 2, name: "Homework", weight: 30 }],
      items: [
        { id: 1, name: "Exam", assignment_group_id: 1, points_possible: 100, score: 90 },
        { id: 2, name: "HW", assignment_group_id: 2, points_possible: 100, score: 10 },
      ],
    },
  };
  const g = computeCourseGrade(course);
  assert.deepEqual(g.categories.map((c) => c.weight), [70, 30]);
  assert.equal(Math.round(g.current.pct * 100) / 100, 66, "0.7x90 + 0.3x10");
  assert.equal(g.warnings.some((w) => w.key === "info.canvasNoWeights"), false);
});

/* --------------------------------------------------------- extra credit --- */

test("a bonus on a zero-point assignment lifts the score instead of being dropped", () => {
  // Quiz 6/10, Quiz 8/10, Bonus 5/0, drop the lowest one.
  const course = {
    code: "EC",
    scheme: {
      source: "syllabus",
      confirmed: true,
      categories: [{ id: "q", name: "Quizzes", weight: 100, dropLowest: 1, canvasGroupIds: [1] }],
    },
    canvas: {
      groups: [{ id: 1, name: "Quizzes" }],
      items: [
        { id: 1, name: "Quiz 1", assignment_group_id: 1, points_possible: 10, score: 6 },
        { id: 2, name: "Quiz 2", assignment_group_id: 1, points_possible: 10, score: 8 },
        { id: 3, name: "Bonus", assignment_group_id: 1, points_possible: 0, score: 5 },
      ],
    },
  };

  const g = computeCourseGrade(course);
  const c = g.categories[0];

  assert.deepEqual(c.droppedItems.map((i) => i.name), ["Quiz 1"], "the worst quiz is dropped");
  assert.equal(c.earned, 13, "the surviving quiz plus the bonus");
  assert.equal(c.possible, 10, "the bonus adds nothing to the denominator");
  assert.equal(c.currentPct, 130, "8 + 5 out of 10");
});

test("a bonus counts even without drop-lowest", () => {
  const course = {
    code: "EC2",
    scheme: {
      source: "syllabus",
      confirmed: true,
      categories: [{ id: "q", name: "Quizzes", weight: 100, canvasGroupIds: [1] }],
    },
    canvas: {
      groups: [{ id: 1, name: "Quizzes" }],
      items: [
        { id: 1, name: "Quiz 1", assignment_group_id: 1, points_possible: 10, score: 8 },
        { id: 2, name: "Bonus", assignment_group_id: 1, points_possible: 0, score: 2 },
      ],
    },
  };
  const c = computeCourseGrade(course).categories[0];
  assert.equal(c.earned, 10);
  assert.equal(c.possible, 10);
  assert.equal(c.currentPct, 100, "the bonus offsets the two missed points exactly");
  assert.equal(c.droppedItems.length, 0);
});

test("an unweighted course matches Canvas mid-term, when not everything is graded", () => {
  // Exam 1 scored 90/100, Exam 2 ungraded; Homework 10/100 and 10/100. Canvas counts the graded
  // work only: 110/300 = 36.67%. Weighting each group by its total points gives 50% instead,
  // because Exam 2's points inflate the Exam group even though it has no score yet.
  const course = {
    code: "UNWEIGHTED-MIDTERM",
    weighted: false,
    canvas: {
      groups: [{ id: 1, name: "Exams", weight: null }, { id: 2, name: "Homework", weight: null }],
      items: [
        { id: 1, name: "Exam 1", assignment_group_id: 1, points_possible: 100, score: 90 },
        { id: 2, name: "Exam 2", assignment_group_id: 1, points_possible: 100, score: null },
        { id: 3, name: "HW 1", assignment_group_id: 2, points_possible: 100, score: 10 },
        { id: 4, name: "HW 2", assignment_group_id: 2, points_possible: 100, score: 10 },
      ],
    },
  };
  const g = computeCourseGrade(course);
  assert.equal(Math.round(g.current.pct * 100) / 100, 36.67, "matches Canvas's current score");
  // Ceiling with everything ungraded at 100%: (110 + 100) / 400 = 52.5%
  assert.equal(Math.round(g.projected.pct * 100) / 100, 52.5);

  // Point weights are not percentages, so the "weights add up to 400%" warning must not fire.
  assert.equal(g.warnings.some((w) => w.key === "warn.weightsNot100"), false,
    "point totals are not a percentage scheme");
  assert.ok(g.warnings.some((w) => w.key === "info.canvasNoWeights"), "but it does say Canvas is unweighted");
});

test("an unweighted course with everything graded still matches Canvas", () => {
  const course = {
    code: "UNWEIGHTED-FULL",
    weighted: false,
    canvas: {
      groups: [{ id: 1, name: "Exams", weight: null }, { id: 2, name: "Homework", weight: null }],
      items: [
        { id: 1, name: "Exam", assignment_group_id: 1, points_possible: 100, score: 90 },
        { id: 2, name: "HW 1", assignment_group_id: 2, points_possible: 100, score: 10 },
        { id: 3, name: "HW 2", assignment_group_id: 2, points_possible: 100, score: 10 },
      ],
    },
  };
  const g = computeCourseGrade(course);
  assert.equal(Math.round(g.current.pct * 100) / 100, 36.67);
  assert.equal(g.warnings.some((w) => w.key === "warn.weightsNot100"), false);
});

/* ------------------------------------------------ review round 2: parsing --- */

const parse = (text) => extractGradingScheme(text, { canonicalOf: canonicalCategory });

test("roman numerals are ordinals, so exam I and exam II stay separate", () => {
  const r = parse("Midterm exam I 20%\nMidterm exam II 20%\nFinal exam 60%");
  assert.deepEqual(r.categories.map((c) => c.name),
    ["Midterm exam I", "Midterm exam II", "Final exam"]);
  assert.equal(r.weightTotal, 100, "the first midterm is no longer swallowed");
});

test("a letter scale opening with a heading still yields its first entry", () => {
  const r = parse("Letter grades: A 93-100, A- 90-92, B+ 87-89, B 83-86, C 73-76");
  assert.equal(r.scaleConfident, true);
  const min = (letter) => r.letterScale.find((s) => s.letter === letter)?.min;
  assert.equal(min("A"), 93, "A was lost behind the 'Letter grades:' heading");
  assert.equal(min("A-"), 90);
  assert.equal(min("B+"), 87);
});

test("a cut-off table collapsed onto one line is still read", () => {
  // What pdfPageLines reconstructs from a 3x5 grid: one long run of LETTER PERCENT pairs.
  const r = parse("A+ 97.00% B+ 87.00% C+ 77.00% D+ 67.00% F 0.00%");
  assert.equal(r.scaleConfident, true);
  const min = (letter) => r.letterScale.find((s) => s.letter === letter)?.min;
  assert.equal(min("A+"), 97);
  assert.equal(min("B+"), 87);
  assert.equal(min("C+"), 77);
  assert.equal(min("F"), 0);
});

test("a bracket inside a label is kept", () => {
  const r = parse("Homework (5) 30%\nIn-class participation (Top Hat) 10%\nFinal exam 60%");
  assert.deepEqual(r.categories.map((c) => c.name),
    ["Homework (5)", "In-class participation (Top Hat)", "Final exam"]);
  assert.equal(r.weightTotal, 100);
});

test("a label wholly wrapped in brackets still loses them", () => {
  const r = parse("(Homework) 30%\n[Quizzes] 20%\nFinal exam 50%");
  assert.deepEqual(r.categories.map((c) => c.name), ["Homework", "Quizzes", "Final exam"]);
});

test("a multiplier is expanded, and a stated total wins over it", () => {
  const stated = parse("Exams (3 x 15%) 45%\nHomework 55%");
  assert.deepEqual(stated.categories.map((c) => `${c.name}=${c.weight}`), ["Exams=45", "Homework=55"]);
  assert.equal(stated.weightTotal, 100);

  const each = parse("two midterm exams worth 20% each\nFinal 60%");
  assert.deepEqual(each.categories.map((c) => `${c.name}=${c.weight}`), ["midterm exams=40", "Final=60"]);
  assert.equal(each.weightTotal, 100);
});

test("a subtotal row is not counted on top of its parts", () => {
  const r = parse("Exams (70% total):\nMidterm 1: 20%\nMidterm 2: 20%\nFinal: 30%");
  assert.deepEqual(r.categories.map((c) => c.name), ["Midterm 1", "Midterm 2", "Final"]);
  assert.equal(r.weightTotal, 70, "the subtotal is not added to its own components");
});

test("a sentence about a proportion is not read as a category", () => {
  const r = parse(`
    Roughly 30% of students earned an A last spring.
    Grades are not curved.
    Homework 40%
    Final 60%
  `);
  assert.deepEqual(r.categories.map((c) => c.name), ["Homework", "Final"]);
  assert.equal(r.weightTotal, 100);
  // And a percentage stated in a sentence that names real work still reads.
  const wrapped = parse(`
    Assessment Overview
    Homework is worth 30% of your final grade. The midterm exam is worth
    30%, and the final exam is worth 40% of your final grade.
  `);
  assert.equal(wrapped.weightTotal, 100);
  assert.ok(wrapped.categories.some((c) => c.name === "Homework"));
});

test("a parenthetical with extra detail keeps its label and weight", () => {
  const r = parse("Grading\nProjects (40%, 400 pts)\nQuizzes (5%, 50 pts)\nFinal (55%, 550 pts)");
  assert.deepEqual(r.categories.map((c) => `${c.name}=${c.weight}`), ["Projects=40", "Quizzes=5", "Final=55"]);
  assert.equal(r.weightTotal, 100);
});

test("a drop rule on the same line attaches to that category", () => {
  const best = parse("Homework (best 10 of 12) 20%\nFinal 80%");
  assert.equal(best.categories[0].dropLowest, 2, "12 homework, best 10 kept, so 2 drop");
  assert.equal(best.categories[1].dropLowest, 0);

  const lowest = parse("Homework: 20% (lowest one dropped)\nFinal 80%");
  assert.equal(lowest.categories[0].dropLowest, 1);
  assert.equal(lowest.categories[1].dropLowest, 0);
});

test("a relative clause gives its weight to the thing before the comma", () => {
  const together = parse("There are three short papers, which together are worth 45%, and a final 55%");
  assert.deepEqual(together.categories.map((c) => `${c.name}=${c.weight}`), ["three short papers=45", "final=55"]);
  assert.equal(together.weightTotal, 100);

  const counts = parse("Attendance and participation, which counts for 10%, plus exams 90%");
  assert.deepEqual(counts.categories.map((c) => `${c.name}=${c.weight}`), ["Attendance and participation=10", "exams=90"]);
  assert.equal(counts.weightTotal, 100);
});

test("'20% of total' is a weight, not a subtotal", () => {
  // The bare "…total" subtotal check matched every one of these and the scheme read as nothing.
  const r = parse(`
    Grading
    Homework 20% of total
    Quizzes 10% of total
    Midterm 30% of total
    Final 40% of total
  `);
  assert.equal(r.ok, true);
  assert.deepEqual(r.categories.map((c) => `${c.name}=${c.weight}`),
    ["Homework=20", "Quizzes=10", "Midterm=30", "Final=40"]);
  assert.equal(r.weightTotal, 100);

  // The parenthesised subtotal still is one.
  const sub = parse("Exams (70% total):\nMidterm 1: 20%\nMidterm 2: 20%\nFinal: 30%");
  assert.equal(sub.weightTotal, 70, "the subtotal row itself is still skipped");
});

test("a grade-distribution sentence is not read as the letter scale", () => {
  const r = parse(`
    Grading
    Homework 30%
    Midterm 30%
    Final 40%

    Last spring the grade distribution was A 35%, B 40%, C 20%, D/F 5%.

    Grading Scale
    A 90-100
    B 80-89
    C 70-79
    D 60-69
    F below 60
  `);
  assert.equal(r.scaleConfident, true);
  const min = (letter) => r.letterScale.find((s) => s.letter === letter)?.min;
  assert.equal(min("A"), 90, "the real table wins over the distribution sentence");
  assert.equal(min("B"), 80);
  assert.equal(min("D"), 60);
  assert.ok(!r.letterScale.some((s) => s.letter === "A" && s.min === 35));

  // "D/F 5%" must not become a category either.
  assert.equal(r.weightTotal, 100, "the distribution sentence adds nothing");
  assert.ok(!r.categories.some((c) => /^[a-f](\/[a-f])?$/i.test(c.name)), "no letter-grade category");
  assert.deepEqual(r.categories.map((c) => c.name), ["Homework", "Midterm", "Final"]);
});

test("a table of short rows is not run together into one category", () => {
  // "Exams — 60% total" was rejoined with the rows beneath it and read as a 60% category.
  const dash = parse("Exams — 60% total\n  Midterm 20%\n  Final 40%");
  assert.deepEqual(dash.categories.map((c) => `${c.name}=${c.weight}`), ["Midterm=20", "Final=40"]);
  assert.equal(dash.weightTotal, 60);

  // A heading directly above a percent-first row used to fuse onto it: "Grading 25%".
  const heading = parse("Grading\n25% Lab assignments\nFinal 75%");
  assert.deepEqual(heading.categories.map((c) => `${c.name}=${c.weight}`), ["Lab assignments=25", "Final=75"]);
  assert.equal(heading.weightTotal, 100);

  // A bracketed detail used to carry into the next row: "October 15) Final Exam 50%".
  const bracket = parse("Midterm: 30% (in class, October 15)\nFinal Exam: 50%\nHomework 20%");
  assert.deepEqual(bracket.categories.map((c) => `${c.name}=${c.weight}`), ["Midterm=30", "Final Exam=50", "Homework=20"]);
  assert.equal(bracket.weightTotal, 100);
});

test("a subtotal is identified by structure, not by the word 'total'", () => {
  // Every one of these was read correctly before the word-based rule existed, and the rule broke
  // them because the word "total" appeared in an ordinary row.
  const finalTotal = parse(`
    Grading
    Homework 20% of the final total
    Quizzes 10% of the final total
    Midterm 30% of the final total
    Final 40% of the final total
  `);
  assert.equal(finalTotal.ok, true, "a scheme written this way must still read");
  assert.equal(finalTotal.weightTotal, 100);
  assert.equal(finalTotal.categories.length, 4);

  const toward = parse(`
    Grading
    Labs count 25% toward your total
    Quizzes count 15% toward your total
    Midterm counts 25% toward your total
    Final counts 35% toward your total
  `);
  assert.equal(toward.weightTotal, 100);
  assert.deepEqual(toward.categories.map((c) => c.weight), [25, 15, 25, 35]);

  const gradeTotal = parse("Grading\nHomework 30%\nParticipation 10% of grade total\nMidterm 25%\nFinal 35%");
  assert.equal(gradeTotal.weightTotal, 100, "the 'of grade total' row is not silently dropped");

  // And a real subtotal is still skipped, by structure rather than by wording.
  const plain = parse("Exams 60% total\nMidterm 20%\nFinal 40%");
  assert.deepEqual(plain.categories.map((c) => `${c.name}=${c.weight}`), ["Midterm=20", "Final=40"]);
  assert.equal(plain.weightTotal, 60);

  // A prefix that happens to add up is not a subtotal: this five-row table keeps every row.
  const five = parse("Projects 30%\nHomework 15%\nMidterm Exam 1 15%\nMidterm Exam 2 15%\nFinal Exam 25%");
  assert.equal(five.categories.length, 5, "15 + 15 matching 30 must not delete Projects");
  assert.equal(five.weightTotal, 100);
});

test("a minus grade is not read as the letter above it", () => {
  const r = parse("Grading Scale\nA 93%\nA- 90%\nB+ 87%\nB 83%\nB- 80%\nC 70%\nD 60%");
  const min = (letter) => r.letterScale.find((s) => s.letter === letter)?.min;
  assert.equal(min("A"), 93);
  assert.equal(min("A-"), 90, "A- must keep its minus, or 91% grades as B+");
  assert.equal(min("B-"), 80);
  assert.equal(min("B+"), 87);
  assert.equal(r.letterScale.length, 7);
});

/* Real grading-table shapes, without the original documents or personal data. */
const syllabusTables = JSON.parse(await readFile(new URL('./fixtures/syllabus-tables.json', import.meta.url), 'utf8'));
for (const fixture of syllabusTables) {
  test(`${fixture.course}: every category in the grading table is read`, () => {
    const parsed = extractGradingScheme(fixture.text);
    assert.equal(parsed.categories.length, fixture.expectedCount);
    assert.equal(parsed.weightTotal, 100);
    if (fixture.expectedPoints) assert.equal(parsed.categories[0].derivedFromPoints.total, fixture.expectedPoints);
    if (fixture.course === 'CMSC') assert.equal(parsed.letterScale.find(s => s.letter === 'A-')?.min, 90);
    if (fixture.course === 'GEMS') assert.equal(parsed.letterScale.find(s => s.letter === 'A')?.min, 92.5);
  });
}

test('Word cells keep multi-paragraph assignment details beside their percentage', () => {
  const xml = '<w:document><w:body><w:tbl>' +
    '<w:tr><w:tc><w:p><w:r><w:t>Research Project</w:t></w:r></w:p><w:p><w:r><w:t>Draft and peer review</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>60%</w:t></w:r></w:p></w:tc></w:tr>' +
    '<w:tr><w:tc><w:p><w:r><w:t>Final Exam</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>40%</w:t></w:r></w:p></w:tc></w:tr>' +
    '</w:tbl></w:body></w:document>';
  const text = docxXmlToText(xml);
  const parsed = extractGradingScheme(text);
  assert.equal(parsed.weightTotal, 100);
  assert.deepEqual(parsed.categories.map(c => c.name), ['Research Project', 'Final Exam']);
});

const correctedCourse = {
  code: 'CMSC131', weighted: false,
  canvas: { groups: [{id:1,name:'Homework'},{id:2,name:'Practice'}],
    items: [{id:11,name:'HW1',assignment_group_id:1,score:20,points_possible:25},
      {id:12,name:'Practice',assignment_group_id:2,score:0,points_possible:75}] },
  excludedCanvasGroupIds: [2], canvasScoreOverrides: {11:25},
};
test('local score corrections and group exclusions feed current totals and details', () => {
  const result=computeCourseGrade(correctedCourse);
  assert.equal(result.current.pct,100);
  assert.equal(result.categories.length,1);
  assert.equal(result.categories[0].earned,25);
  assert.equal(result.categories[0].possible,25);
  assert.equal(correctedCourse.canvas.items[0].score,20);
});
test('zero, cleared, and reset corrections retain their distinct meanings', () => {
  assert.equal(computeCourseGrade({...correctedCourse,canvasScoreOverrides:{11:0}}).current.pct,0);
  assert.equal(computeCourseGrade({...correctedCourse,canvasScoreOverrides:{11:null}}).current.pct,null);
  assert.equal(computeCourseGrade({...correctedCourse,canvasScoreOverrides:{}}).current.pct,80);
});
test('local corrections, exclusions and saved syllabus survive a Canvas refresh', () => {
  const saved={...correctedCourse,id:'c11',canvasId:1,syllabus:{fileName:'course.docx',text:'Homework 100%'},pendingSyllabus:{categories:[]}};
  const payload={format:'terpplan.canvas-export',courses:[{canvasId:1,code:'CMSC131',title:'CS'}],detail:{1:correctedCourse.canvas}};
  const result=mergeCanvasData([saved],payload,()=> 'new');
  assert.deepEqual(result.courses[0].canvasScoreOverrides,{11:25});
  assert.deepEqual(result.courses[0].excludedCanvasGroupIds,[2]);
  assert.equal(result.courses[0].syllabus.text,'Homework 100%');
  assert.ok(result.courses[0].pendingSyllabus);
});
test('deleting all syllabus categories does not resurrect excluded Canvas categories', () => {
  assert.equal(computeCourseGrade({...correctedCourse,scheme:{source:'syllabus',confirmed:true,categories:[]}}).categories.length,0);
});


test('bookmarklet source remains standalone and injects its receiving URL safely', () => {
  const target='https://example.test/grades?lang=zh';
  const source=exportSource(target);
  assert.ok(source.includes(target));
  assert.ok(!source.includes('__TERPPLAN_TARGET__'));
  assert.ok(!source.includes('__name('));
  assert.doesNotThrow(() => new Function(source));
  assert.equal(decodeURIComponent(bookmarkletHref(target).slice('javascript:'.length)),source);
});
