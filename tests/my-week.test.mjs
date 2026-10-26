import assert from "node:assert/strict";
import test from "node:test";
import { applyWeekChanges, classesOn, compareWeek, dayOf, parseMyWeek, weekFromSections, weekSections } from "../lib/my-week.ts";

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

const timedMeeting = { days: "MWF", start_time: "10:00am", end_time: "10:50am", building: "ESJ", room: "0202", classtype: "Lecture" };
const asyncMeeting = { days: null, start_time: null, end_time: null, building: "ONLINE", room: "ONLINE" };
const tbaMeeting = { days: "TBA", start_time: "TBA", end_time: "TBA", building: null, room: null };
const sectionWith = (meetings, course = "PSYC100", title = "Introduction to Psychology") => ({ course_id: course, course_title: title, section_id: `${course}-0401`, meetings });
const build = (sections) => weekFromSections(sections, "202701", "Spring 2027", new Date("2026-10-26T12:00:00Z"));
const listed = (section) => {
  const fresh = build([section]);
  return { [section.section_id]: { classes: fresh.classes, unscheduled: fresh.sections[0].unscheduled, courseTitle: section.course_title } };
};

test("a legacy week with only a TBA ID detects its newly published time and keeps the section title", () => {
  const legacy = parseMyWeek({ term: "202701", termName: "Spring 2027", savedAt: "", classes: [], unscheduled: ["PSYC100-0401", "PSYC100-0401"] });
  assert.deepEqual(weekSections(legacy), [{ sectionId: "PSYC100-0401", courseId: "PSYC100", courseTitle: "PSYC100", unscheduled: ["unknown"] }]);
  const current = listed(sectionWith([timedMeeting]));
  const changes = compareWeek(legacy, current);
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].before, []);
  assert.deepEqual(changes[0].beforeUnscheduled, ["unknown"]);
  assert.equal(changes[0].after[0].start, 600);
  const updated = applyWeekChanges(legacy, changes);
  assert.deepEqual(updated.unscheduled, []);
  assert.equal(updated.classes[0].courseTitle, "Introduction to Psychology");
  assert.equal(updated.sections[0].courseTitle, "Introduction to Psychology");
  assert.deepEqual(compareWeek(updated, current), []);
  assert.deepEqual(parseMyWeek(JSON.parse(JSON.stringify(updated))), updated);
});

test("timed sections remain saved when they become TBA or asynchronous, and return to the timetable", async () => {
  const { examCoursesFromWeek } = await import("../lib/final-exams.ts");
  let saved = build([sectionWith([timedMeeting])]);
  for (const [meeting, state] of [[tbaMeeting, "tba"], [asyncMeeting, "async"], [timedMeeting, null]]) {
    const current = listed(sectionWith([meeting]));
    const changes = compareWeek(saved, current);
    assert.equal(changes.length, 1);
    assert.deepEqual(changes[0].afterUnscheduled, state ? [state] : []);
    saved = applyWeekChanges(saved, changes);
    assert.deepEqual(saved.unscheduled, state ? ["PSYC100-0401"] : []);
    assert.equal(saved.classes.length, state ? 0 : 1);
    assert.deepEqual(examCoursesFromWeek(saved).map((course) => course.courseId), ["PSYC100"], "neither the week nor its exam input loses the course");
    assert.deepEqual(compareWeek(saved, current), []);
    assert.deepEqual(parseMyWeek(JSON.parse(JSON.stringify(saved))), saved);
  }
});

test("mixed sections track their untimed component even when their timed meeting does not change", () => {
  const saved = build([sectionWith([timedMeeting, asyncMeeting])]);
  assert.equal(saved.classes.length, 1);
  assert.deepEqual(saved.unscheduled, ["PSYC100-0401"]);
  assert.deepEqual(compareWeek(saved, listed(sectionWith([asyncMeeting, timedMeeting]))), [], "meeting order alone is not a change");
  const changed = listed(sectionWith([timedMeeting, tbaMeeting]));
  const changes = compareWeek(saved, changed);
  assert.equal(changes.length, 1, "TBA replacing asynchronous work is visible despite the same lecture");
  assert.deepEqual(changes[0].beforeUnscheduled, ["async"]);
  assert.deepEqual(changes[0].afterUnscheduled, ["tba"]);
  const updated = applyWeekChanges(saved, changes);
  assert.equal(updated.classes.length, 1);
  assert.equal(updated.classes[0].kind, "Lecture");
  assert.deepEqual(updated.unscheduled, ["PSYC100-0401"]);
  const fullyTimed = applyWeekChanges(updated, compareWeek(updated, listed(sectionWith([timedMeeting]))));
  assert.deepEqual(fullyTimed.unscheduled, []);
  assert.equal(fullyTimed.classes.length, 1);
  assert.deepEqual(compareWeek(fullyTimed, listed(sectionWith([timedMeeting]))), []);
});

test("failed lookups are excluded and removed untimed sections retain their saved information", () => {
  const saved = build([sectionWith([tbaMeeting]), sectionWith([timedMeeting], "MATH141", "Calculus II")]);
  assert.deepEqual(compareWeek(saved, {}), [], "no response does not mean that a section vanished");
  const current = { "PSYC100-0401": null, ...listed(sectionWith([{ ...timedMeeting, room: "0300" }], "MATH141", "Calculus II")) };
  const changes = compareWeek(saved, current);
  assert.equal(changes.length, 2);
  const removed = changes.find((change) => change.sectionId === "PSYC100-0401");
  assert.equal(removed.after, null);
  assert.deepEqual(removed.beforeUnscheduled, ["tba"]);
  const updated = applyWeekChanges(saved, changes);
  assert.deepEqual(updated.unscheduled, ["PSYC100-0401"]);
  assert.equal(updated.sections.find((section) => section.courseId === "PSYC100").courseTitle, "Introduction to Psychology");
  assert.equal(updated.classes[0].room, "0300");
  assert.deepEqual(compareWeek(updated, current).map((change) => change.sectionId), ["PSYC100-0401"], "the removed section warning remains after other changes are saved");
});

test("legacy untimed state is not falsely reported as changed merely because its exact kind is now known", () => {
  const legacy = { term: "202701", termName: "Spring 2027", savedAt: "", classes: [], unscheduled: ["PSYC100-0401"] };
  assert.deepEqual(compareWeek(legacy, listed(sectionWith([asyncMeeting]))), []);
  assert.deepEqual(compareWeek(legacy, listed(sectionWith([tbaMeeting]))), []);
  assert.equal(compareWeek(legacy, listed(sectionWith([timedMeeting]))).length, 1);
});

test("new section titles and time states survive account parsing without changing legacy records", async () => {
  const { parseSyncState } = await import("../lib/plan-sync.ts");
  const fresh = build([sectionWith([timedMeeting, asyncMeeting, tbaMeeting])]);
  const parsed = parseSyncState(JSON.parse(JSON.stringify({ saved: { plans: {} }, weeks: { 202701: fresh } }))).weeks["202701"];
  assert.deepEqual(parsed, fresh);
  assert.deepEqual(parsed.sections[0].unscheduled, ["async", "tba"]);
  const legacy = { term: "202701", termName: "Spring 2027", savedAt: "", classes: [], unscheduled: ["PSYC100-0401"] };
  assert.deepEqual(parseMyWeek(legacy), legacy, "old account payloads need no schema migration");
});

test("repeated updates and duplicate section input do not duplicate timed rows or untimed IDs", () => {
  const section = sectionWith([timedMeeting, asyncMeeting, asyncMeeting]);
  const saved = build([section, section]);
  assert.equal(saved.classes.length, 1);
  assert.equal(saved.sections.length, 1);
  assert.deepEqual(saved.unscheduled, ["PSYC100-0401"]);
  assert.deepEqual(saved.sections[0].unscheduled, ["async"]);
  const changes = compareWeek(saved, listed(sectionWith([tbaMeeting])));
  const once = applyWeekChanges(saved, changes, new Date("2026-10-27T12:00:00Z"));
  const twice = applyWeekChanges(once, changes, new Date("2026-10-27T12:00:00Z"));
  assert.deepEqual(twice, once);
  assert.deepEqual(twice.unscheduled, ["PSYC100-0401"]);
});
