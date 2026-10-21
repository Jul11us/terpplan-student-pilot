import assert from "node:assert/strict";
import test from "node:test";
import { examCoursesFromSections, examCoursesFromWeek, examFor, examPlan, examTableFor, EXAM_TABLES } from "../lib/final-exams.ts";

const h = (hour, minute = 0) => hour * 60 + minute;
const lecture = (days, start, end, kind = "Lecture") => ({ days, start, end, kind, online: false });
const fall = EXAM_TABLES["202608"];

test("standard slots follow the class days and start time", () => {
  assert.deepEqual(examFor({ courseId: "STAT400", meetings: [lecture(["Mon", "Wed", "Fri"], h(9), h(9, 50))] }, fall), { courseId: "STAT400", kind: "standard", time: { day: 3, start: h(13, 30), end: h(15, 30) } });
  // A TuTh class at 11:00 sits its exam on the first Monday at 10:30.
  assert.deepEqual(examFor({ courseId: "HIST200", meetings: [lecture(["Tue", "Thu"], h(11), h(12, 15))] }, fall).time, { day: 0, start: h(10, 30), end: h(12, 30) });
  // 10am MWF goes to the second Monday.
  assert.equal(examFor({ courseId: "ENGL101", meetings: [lecture(["Mon", "Wed"], h(10), h(11, 15))] }, fall).time.day, 5);
  // The discussion does not decide the slot.
  assert.equal(examFor({ courseId: "STAT400", meetings: [lecture(["Tue"], h(8), h(8, 50), "Discussion"), lecture(["Mon", "Wed", "Fri"], h(12), h(12, 50))] }, fall).time.day, 4);
});

test("common exams win over the class time, including MATH and language lists", () => {
  assert.deepEqual(examFor({ courseId: "CMSC330", meetings: [lecture(["Tue", "Thu"], h(9, 30), h(10, 45))] }, fall), { courseId: "CMSC330", kind: "common", time: { day: 1, start: h(18, 30), end: h(20, 30) } });
  assert.equal(examFor({ courseId: "MATH141H", meetings: [] }, fall).kind, "common");
  assert.equal(examFor({ courseId: "japn101", meetings: [] }, fall).kind, "common");
});

test("evening classes: the first class day of the exam week, at class time", () => {
  assert.deepEqual(examFor({ courseId: "BMGT364", meetings: [lecture(["Tue", "Thu"], h(18), h(19, 15))] }, fall).time, { day: 1, start: h(18), end: h(19, 15) });
  assert.equal(examFor({ courseId: "X100", meetings: [lecture(["Sat"], h(18), h(20))] }, fall).kind, "unknown");
});

test("patterns no rule covers, and online-only classes", () => {
  assert.equal(examFor({ courseId: "X1", meetings: [lecture(["Mon", "Tue", "Wed", "Thu"], h(9), h(9, 50))] }, fall).kind, "unknown", "mixed MWF/TuTh days");
  assert.equal(examFor({ courseId: "X2", meetings: [lecture(["Mon", "Wed"], h(8, 50), h(9, 40))] }, fall).kind, "unknown", "start between bands");
  assert.equal(examFor({ courseId: "X3", meetings: [{ days: [], start: null, end: null, kind: null, online: true }] }, fall).kind, "online");
});

test("standard slots accept only the Registrar's listed day patterns, regardless of meeting order", () => {
  for (const days of [["Mon", "Fri"], ["Wed", "Fri"], ["Mon", "Tue"], ["Sat"]]) {
    assert.equal(examFor({ courseId: "TEST100", meetings: [lecture(days, h(10), h(10, 50))] }, fall).kind, "unknown", days.join("/"));
  }
  const split = examFor({ courseId: "TEST100", meetings: [lecture(["Wed"], h(10), h(10, 50)), lecture(["Mon"], h(10), h(10, 50))] }, fall);
  assert.equal(split.kind, "standard", "separate Mon/Wed meetings use the listed MW pattern");
  assert.equal(split.time.day, 5);
  assert.equal(examFor({ courseId: "TEST100", meetings: [lecture(["Thu", "Tue"], h(10), h(10, 50))] }, fall).kind, "standard");
});

test("unknown and online exam times stay visible without an all-clear status", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { FinalExamsCard } = await import("../app/components/final-exams-card.tsx");
  for (const [courseId, meetings] of [["TEST100", []], ["TEST200", [{ days: [], start: null, end: null, kind: null, online: true }]]]) {
    const html = renderToStaticMarkup(createElement(FinalExamsCard, { term: "202608", courses: [{ courseId, meetings }], language: "en" }));
    assert.match(html, /Some times unknown/);
    assert.doesNotMatch(html, /No clashes/);
    assert.match(html.slice(0, html.indexOf("<details")), new RegExp(`Exam times are unknown for ${courseId}`), "the uncertainty note is visible outside the disclosure");
  }
  const complete = renderToStaticMarkup(createElement(FinalExamsCard, { term: "202608", courses: [{ courseId: "CMSC330", meetings: [] }], language: "en" }));
  assert.match(complete, /No clashes/, "a known common exam can still show all-clear");
});

test("tables: a posted term is official; spring 2027 is estimated from spring 2026; winter has none", () => {
  assert.deepEqual([examTableFor("202608").official, examTableFor("202608").from], [true, "202608"]);
  assert.deepEqual([examTableFor("202701").official, examTableFor("202701").from], [false, "202601"]);
  assert.equal(examTableFor("202612"), null);
  assert.equal(examTableFor("202505"), null);
});

test("clashes and busy days", () => {
  const plan = examPlan("202608", [
    { courseId: "CMSC330", meetings: [] },
    { courseId: "CMSC216", meetings: [] },
    { courseId: "HIST200", meetings: [lecture(["Tue", "Thu"], h(9, 30), h(10, 45))] },
    { courseId: "STAT400", meetings: [lecture(["Mon", "Wed", "Fri"], h(13), h(13, 50))] },
    { courseId: "ARTH200", meetings: [{ days: [], start: null, end: null, kind: null, online: true }] },
  ]);
  assert.deepEqual(plan.clashes, [["CMSC330", "CMSC216"]]);
  assert.deepEqual(plan.busyDays, [{ day: 1, courseIds: ["HIST200", "STAT400", "CMSC330", "CMSC216"] }]);
  assert.equal(plan.exams.at(-1).kind, "online", "exams without a time come last");
  assert.equal(examPlan("202612", [{ courseId: "CMSC330", meetings: [] }]), null);
});

test("courses from planner sections and from My week", () => {
  const fromSections = examCoursesFromSections([{ course_id: "STAT400", meetings: [{ days: "MWF", start_time: "9:00am", end_time: "9:50am", classtype: null }, { days: null, start_time: null, end_time: null, building: "ONLINE", room: "ONLINE" }] }]);
  assert.deepEqual(fromSections[0].meetings[0], { days: ["Mon", "Wed", "Fri"], start: h(9), end: h(9, 50), kind: null, online: false });
  assert.equal(fromSections[0].meetings[1].online, true);
  const fromWeek = examCoursesFromWeek({ term: "202608", termName: "Fall 2026", savedAt: "", unscheduled: ["ARTH200-0101", "STAT400-0101"], classes: [
    { courseId: "STAT400", courseTitle: "", sectionId: "STAT400-0101", kind: null, days: ["Mon", "Wed", "Fri"], start: h(9), end: h(9, 50), building: null, room: null },
  ] });
  assert.deepEqual(fromWeek.map((course) => course.courseId), ["STAT400", "ARTH200"]);
  assert.equal(fromWeek[1].meetings[0].online, true);
});

test("exams are over after the last exam day, not the last class day", async () => {
  const { examsOver } = await import("../lib/final-exams.ts");
  assert.equal(examsOver("202608", new Date(2026, 11, 15, 12)), false, "exam week, after classes ended");
  assert.equal(examsOver("202608", new Date(2026, 11, 22, 12)), true);
  assert.equal(examsOver("202701", new Date(2026, 9, 19, 12)), false);
});

test("exam calendar: only a posted term's timed exams, each a one-off event with reminders", async () => {
  const { examEvents } = await import("../lib/final-exams.ts");
  const { buildEventsIcs } = await import("../lib/ics.ts");
  const text = { summary: "Final exam: {course}", description: "Check {course} in Testudo." };
  const courses = [{ courseId: "CMSC330", meetings: [] }, { courseId: "ARTH200", meetings: [{ days: [], start: null, end: null, kind: null, online: true }] }];
  const events = examEvents(examPlan("202608", courses), text);
  assert.deepEqual(events.map((event) => [event.uid, event.date, event.start, event.end, event.summary]), [["exam-202608-CMSC330@terpplan.com", "2026-12-15", 1110, 1230, "Final exam: CMSC330"]]);
  assert.match(events[0].url, /soc\/exam\/search\?courseId=CMSC330&sectionId=&termId=202608$/);
  assert.deepEqual(examEvents(examPlan("202701", courses), text), [], "estimates never go on a calendar");
  const ics = buildEventsIcs(events, "TerpPlan · Fall 2026 · Final exams", new Date("2026-10-21T12:00:00Z"));
  assert.match(ics, /DTSTART;TZID=America\/New_York:20261215T183000\r\n/);
  assert.match(ics, /DTEND;TZID=America\/New_York:20261215T203000\r\n/);
  assert.equal((ics.match(/BEGIN:VALARM/g) ?? []).length, 2);
  assert.match(ics, /TRIGGER:-P1D\r\n[\s\S]*TRIGGER:-PT1H\r\n/);
  assert.doesNotMatch(ics.slice(ics.indexOf("BEGIN:VEVENT")), /RRULE/, "a one-off event, not weekly");
});
