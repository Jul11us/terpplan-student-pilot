import assert from "node:assert/strict";
import test from "node:test";
import { coursesFromImport, previewScheduleImport, startImportLookup } from "../lib/import-workflow.ts";

const section = (courseId, number = "0101", problem = null) => ({ courseId, section: number, title: courseId + " title", problem, meetings: [] });
const pasted = (courseId, number = "0101") => ({ courseId, section: number });
const reply = (courseId, number = "0101") => Response.json({ course: { name: courseId + " title" }, sections: [{ section_id: `${courseId}-${number}`, meetings: [{ days: "MWF", start_time: "9:00am", end_time: "9:50am" }] }] });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
const lookup = async (sections, options) => {
  const finished = deferred();
  const updates = [];
  const cancel = startImportLookup(sections, "202701", (state) => { updates.push(state); if (!state.busy) finished.resolve(state); }, options);
  const result = await finished.promise;
  return { result, updates, cancel };
};

test("an existing course does not use the last free place needed by a new course", () => {
  const existing = ["MATH141", "COMM107", "PSYC100", "ENGL101", "HIST200", "STAT400", "ECON200", "BSCI160", "ARTH200"];
  const preview = previewScheduleImport([section("MATH141", "0221"), section("CMSC132")], existing, false);
  assert.deepEqual(preview.map((row) => row.action), ["update", "add"]);
  assert.deepEqual(coursesFromImport(preview).map((course) => course.pinnedSectionId), ["MATH141-0221", "CMSC132-0101"]);
  assert.equal(new Set([...existing, ...coursesFromImport(preview).map((course) => course.courseId)]).size, 10);
});

test("full plans still update existing courses regardless of input order; only unique new courses count", () => {
  const existing = ["MATH141", ...Array.from({ length: 9 }, (_, i) => `TEST${100 + i}`)];
  const preview = previewScheduleImport([section("CMSC132"), section("MATH141"), section("MATH141", "0201")], existing, false);
  assert.deepEqual(preview.map(({ action, reason }) => [action, reason]), [["skip", "capacity"], ["update", undefined], ["skip", "duplicate"]]);
  assert.deepEqual(coursesFromImport(preview).map((course) => course.courseId), ["MATH141"]);
});

test("replacement preview has its own ten slots and failed lookups never consume one", () => {
  const found = [section("FAIL100", "0101", "lookup"), ...Array.from({ length: 11 }, (_, i) => section(`TEST${100 + i}`))];
  const preview = previewScheduleImport(found, ["TEST100"], true);
  assert.equal(preview[1].action, "add", "replacement builds a fresh plan rather than updating its old rows");
  assert.equal(coursesFromImport(preview).length, 10);
  assert.equal(preview.at(-1).reason, "capacity");
});

test("a lookup keeps successful rows when another course fails, and distinguishes unavailable data from failures", async () => {
  const urls = [];
  const { result, updates } = await lookup([pasted("MATH141"), pasted("CMSC132"), pasted("ENGL101"), pasted("PSYC100"), pasted("HIST200")], {
    retryDelayMs: 0,
    fetcher: async (url) => {
      urls.push(url);
      if (url.includes("CMSC132")) throw new Error("offline");
      if (url.includes("ENGL101")) return new Response(null, { status: 404 });
      if (url.includes("PSYC100")) return Response.json({ course: { name: "Psychology" }, sections: [] });
      if (url.includes("HIST200")) return Response.json({ error: "incomplete upstream response" });
      return reply("MATH141");
    },
  });
  assert.deepEqual(result.found.map((item) => item.problem), [null, "lookup", "course", "section", "lookup"]);
  assert.equal(result.found[0].meetings.length, 1);
  assert.equal(result.busy, false);
  assert.ok(updates[0].found.every((item) => item.problem === "pending"), "the initial snapshot is not mutated as responses arrive");
  assert.ok(urls.every((url) => /^\/api\/course\?id=[A-Z]+\d+&term=202701$/.test(url)), "only parsed public course IDs and the term leave the browser");
});

test("retry asks only failed or stopped rows and preserves successful and authoritative missing rows", async () => {
  const previous = [section("MATH141"), section("CMSC132", "0101", "lookup"), section("ENGL101", "0101", "course"), section("PSYC100", "0101", "section"), section("HIST200", "0101", "pending")];
  const requests = [];
  const { result } = await lookup(previous.map(({ courseId, section }) => ({ courseId, section })), {
    previous,
    fetcher: async (url) => { requests.push(url); return reply(new URL(url, "https://example.test").searchParams.get("id")); },
  });
  assert.deepEqual(requests.map((url) => new URL(url, "https://example.test").searchParams.get("id")), ["CMSC132", "HIST200"]);
  assert.equal(result.found[0], previous[0]);
  assert.deepEqual(result.found.map((item) => item.problem), [null, null, "course", "section", null]);
});

test("a delayed cancelled lookup cannot replace a newer result even when fetch ignores abort", async () => {
  const response = deferred();
  const updates = [];
  let oldSignal;
  const cancel = startImportLookup([pasted("MATH141")], "202701", (state) => updates.push({ source: "old", ...state }), {
    fetcher: (_url, { signal }) => { oldSignal = signal; return response.promise; },
  });
  cancel();
  assert.equal(oldSignal.aborted, true);
  const finished = deferred();
  startImportLookup([pasted("CMSC132")], "202608", (state) => { updates.push({ source: "new", ...state }); if (!state.busy) finished.resolve(); }, { fetcher: async () => reply("CMSC132") });
  await finished.promise;
  response.resolve(reply("MATH141"));
  await nextTurn();
  assert.deepEqual(updates.filter((state) => !state.busy).map((state) => [state.source, state.found[0].courseId]), [["new", "CMSC132"]]);
  assert.equal(updates.at(-1).source, "new", "the old completion cannot clear the new job's busy state");
});

test("cancelling during response parsing ignores a late JSON result or rejection", async () => {
  const parsed = deferred(), parsing = deferred();
  const updates = [];
  const cancel = startImportLookup([pasted("MATH141")], "202701", (state) => updates.push(state), {
    fetcher: async () => ({ status: 200, ok: true, json: () => { parsing.resolve(); return parsed.promise; } }),
  });
  await parsing.promise;
  cancel();
  parsed.reject(new Error("old malformed response"));
  await nextTurn();
  assert.equal(updates.length, 1);
});

test("cancelling the automatic retry clears its wait and sends no second request", async () => {
  const received = deferred();
  let requests = 0;
  const updates = [];
  const cancel = startImportLookup([pasted("MATH141")], "202701", (state) => updates.push(state), {
    retryDelayMs: 15,
    fetcher: async () => { requests += 1; received.resolve(); return new Response(null, { status: 503 }); },
  });
  await received.promise;
  await nextTurn();
  cancel();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(requests, 1);
  assert.equal(updates.length, 1);
});

test("a transient server failure is retried once, then remains an explicit retryable failure", async () => {
  let requests = 0;
  const { result } = await lookup([pasted("MATH141")], { retryDelayMs: 0, fetcher: async () => { requests += 1; return new Response(null, { status: 503 }); } });
  assert.equal(requests, 2);
  assert.equal(result.found[0].problem, "lookup");
  assert.deepEqual(coursesFromImport(previewScheduleImport(result.found, [], false)), []);
});
