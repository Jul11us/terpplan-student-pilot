import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/professor-card/route.ts";

const request = (params) => new Request("http://localhost/api/professor-card?" + new URLSearchParams(params).toString());

// PlanetTerp's two endpoints, answered from fixtures so the test never reaches the network.
const stubPlanetTerp = ({ professor, courseGrades = [], allGrades = [] }) => async (input) => {
  const url = new URL(String(input));
  if (url.pathname === "/api/v1/professor") return professor ? Response.json(professor) : new Response("", { status: 404 });
  if (url.pathname === "/api/v1/grades") return Response.json(url.searchParams.get("course") ? courseGrades : allGrades);
  throw new Error(`Unexpected upstream: ${url.pathname}`);
};

const padua = {
  name: "Nelson Padua-Perez",
  slug: "Padua-Perez",
  average_rating: 4.25,
  review_count: 2,
  reviews: [
    { course: "CMSC131", rating: 5, created: "2024-05-01T00:00:00", review: "Clear lectures and fair exams; the homework matched what was taught in class." },
    { course: "CMSC216", rating: 2, created: "2023-05-01T00:00:00", review: "Heavy workload and the grading on the project felt harsh compared with the lectures." },
  ],
};

test("the card rejects a missing instructor and an invalid course before calling PlanetTerp", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("no upstream call expected"); };
  try {
    assert.equal((await GET(request({ name: "" }))).status, 400);
    assert.equal((await GET(request({ name: "x".repeat(121) }))).status, 400);
    assert.equal((await GET(request({ name: "Nelson Padua-Perez", course: "not-a-course" }))).status, 400);
  } finally { globalThis.fetch = originalFetch; }
});

test("the card reports the rating, comments, average GPA and grade spread for this course", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = stubPlanetTerp({
    professor: padua,
    courseGrades: [{ semester: "202308", course: "CMSC131", A: 6, B: 3, C: 1, W: 2 }],
    allGrades: [{ semester: "202308", course: "CMSC216", F: 10 }],
  });
  try {
    const card = await (await GET(request({ name: "Nelson Padua-Perez", course: "CMSC131" }))).json();
    assert.equal(card.matched, true);
    assert.equal(card.averageRating, 4.25);
    assert.equal(card.sourceUrl, "https://planetterp.com/professor/Padua-Perez");
    assert.ok(card.highlights.length > 0);
    // Grades for this course are used when there are any, so "all courses" never silently stands in.
    assert.equal(card.gpa.scope, "course");
    assert.equal(card.grades.scope, "course");
    assert.equal(card.grades.students, 10);
    assert.equal(card.grades.withdrew, 2);
    assert.deepEqual(card.grades.bands.map((band) => band.students), [6, 3, 1, 0, 0]);
    assert.equal(card.courseId, "CMSC131");
  } finally { globalThis.fetch = originalFetch; }
});

test("with no grades in this course the card falls back to all their courses and says so", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = stubPlanetTerp({
    professor: { ...padua, name: "Fresh Instructor", slug: "Fresh" },
    courseGrades: [],
    allGrades: [{ semester: "202401", course: "CMSC216", A: 2, B: 2 }],
  });
  try {
    const card = await (await GET(request({ name: "Fresh Instructor", course: "CMSC131" }))).json();
    assert.equal(card.gpa.scope, "all");
    assert.equal(card.grades.scope, "all");
    assert.equal(card.grades.students, 4);
  } finally { globalThis.fetch = originalFetch; }
});

test("an unmatched instructor and failing grade data still return a usable card", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = stubPlanetTerp({ professor: null });
  try {
    const unmatched = await (await GET(request({ name: "Nobody Here", course: "CMSC131" }))).json();
    assert.equal(unmatched.matched, false);
    assert.equal(unmatched.status, "unmatched");
    assert.equal(unmatched.grades, null);
    assert.equal(unmatched.gpa, null);
  } finally { globalThis.fetch = originalFetch; }

  // The rating and comments are already in hand; losing the grade lookup must not lose them too.
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/v1/professor") return Response.json({ ...padua, name: "Grades Down", slug: "Down" });
    return new Response("", { status: 500 });
  };
  try {
    const card = await (await GET(request({ name: "Grades Down", course: "CMSC131" }))).json();
    assert.equal(card.matched, true);
    assert.equal(card.averageRating, 4.25);
    assert.ok(card.highlights.length > 0);
    assert.equal(card.grades, null);
    assert.equal(card.gpa, null);
  } finally { globalThis.fetch = originalFetch; }
});

test("a TBA instructor is never looked up", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("no upstream call expected"); };
  try {
    const card = await (await GET(request({ name: "TBA", course: "CMSC131" }))).json();
    assert.equal(card.status, "tba");
    assert.equal(card.matched, false);
    assert.deepEqual(card.highlights, []);
    assert.equal(card.grades, null);
  } finally { globalThis.fetch = originalFetch; }
});
