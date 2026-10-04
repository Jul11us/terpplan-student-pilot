import assert from "node:assert/strict";
import test from "node:test";
import { historicalGpaSummary, weekLoad } from "../lib/week-load.ts";
import { creditMeter } from "../lib/plan-credits.ts";

const total = (min, max = min) => ({ min, max, unknown: [], pending: [] });

test("credit meter marks fall/spring thresholds and picks a level", () => {
  const meter = creditMeter(total(15), "202701");
  assert.deepEqual(meter.marks.map((mark) => mark.value), [12, 16, 20]);
  assert.equal(meter.level, "ok");
  assert.equal(meter.scaleMax, 22);
  assert.equal(creditMeter(total(9, 11), "202608").level, "under");
  assert.equal(creditMeter(total(10, 13), "202608").level, "ok");
  assert.equal(creditMeter(total(17), "202701").level, "caution");
  assert.equal(creditMeter(total(21), "202701").level, "over");
  assert.equal(creditMeter(total(30), "202701").scaleMax, 30);
});

test("credit meter for winter and summer marks only the limit", () => {
  assert.deepEqual(creditMeter(total(3), "202612").marks, [{ value: 4, kind: "max" }]);
  assert.equal(creditMeter(total(3), "202612").level, "ok");
  assert.equal(creditMeter(total(17), "202705").level, "over");
  assert.equal(creditMeter(total(3), "209999"), null);
});

test("week load sums class time per day, merges overlaps and measures gaps", () => {
  const load = weekLoad([
    { meetings: [{ days: "MWF", start_time: "9:00am", end_time: "9:50am" }] },
    { meetings: [{ days: "MW", start_time: "1:00pm", end_time: "2:15pm" }, { days: "M", start_time: "1:30pm", end_time: "2:30pm" }] },
    { meetings: [{ days: "TuTh", start_time: "11:00am", end_time: "12:15pm" }] },
    { meetings: [{ days: "TBA", start_time: null, end_time: null }] },
    { meetings: [{ days: null, start_time: null, end_time: null, building: "ONLINE", room: "" }] },
  ]);
  assert.deepEqual(load.days.map((day) => day.day), ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const monday = load.days[0];
  assert.equal(monday.classMinutes, 50 + 90);
  assert.equal(monday.gapMinutes, (14.5 - 9) * 60 - 140);
  assert.equal(load.days[4].classMinutes, 50);
  assert.equal(load.days[4].gapMinutes, 0);
  assert.equal(load.busiest, "Mon");
  assert.equal(load.totalClassMinutes, 140 + 75 + 125 + 75 + 50);
});

test("week load shows weekend days only when classes meet then", () => {
  const load = weekLoad([{ meetings: [{ days: "Sa", start_time: "10:00am", end_time: "11:00am" }] }]);
  assert.deepEqual(load.days.map((day) => day.day), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  assert.equal(weekLoad([]).busiest, null);
});

test("historical GPA summary is credit-weighted and reports coverage", () => {
  const summary = historicalGpaSummary([
    { instructorGpa: 3.6, credits: 4 },
    { instructorGpa: 2.8, credits: 1 },
    { instructorGpa: null, credits: 3 },
  ]);
  assert.ok(Math.abs(summary.average - (3.6 * 4 + 2.8) / 5) < 1e-9);
  assert.equal(summary.low, 2.8);
  assert.equal(summary.high, 3.6);
  assert.equal(summary.known, 2);
  assert.equal(summary.total, 3);
  assert.equal(historicalGpaSummary([{ instructorGpa: null, credits: 3 }]), null);
});
