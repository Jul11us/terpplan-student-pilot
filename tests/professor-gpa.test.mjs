import assert from "node:assert/strict";
import test from "node:test";
import { averageGpa } from "../lib/planetterp.ts";

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
