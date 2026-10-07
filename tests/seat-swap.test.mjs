import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

globalThis.__swapEnv = {};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export const env = globalThis.__swapEnv;", shortCircuit: true };
  return next(specifier, context);
} });
const { fittingSections, openingPath, parseOpening, scheduleWithout, sectionFit } = await import("../lib/seat-swap.ts");
const { alertEmail } = await import("../lib/alerts.ts");

const meet = (days, start, end) => ({ days, start_time: start, end_time: end });
// MATH141-0131 (MWF 9) and COMM107-0101 (MW 8) in the schedule, plus a job Tue/Thu 1–4pm.
const comm0101 = [meet("MW", "8:00am", "8:50am")];
const schedule = [meet("MWF", "9:00am", "9:50am"), ...comm0101, meet("TuTh", "13:00", "16:00")];

test("the email link carries the section and term, and the page reads it back", () => {
  assert.equal(openingPath("202701", "COMM107-0201"), "/plan?opening=COMM107-0201&term=202701");
  assert.deepEqual(parseOpening("?opening=comm107-0201&term=202701"), { courseId: "COMM107", sectionId: "COMM107-0201", term: "202701" });
  assert.deepEqual(parseOpening("?opening=BMGT289I-0101&term=202701")?.courseId, "BMGT289I");
  for (const bad of ["?opening=COMM107&term=202701", "?opening=COMM107-0201", "?opening=<x>-1&term=202701", "?term=202701"]) assert.equal(parseOpening(bad), null, bad);
});

test("an opened section is checked against the schedule without the section it would replace", () => {
  const without = scheduleWithout(schedule, comm0101);
  assert.equal(without.length, 2);
  // COMM107-0201 meets MW 8am too: it clashes with 0101 but 0101 is the one being replaced.
  assert.equal(sectionFit([meet("MW", "8:00am", "8:50am")], without), "fits");
  assert.equal(sectionFit([meet("MW", "8:00am", "8:50am")], schedule), "conflict");
  assert.equal(sectionFit([meet("TuTh", "2:00pm", "3:15pm")], without), "conflict", "clashes with the job");
  assert.equal(sectionFit([meet("TBA", null, null)], without), "unknown");
  assert.equal(sectionFit([{ days: null, start_time: null, end_time: null, building: "ONLINE", room: null }], without), "fits");
});

test("only the sections that fit are offered for watching", () => {
  const sections = [
    { id: "a", meetings: [meet("MW", "11:00am", "11:50am")] },
    { id: "b", meetings: [meet("Tu", "2:00pm", "2:50pm")] },
    { id: "c", meetings: [meet("TBA", null, null)] },
    { id: "d", meetings: [meet("F", "9:30am", "10:20am")] },
  ];
  assert.deepEqual(fittingSections(sections, schedule).map((section) => section.id), ["a"]);
});

test("each section in a seat alert links to the schedule check, after the Testudo link", () => {
  const row = { sectionId: "COMM107-0201", term: "202701", courseTitle: "Oral Communication", openSeats: 2, lastSuccessAt: "2026-10-20T15:00:00Z" };
  const message = alertEmail([row], "token");
  assert.match(message.text, /https:\/\/terpplan\.com\/plan\?opening=COMM107-0201&term=202701/);
  assert.match(message.html, /href="https:\/\/terpplan\.com\/plan\?opening=COMM107-0201&amp;term=202701"/);
  assert.ok(message.html.indexOf("Register in Testudo") > 0);
  assert.match(message.html, /适合我的课表吗/);
});
