import assert from "node:assert/strict";
import test from "node:test";
import { courseLevel, isFull, rankHardCourses } from "../lib/hard-courses.ts";

const seats = (seats, open) => ({ seats, open, sections: 1, fullSections: open === 0 ? 1 : 0 });
const data = {
  builtAt: "2026-10-06",
  terms: ["202508", "202601", "202608"],
  courses: [
    { id: "BMGT220", title: "Big and always full", terms: { 202508: seats(300, 0), 202601: seats(300, 2), 202608: seats(300, 1) } },
    { id: "CMSC216", title: "Smaller, always full", terms: { 202508: seats(120, 0), 202601: seats(120, 0), 202608: seats(120, 0) } },
    { id: "PSYC100", title: "Full twice", terms: { 202508: seats(400, 0), 202601: seats(400, 60), 202608: seats(400, 0) } },
    { id: "ENGL101", title: "Only one term judged", terms: { 202608: seats(500, 0) } },
    { id: "ARTT100", title: "Small seminar", terms: { 202508: seats(20, 0), 202601: seats(20, 0), 202608: seats(20, 0) } },
    { id: "HIST200", title: "Never full", terms: { 202508: seats(100, 10), 202601: seats(100, 12) } },
  ],
};

test("full means at most 2% of seats (at least one) were left", () => {
  assert.ok(isFull(300, 6));
  assert.ok(!isFull(300, 7));
  assert.ok(isFull(30, 1), "one seat left in a small course still counts as full");
  assert.ok(!isFull(30, 2));
  assert.equal(courseLevel("CMSC216"), 200);
  assert.equal(courseLevel("ENEE699A"), 600);
});

test("courses full every semester come first, bigger ones ahead of smaller ones", () => {
  const ranked = rankHardCourses(data);
  assert.deepEqual(ranked.map((course) => course.id), ["BMGT220", "CMSC216", "PSYC100"]);
  const psyc = ranked[2];
  assert.equal(psyc.fullTerms, 2);
  assert.equal(psyc.readings.length, 3);
  assert.deepEqual(psyc.readings.map((reading) => reading.full), [true, false, true]);
  assert.equal(ranked[0].averageSeats, 300);
});

test("a course seen in one semester only, small courses and never-full courses are left out", () => {
  const ids = rankHardCourses(data).map((course) => course.id);
  for (const id of ["ENGL101", "ARTT100", "HIST200"]) assert.ok(!ids.includes(id), id);
  assert.ok(rankHardCourses(data, 1).some((course) => course.id === "ENGL101"));
});
