import assert from "node:assert/strict";
import test from "node:test";
import { creditRange, formatCreditTotal, totalPlanCredits } from "../lib/plan-credits.ts";

test("reads fixed and variable credits, and rejects unusable values", () => {
  assert.deepEqual(creditRange({ credits: 3, max_credits: null }), { min: 3, max: 3 });
  assert.deepEqual(creditRange({ credits: 1, max_credits: 3 }), { min: 1, max: 3 });
  assert.deepEqual(creditRange({ credits: "4" }), { min: 4, max: 4 });
  assert.equal(creditRange({ credits: null }), null);
  assert.equal(creditRange({ credits: 0 }), null);
  assert.equal(creditRange(undefined), null);
});

test("totals known courses as a range and keeps unknown and loading courses out of the sum", () => {
  const total = totalPlanCredits(["CMSC131", "MATH140", "CMSC499", "ENGL101", "HIST200"], {
    CMSC131: { min: 4, max: 4 },
    MATH140: { min: 4, max: 4 },
    CMSC499: { min: 1, max: 3 },
    ENGL101: null,
  });
  assert.equal(total.min, 9);
  assert.equal(total.max, 11);
  assert.deepEqual(total.unknown, ["ENGL101"]);
  assert.deepEqual(total.pending, ["HIST200"]);
  assert.equal(formatCreditTotal(total, "en"), "9–11 credits · ENGL101: credits unknown, not counted · loading…");
  assert.equal(formatCreditTotal(total, "zh"), "共 9–11 学分 · ENGL101 学分未知，未计入 · 正在读取…");
});

test("fixed total reads as a single number", () => {
  const total = totalPlanCredits(["A", "B"], { A: { min: 3, max: 3 }, B: { min: 4, max: 4 } });
  assert.equal(formatCreditTotal(total, "en"), "7 credits");
  assert.equal(formatCreditTotal(totalPlanCredits(["A"], { A: { min: 1, max: 1 } }), "en"), "1 credit");
});
