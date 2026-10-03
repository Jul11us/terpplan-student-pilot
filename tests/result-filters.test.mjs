import assert from "node:assert/strict";
import test from "node:test";
import { creditsMatch, filterResults, filtersActive, NO_FILTERS } from "../lib/result-filters.ts";

test("credit filter matches fixed credits, variable ranges and 4 or more", () => {
  assert.equal(creditsMatch("3", "3"), true);
  assert.equal(creditsMatch("3", "4+"), false);
  assert.equal(creditsMatch("1–3", "2"), true);
  assert.equal(creditsMatch("1-6", "4+"), true);
  assert.equal(creditsMatch(undefined, "3"), false);
  assert.equal(creditsMatch(undefined, "any"), true);
});

test("filters keep loading or unreadable seat counts and drop only known gaps", () => {
  const courses = [
    { course_id: "OPEN100", credits: "3" },
    { course_id: "FULL100", credits: "3" },
    { course_id: "LOAD100", credits: "3" },
    { course_id: "NEED200", credits: "4" },
  ];
  const seats = { OPEN100: { sections: 2, openSeats: 5 }, FULL100: { sections: 2, openSeats: 0 }, NEED200: { sections: 1, openSeats: 3 } };
  const needs = { NEED200: ["CMSC132"], OPEN100: [] };
  const ids = (list) => list.map((course) => course.course_id);
  const run = (filters) => ids(filterResults(courses, filters, (id) => seats[id], (id) => needs[id] ?? null));

  assert.deepEqual(run(NO_FILTERS), ["OPEN100", "FULL100", "LOAD100", "NEED200"]);
  assert.deepEqual(run({ ...NO_FILTERS, openSeats: true }), ["OPEN100", "LOAD100", "NEED200"]);
  assert.deepEqual(run({ ...NO_FILTERS, prereqsMet: true }), ["OPEN100", "FULL100", "LOAD100"]);
  assert.deepEqual(run({ ...NO_FILTERS, credits: "4+" }), ["NEED200"]);
  assert.equal(filtersActive(NO_FILTERS), false);
  assert.equal(filtersActive({ ...NO_FILTERS, credits: "3" }), true);
});

test("sorting by seats, GPA or credits puts unknown values last and keeps ties in search order", async () => {
  const { sortResults } = await import("../lib/result-filters.ts");
  const courses = [{ course_id: "A100", credits: "3" }, { course_id: "B100", credits: "1–3" }, { course_id: "C100", credits: "4" }, { course_id: "D100" }];
  const seats = { A100: { sections: 2, openSeats: 5 }, B100: { sections: 1, openSeats: 40 }, C100: { sections: 1, openSeats: 5 } };
  const gpa = { A100: 3.1, C100: 3.6 };
  const ids = (list) => list.map((course) => course.course_id);
  assert.deepEqual(ids(sortResults(courses, "match", () => null, () => null)), ["A100", "B100", "C100", "D100"]);
  assert.deepEqual(ids(sortResults(courses, "seats", (id) => seats[id], () => null)), ["B100", "A100", "C100", "D100"]);
  assert.deepEqual(ids(sortResults(courses, "gpa", () => null, (id) => gpa[id])), ["C100", "A100", "B100", "D100"]);
  assert.deepEqual(ids(sortResults(courses, "credits", () => null, () => null)), ["B100", "A100", "C100", "D100"]);
});
