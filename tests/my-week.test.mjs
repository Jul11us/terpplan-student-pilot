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

test("weeks are kept per term; a week saved before that is read as its term's, and the newest four are kept", async () => {
  const { MAX_WEEKS, parseMyWeeks, pickWeekTerm } = await import("../lib/my-week.ts");
  const fall = weekFromSections(sections, "202608", "Fall 2026"), spring = weekFromSections(sections, "202701", "Spring 2027");
  assert.deepEqual(Object.keys(parseMyWeeks(JSON.parse(JSON.stringify(fall)))), ["202608"], "the old single week");
  const both = parseMyWeeks({ weeks: { 202608: fall, 202701: spring, 202612: { ...spring, term: "202701" }, nonsense: fall } });
  assert.deepEqual(Object.keys(both).sort(), ["202608", "202701"], "a week filed under another term is dropped");
  const many = Object.fromEntries(["202408", "202501", "202508", "202601", "202608", "202701"].map((term) => [term, { ...fall, term }]));
  assert.deepEqual(Object.keys(parseMyWeeks({ weeks: many })).sort(), ["202508", "202601", "202608", "202701"].slice(-MAX_WEEKS));
  // Opens on the term in session, else the next to start, else the latest.
  assert.equal(pickWeekTerm(both, new Date(2026, 9, 18)), "202608", "mid-October: fall");
  assert.equal(pickWeekTerm(both, new Date(2026, 7, 20)), "202608", "before fall classes start");
  assert.equal(pickWeekTerm(both, new Date(2026, 11, 15)), "202701", "fall classes are over: spring is next");
  assert.equal(pickWeekTerm(both, new Date(2027, 5, 1)), "202701", "both over: the latest");
  assert.equal(pickWeekTerm({}, new Date(2026, 9, 18)), null);
});

test("a term's classes run from its first to its last class day, or by month when its calendar is not here", async () => {
  const { termEnded, termInSession } = await import("../lib/term-calendar.ts");
  assert.equal(termInSession("202608", new Date(2026, 7, 30)), false, "the day before fall classes");
  assert.equal(termInSession("202608", new Date(2026, 7, 31)), true);
  assert.equal(termInSession("202608", new Date(2026, 11, 12)), false, "after the last class day");
  assert.equal(termEnded("202608", new Date(2026, 11, 12)), true);
  assert.equal(termInSession("202708", new Date(2027, 8, 15)), true, "no calendar yet: by month");
  assert.equal(termEnded("202705", new Date(2027, 8, 15)), true);
});
