import assert from "node:assert/strict";
import test from "node:test";
import { averageGpa, gradeDistribution, GRADE_BANDS } from "../lib/planetterp.ts";

test("average GPA uses UMD grade points and leaves out W and Other", () => {
  const rows = [
    { "A+": 1, A: 1, "A-": 0, "B+": 0, B: 1, F: 1, W: 5, Other: 2 },
    { "C-": 1 },
  ];
  // (4 + 4 + 3 + 0 + 1.7) / 5 = 2.54
  assert.deepEqual(averageGpa(rows), { gpa: 2.54, students: 5 });
  assert.equal(averageGpa([]), null);
  assert.equal(averageGpa([{ W: 3, Other: 1 }]), null);
});

test("the grade spread folds pluses and minuses into their letter and keeps withdrawals apart", () => {
  const spread = gradeDistribution([
    { semester: "202308", "A+": 1, A: 2, "A-": 1, "B+": 1, B: 1, W: 2, Other: 3 },
    { semester: "202401", C: 3, "D-": 1, F: 1 },
    { semester: "202401", W: 1 },
  ]);
  // 4 As, 2 Bs, 3 Cs, 1 D, 1 F = 11 graded students; W and Other are not grades.
  assert.equal(spread.students, 11);
  assert.equal(spread.withdrew, 3);
  assert.equal(spread.semesters, 2);
  assert.deepEqual(spread.bands.map((band) => band.band), [...GRADE_BANDS]);
  assert.deepEqual(spread.bands.map((band) => band.students), [4, 2, 3, 1, 1]);
  // Percentages are shares of the graded students, so they add up to about 100.
  assert.ok(Math.abs(spread.bands.reduce((sum, band) => sum + band.percent, 0) - 100) < 0.5);
  assert.equal(spread.bands[0].percent, 36.4);
});

test("the grade spread always has all five letters, and is absent when nobody was graded", () => {
  const spread = gradeDistribution([{ A: 5 }]);
  assert.equal(spread.bands.length, GRADE_BANDS.length);
  assert.deepEqual(spread.bands.map((band) => band.percent), [100, 0, 0, 0, 0]);
  assert.equal(spread.semesters, 0);
  assert.equal(gradeDistribution([]), null);
  assert.equal(gradeDistribution([{ W: 4, Other: 2 }]), null);
  assert.equal(gradeDistribution([null, "nonsense"]), null);
});
