import assert from "node:assert/strict";
import test from "node:test";
import { comparisonColumn, comparisonDifferences, comparisonKey, comparisonMetrics, comparisonPlans, comparisonRequest, initialComparison, startPlanComparison } from "../lib/plan-comparison.ts";

const course = (courseId, extra = {}) => ({ courseId, courseTitle: courseId, ...extra });
const section = (courseId, number = "0101", extra = {}) => ({ course_id: courseId, course_title: courseId, section_id: `${courseId}-${number}`, credits: 3, open_seats: 12, meetings: [], instructorRatings: [], ...extra });
const option = (sections, extra = {}) => ({ selectedSections: sections, totalCredits: sections.length * 3, score: 400, scoreParts: [], professorRating: 4, averageGpa: null, gapMinutes: 35, tightWalkCount: 0, walkMinutes: 15, campusAreas: [], earliestStart: "9:00am", latestEnd: "3:00pm", campusDays: ["Mon", "Wed"], timeFitPercent: null, unknownSectionIds: [], fullSectionIds: [], ...extra });
const input = (extra = {}) => ({ term: "202701", plans: { A: [course("MATH141")], B: [course("CMSC132")] }, preferences: {}, choices: {}, ...extra });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
const run = async (value, fetcher) => {
  const finished = deferred(), updates = [];
  const cancel = startPlanComparison(value, (state) => {
    updates.push(state);
    if (![state.A, state.B].some((column) => column.state === "loading")) finished.resolve(state);
  }, fetcher);
  return { state: await finished.promise, updates, cancel };
};

test("physical plan swapping keeps A/B names, inputs and picks attached to their own slot", () => {
  const A = [course("MATH141")], B = [course("MATH141")];
  const picks = { "202701:A": ["MATH141-0101"], "202701:B": ["MATH141-0201"] };
  const before = input({ plans: comparisonPlans("A", A, B), choices: picks });
  const after = input({ plans: comparisonPlans("B", B, A), choices: picks });
  assert.equal(after.plans.A, A);
  assert.equal(after.plans.B, B);
  assert.equal(comparisonKey(before), comparisonKey(after), "switching the visible slot alone does not change either comparison request");
  assert.deepEqual(comparisonRequest(after, "A").savedSectionIds, ["MATH141-0101"]);
  assert.deepEqual(comparisonRequest(after, "B").savedSectionIds, ["MATH141-0201"]);
});

test("requests share all current constraints while retaining each plan's filters; private event labels stay local", () => {
  const constraints = { earliestStart: "10:00", openSeatsOnly: true, bufferMinutes: 15, campusAreas: ["north"], preferFewerDays: true, busyBlocks: [{ id: "work", days: ["Tue"], start: "12:00", end: "14:00", label: "Private campus job name" }] };
  const value = input({ preferences: constraints, plans: { A: [course("MATH141", { instructors: ["Teacher A"], pinnedSectionId: "MATH141-0101" })], B: [course("CMSC132", { excludedSectionIds: ["CMSC132-0201"] })] }, choices: { "202701:A": ["MATH141-0101", "ENGL101-0101"] } });
  const A = comparisonRequest(value, "A"), B = comparisonRequest(value, "B");
  assert.deepEqual(A.preferences, B.preferences);
  assert.equal(A.preferences.bufferMinutes, 15);
  assert.equal(A.preferences.openSeatsOnly, true);
  assert.deepEqual(A.instructorFilters, { MATH141: ["Teacher A"] });
  assert.equal(A.sectionFilters.MATH141.pinnedSectionId, "MATH141-0101");
  assert.deepEqual(B.sectionFilters.CMSC132.excludedSectionIds, ["CMSC132-0201"]);
  assert.deepEqual(A.savedSectionIds, ["MATH141-0101"], "an unrelated old picked section is not sent to the API");
  assert.equal(JSON.stringify([A, B]).includes("Private campus job name"), false);
  const renamed = input({ ...value, preferences: { ...constraints, busyBlocks: [{ ...constraints.busyBlocks[0], label: "Renamed only locally" }] } });
  assert.equal(comparisonKey(value), comparisonKey(renamed));
});

test("saved choices are selected by identity beyond the first recommendation; invalid and unpicked previews remain explicit", () => {
  const courses = [course("MATH141")];
  const first = option([section("MATH141")]), saved = option([section("MATH141", "0201")]);
  assert.equal(comparisonColumn(courses, [first, saved], ["MATH141-0201"]).option, saved);
  assert.equal(comparisonColumn(courses, [first, saved], ["MATH141-0201"]).pick, "saved");
  assert.equal(comparisonColumn(courses, [first], ["MATH141-9999"]).pick, "invalid");
  assert.equal(comparisonColumn(courses, [first], ["CMSC132-0101"]).pick, "invalid", "a fully changed course list is still replacing a previous pick");
  assert.equal(comparisonColumn(courses, [first], []).pick, "unpicked");
  const none = input({ choices: {} }), unrelated = input({ choices: { "202701:A": ["HIST200-0101"] } });
  assert.notEqual(comparisonKey(none), comparisonKey(unrelated), "locally known replacement status is part of run identity");
});

test("time TBA and missing courses produce unknown statistics rather than a false zero", () => {
  const courses = [course("MATH141"), course("CMSC132")];
  const tba = option([section("MATH141", "0101", { credits: null, open_seats: null })], { gapMinutes: 0, walkMinutes: 0, campusDays: [], earliestStart: null, unknownSectionIds: ["MATH141-0101"] });
  const column = comparisonColumn(courses, [tba]);
  assert.deepEqual(column.missing, ["CMSC132"]);
  const metrics = comparisonMetrics(column);
  assert.deepEqual([metrics.earliestStart, metrics.days, metrics.gaps, metrics.walking, metrics.credits], [null, null, null, null, null]);
  assert.equal(metrics.incompleteTime, true);
  assert.equal(metrics.incompletePlan, true);
  assert.equal(metrics.unknownSeats, 2, "unplaced course seats are unknown too");
  assert.equal(comparisonMetrics({ state: "error", courses }), null);
  assert.equal(comparisonMetrics({ state: "unavailable", courses }), null);
  const missingTotals = comparisonMetrics(comparisonColumn([course("MATH141")], [option([section("MATH141")], { gapMinutes: undefined, walkMinutes: null, totalCredits: undefined })]));
  assert.deepEqual([missingTotals.gaps, missingTotals.walking, missingTotals.credits], [null, null, null], "missing API totals stay unknown instead of displaying undefined or zero");
});

test("fully asynchronous courses have real zero time totals; zero open seats are full and missing seats stay unknown", () => {
  const courses = [course("MATH141"), course("CMSC132"), course("HIST200")];
  const async = option([section("MATH141", "0101", { open_seats: "0" }), section("CMSC132", "0101", { open_seats: "" }), section("HIST200", "0101", { open_seats: "5" })], { gapMinutes: 0, walkMinutes: 0, campusDays: [], earliestStart: null });
  const metrics = comparisonMetrics(comparisonColumn(courses, [async]));
  assert.deepEqual([metrics.days, metrics.gaps, metrics.walking, metrics.credits], [0, 0, 0, 9]);
  assert.equal(metrics.incompleteTime, false);
  assert.equal(metrics.full, 1);
  assert.equal(metrics.unknownSeats, 1);
});

test("differences identify courses absent from a plan versus courses it could not place, without false equality after errors", () => {
  const A = comparisonColumn([course("MATH141"), course("CMSC132")], [option([section("MATH141")])]);
  const B = comparisonColumn([course("MATH141"), course("HIST200")], [option([section("MATH141", "0201"), section("HIST200")])]);
  assert.deepEqual(comparisonDifferences({ A, B }), [
    { courseId: "CMSC132", A: [], B: null },
    { courseId: "HIST200", A: null, B: ["HIST200-0101"] },
    { courseId: "MATH141", A: ["MATH141-0101"], B: ["MATH141-0201"] },
  ]);
  assert.equal(comparisonDifferences({ A, B: { state: "error", courses: B.courses } }), null);
  assert.deepEqual(comparisonDifferences({ A: { state: "empty", courses: [] }, B: { state: "empty", courses: [] } }), []);
});

test("empty plans and invalid preferred windows do not send schedule requests", () => {
  let requests = 0;
  const value = input({ plans: { A: [], B: [] } });
  const cancel = startPlanComparison(value, (state) => assert.deepEqual([state.A.state, state.B.state], ["empty", "empty"]), () => { requests++; throw new Error("must not fetch"); });
  cancel();
  const invalid = input({ preferences: { windowStart: "12:00", windowEnd: "" } });
  assert.deepEqual([initialComparison(invalid).A.state, initialComparison(invalid).B.state], ["invalid", "invalid"]);
  startPlanComparison(invalid, () => {}, () => { requests++; throw new Error("must not fetch"); })();
  assert.equal(requests, 0);
});

test("independent plan failures do not erase the successful side, and comparison sends no writes or private labels", async () => {
  const bodies = [];
  const value = input();
  const original = JSON.stringify(value);
  const { state, updates } = await run(value, async (url, request) => {
    assert.equal(url, "/api/schedules/generate");
    const body = JSON.parse(request.body); bodies.push(body);
    assert.equal(request.method, "POST");
    return body.courseIds[0] === "MATH141" ? Response.json({ options: [option([section("MATH141")])] }) : new Response(null, { status: 503 });
  });
  assert.equal(bodies.length, 2);
  assert.equal(state.A.state, "ready");
  assert.equal(state.B.state, "error");
  assert.deepEqual([updates[0].A.state, updates[0].B.state], ["loading", "loading"], "initial snapshots are immutable");
  assert.equal(JSON.stringify(value), original, "inputs, saved picks and preferences are never changed");
});

test("A→B→A input contexts cannot revive an abandoned loading run even when old fetches ignore abort", async () => {
  const A = input({ plans: { A: [course("MATH141")], B: [] } });
  const B = input({ term: "202608", plans: { A: [course("CMSC132")], B: [] } });
  const oldA = deferred(), oldB = deferred(), updates = [];
  let oldSignal;
  const cancelA = startPlanComparison(A, (state) => updates.push({ run: "oldA", state }), (_url, { signal }) => { oldSignal = signal; return oldA.promise; });
  cancelA();
  const cancelB = startPlanComparison(B, (state) => updates.push({ run: "oldB", state }), () => oldB.promise);
  cancelB();
  assert.equal(oldSignal.aborted, true);
  const finished = deferred();
  startPlanComparison(A, (state) => { updates.push({ run: "newA", state }); if (state.A.state === "ready") finished.resolve(); }, async () => Response.json({ options: [option([section("MATH141", "0201")])] }));
  await finished.promise;
  oldA.resolve(Response.json({ options: [option([section("MATH141", "9999")])] }));
  oldB.reject(new Error("old term failed late"));
  await nextTurn();
  assert.deepEqual(updates.filter(({ state }) => state.A.state === "ready").map(({ run, state }) => [run, state.A.option.selectedSections[0].section_id]), [["newA", "MATH141-0201"]]);
  assert.equal(updates.at(-1).run, "newA");
});

test("closing during JSON parsing ignores a late result and reopening starts fresh", async () => {
  const value = input({ plans: { A: [course("MATH141")], B: [] } });
  const parsed = deferred(), parsing = deferred(), updates = [];
  const cancel = startPlanComparison(value, (state) => updates.push(state), async () => ({ ok: true, json: () => { parsing.resolve(); return parsed.promise; } }));
  await parsing.promise;
  cancel();
  parsed.resolve({ options: [option([section("MATH141")])] });
  await nextTurn();
  assert.equal(updates.length, 1, "a closed comparison never receives the old completion");
  const reopened = await run(value, async () => Response.json({ options: [] }));
  assert.equal(reopened.state.A.state, "unavailable");
  assert.equal(reopened.state.B.state, "empty");
});
