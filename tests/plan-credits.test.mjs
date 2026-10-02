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

test("credit warnings follow UMD's limits for each kind of term", async () => {
  const { creditWarning } = await import("../lib/plan-credits.ts");
  const total = (min, max = min) => ({ min, max, unknown: [], pending: [] });
  assert.equal(creditWarning(total(16), "202701", "en"), "");
  assert.match(creditWarning(total(17), "202701", "en"), /before the first day of classes/);
  assert.match(creditWarning(total(18), "202608", "zh"), /开学第一天之前最多只能注册 16 学分/);
  assert.match(creditWarning(total(21), "202701", "en"), /20-credit limit/);
  // A 1–6 credit course only counts its minimum.
  assert.equal(creditWarning(total(15, 20), "202701", "en"), "");
  assert.equal(creditWarning(total(4), "202605", "en"), "");
  assert.match(creditWarning(total(9), "202605", "en"), /8 per six-week session and 4 per three-week session/);
  assert.doesNotMatch(creditWarning(total(9), "202605", "en"), /Over|needs approval/);
  assert.match(creditWarning(total(16), "202605", "zh"), /当前合计覆盖整个暑期/);
  assert.match(creditWarning(total(17), "202605", "en"), /16-credit limit/);
  assert.match(creditWarning(total(5), "202612", "en"), /4-credit limit/);
  assert.equal(creditWarning(total(30), "abc", "en"), "");
});
