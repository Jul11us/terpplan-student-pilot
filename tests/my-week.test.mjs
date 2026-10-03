import assert from "node:assert/strict";
import test from "node:test";
import { classesOn, dayOf, parseMyWeek, weekFromSections } from "../lib/my-week.ts";

const sections = [
  { course_id: "CMSC216", course_title: "Introduction to Computer Systems", section_id: "CMSC216-0104", meetings: [
    { days: "TuTh", start_time: "11:00am", end_time: "12:15pm", building: "ESJ", room: "0202", classtype: null },
    { days: "MW", start_time: "10:00am", end_time: "10:50am", building: "CSI", room: "3118", classtype: "Discussion" },
  ] },
  { course_id: "ENGL101", course_title: "Academic Writing", section_id: "ENGL101-0309", meetings: [{ days: "MWF", start_time: "11:00am", end_time: "11:50am", building: "BPS", room: "1236" }] },
  { course_id: "HIST200", course_title: "Online history", section_id: "HIST200-ESG1", meetings: [{ days: null, start_time: null, end_time: null, building: "ONLINE", room: "ASYNC" }] },
];

test("my week keeps each meeting with its room, and lists sections without a set time apart", () => {
  const week = weekFromSections(sections, "202701", "Spring 2027", new Date("2026-10-03T12:00:00Z"));
  assert.equal(week.classes.length, 3);
  assert.deepEqual(week.unscheduled, ["HIST200-ESG1"]);
  const monday = classesOn(week, "Mon");
  assert.deepEqual(monday.map((item) => [item.sectionId, item.start, item.kind, item.building, item.room]), [
    ["CMSC216-0104", 600, "Discussion", "CSI", "3118"],
    ["ENGL101-0309", 660, null, "BPS", "1236"],
  ]);
  assert.deepEqual(classesOn(week, "Tue").map((item) => item.end), [735]);
  assert.deepEqual(parseMyWeek(JSON.parse(JSON.stringify(week))), week);
});

test("stored weeks are checked and the weekday follows the device's calendar", () => {
  assert.equal(parseMyWeek({ term: "202701", classes: [{ courseId: "X", sectionId: "X-1", days: ["Funday"], start: 1, end: 2 }] }).classes.length, 0);
  assert.equal(parseMyWeek("nope"), null);
  assert.equal(dayOf(new Date(2026, 9, 5)), "Mon");
  assert.equal(dayOf(new Date(2026, 9, 4)), "Sun");
});

test("a saved week notices a new room or time, and a section that is gone", async () => {
  const { applyWeekChanges, compareWeek } = await import("../lib/my-week.ts");
  const week = weekFromSections(sections, "202701", "Spring 2027");
  const now = (list) => weekFromSections(list, "202701", "Spring 2027").classes;
  const moved = [{ ...sections[0], meetings: [{ ...sections[0].meetings[0], room: "0215" }, sections[0].meetings[1]] }];
  const current = { "CMSC216-0104": now(moved), "ENGL101-0309": now([sections[1]]) };
  assert.deepEqual(compareWeek(week, current).map((change) => change.sectionId), ["CMSC216-0104"]);
  assert.deepEqual(compareWeek(week, { "ENGL101-0309": null }).map((change) => [change.sectionId, change.after]), [["ENGL101-0309", null]]);
  assert.deepEqual(compareWeek(week, {}), []);
  const updated = applyWeekChanges(week, compareWeek(week, current));
  assert.deepEqual(updated.classes.filter((item) => item.sectionId === "CMSC216-0104").map((item) => item.room).sort(), ["0215", "3118"]);
  assert.equal(compareWeek(updated, current).length, 0);
});
