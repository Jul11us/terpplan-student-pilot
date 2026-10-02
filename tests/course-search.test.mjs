import assert from "node:assert/strict";
import test from "node:test";
import { courseSearchKey, courseSearchView, startCourseSearch } from "../lib/course-search.ts";

const chemistry = { course_id: "CHEM134", name: "Chemical Principles for Engineering" };
const electrical = { course_id: "ENEE150", name: "Intermediate Programming Concepts for Engineers" };
const ready = (query, term, course) => ({ key: courseSearchKey(query, term), status: "ready", results: [course], error: "" });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test("a new query or term hides old results and errors before a request starts", () => {
  const previous = ready("chem", "202701", chemistry);
  assert.deepEqual(courseSearchView(previous, "chem 134", "202701"), { results: [], searching: true, error: "" });
  assert.deepEqual(courseSearchView(previous, "chem", "202608"), { results: [], searching: true, error: "" });
  assert.deepEqual(courseSearchView({ ...previous, status: "error", error: "old error" }, "enee 150", "202701"), { results: [], searching: true, error: "" });
  assert.deepEqual(courseSearchView(previous, "", "202701"), { results: [], searching: false, error: "" });
  assert.deepEqual(courseSearchView(previous, "c", "202701"), { results: [], searching: false, error: "" });
  assert.deepEqual(courseSearchView(previous, " CHEM ", "202701").results, [chemistry]);
});

test("a delayed old response cannot replace a newer search even if fetch ignores abort", async () => {
  const oldStarted = deferred(), newStarted = deferred(), oldResponse = deferred();
  const updates = [];
  let oldSignal;
  const cancelOld = startCourseSearch("chem", "202701", (state) => updates.push(state), "failed", {
    delayMs: 0,
    fetcher: (url, { signal }) => { oldSignal = signal; oldStarted.resolve(url); return oldResponse.promise; },
  });
  await oldStarted.promise;
  cancelOld();
  assert.equal(oldSignal.aborted, true);
  const cancelNew = startCourseSearch("enee 150", "202701", (state) => updates.push(state), "failed", {
    delayMs: 0,
    fetcher: async (url) => { newStarted.resolve(url); return Response.json({ results: [electrical] }); },
  });
  assert.equal(await newStarted.promise, "/api/search?q=enee%20150&term=202701");
  await nextTurn();
  oldResponse.resolve(Response.json({ results: [chemistry] }));
  await nextTurn();
  assert.deepEqual(updates.filter((state) => state.status === "ready").map((state) => state.results), [[electrical]]);
  assert.deepEqual(courseSearchView(updates.at(-1), "enee 150", "202701").results, [electrical]);
  cancelNew();
});

test("clearing a search ignores a late failure and leaves no loading state", async () => {
  const started = deferred(), response = deferred();
  const updates = [];
  const cancel = startCourseSearch("CHEM134", "202701", (state) => updates.push(state), "failed", {
    delayMs: 0,
    fetcher: () => { started.resolve(); return response.promise; },
  });
  await started.promise;
  cancel();
  response.reject(new Error("old network failure"));
  await nextTurn();
  assert.equal(updates.length, 1);
  assert.deepEqual(courseSearchView(updates[0], "", "202701"), { results: [], searching: false, error: "" });
});

test("a cancelled debounce does not send a request; short queries do not send one", async () => {
  let requests = 0;
  const fetcher = async () => { requests++; return Response.json({ results: [] }); };
  const cancel = startCourseSearch("CHEM134", "202701", () => assert.fail("cancelled update"), "failed", { delayMs: 0, fetcher });
  cancel();
  startCourseSearch(" c ", "202701", () => assert.fail("short-query update"), "failed", { delayMs: 0, fetcher })();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(requests, 0);
});

test("an active search surfaces errors without showing a false no-results state", async () => {
  const finished = deferred();
  const cancel = startCourseSearch("CHEM134", "202701", (state) => { if (state.status === "error") finished.resolve(state); }, "failed", {
    delayMs: 0,
    fetcher: async () => Response.json({ error: "Search unavailable" }, { status: 503 }),
  });
  assert.deepEqual(courseSearchView(await finished.promise, "CHEM134", "202701"), { results: [], searching: false, error: "Search unavailable" });
  cancel();
});
