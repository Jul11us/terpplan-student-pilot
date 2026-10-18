import assert from "node:assert/strict";
import test from "node:test";
import { compareWeeks } from "../lib/compare-week.ts";

const at = (courseId, sectionId, days, start, end) => ({ courseId, courseTitle: courseId, sectionId, kind: null, days, start, end, building: null, room: null });
const h = (hour, minute = 0) => hour * 60 + minute;

test("a shared schedule against My week: same sections, same courses in other sections, and time free for both", () => {
  const mine = [
    at("CMSC216", "CMSC216-0101", ["Tue", "Thu"], h(11), h(12, 15)),
    at("MATH240", "MATH240-0111", ["Mon", "Wed", "Fri"], h(9), h(9, 50)),
    at("ENGL101", "ENGL101-0309", ["Mon", "Wed"], h(13), h(14, 15)),
  ];
  const theirs = [
    at("CMSC216", "CMSC216-0101", ["Tue", "Thu"], h(11), h(12, 15)),
    at("MATH240", "MATH240-0221", ["Mon", "Wed", "Fri"], h(12), h(12, 50)),
    at("STAT400", "STAT400-0201", ["Mon", "Wed"], h(7, 30), h(8, 45)),
    at("HIST200", "HIST200-0101", ["Mon"], h(19, 30), h(21)),
  ];
  const result = compareWeeks(mine, theirs);
  assert.deepEqual(result.sameSections, ["CMSC216-0101"]);
  assert.deepEqual(result.sameCourses, [{ courseId: "MATH240", mine: ["MATH240-0111"], theirs: ["MATH240-0221"] }]);
  assert.deepEqual(result.days, ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  // Monday: 7:30–8:45, 9–9:50, 12–12:50, 1–2:15 and 7:30–9pm are taken; 8am to 8pm is looked at.
  assert.deepEqual(result.free.Mon, [{ start: h(9, 50), end: h(12) }, { start: h(14, 15), end: h(19, 30) }], "8:45–9:00 and 12:50–1:00 are too short");
  assert.deepEqual(result.free.Tue, [{ start: h(8), end: h(11) }, { start: h(12, 15), end: h(20) }]);
  assert.deepEqual(result.free.Fri, [{ start: h(8), end: h(9) }, { start: h(9, 50), end: h(12) }, { start: h(12, 50), end: h(20) }]);
  assert.deepEqual(result.bothOff, []);
});

test("a day neither has classes is free all day; weekend days show only with classes", () => {
  const result = compareWeeks([at("CMSC131", "CMSC131-0101", ["Mon"], h(10), h(11))], [at("ARTT100", "ARTT100-0101", ["Sat"], h(10), h(13))]);
  assert.deepEqual(result.days, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  assert.deepEqual(result.bothOff, ["Tue", "Wed", "Thu", "Fri"]);
  assert.deepEqual(result.free.Wed, [{ start: h(8), end: h(20) }]);
  assert.deepEqual(result.free.Sat, [{ start: h(8), end: h(10) }, { start: h(13), end: h(20) }]);
  assert.deepEqual([result.sameSections, result.sameCourses], [[], []]);
});
