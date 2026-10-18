import assert from "node:assert/strict";
import test from "node:test";

// A minimal browser: localStorage and sessionStorage that live for the test.
function storage() {
  const items = new Map();
  return { getItem: (key) => items.has(key) ? items.get(key) : null, setItem: (key, value) => items.set(key, String(value)), removeItem: (key) => items.delete(key), items };
}
const local = storage(), session = storage();
let reloads = 0;
globalThis.window = {
  localStorage: local, sessionStorage: session,
  location: { href: "https://terpplan.test/?demo=1&ref=advisor", reload: () => { reloads += 1; } },
  history: { state: null, replaceState: (_state, _title, url) => { globalThis.window.location.href = "https://terpplan.test" + url; } },
};
Object.defineProperty(globalThis, "navigator", { value: { language: "zh-CN" }, configurable: true });

const { DEMO_TERM, isDemo, leaveDemo, startDemoFromUrl, storageKey, takeFreshDemo } = await import("../lib/demo.ts");
const { parseSavedState, readLanguage, readSavedState, writeSavedState } = await import("../lib/saved-state.ts");
const { readTaken } = await import("../lib/taken-courses.ts");

test("?demo=1 sets up the sample beside the real plan, and leaving brings the real plan back", () => {
  const realPlan = { language: "en", term: "202701", plans: { 202701: [{ courseId: "BMGT220", courseTitle: "Principles of Accounting I" }] } };
  local.setItem("terpplan:v1", JSON.stringify(realPlan));
  local.setItem("terpplan:taken", JSON.stringify({ completed: ["BMGT110"], inProgress: [], source: "manual", updatedAt: "" }));

  startDemoFromUrl();
  assert.ok(isDemo());
  assert.equal(window.location.href, "https://terpplan.test/?ref=advisor", "the demo flag leaves the address, the ref tag stays");
  assert.equal(storageKey("terpplan:v1"), "terpplan:v1:demo");

  // The planner now reads and writes the sample; the student's own plan is untouched.
  const sample = readSavedState();
  assert.equal(sample.language, "en", "keeps the language the visitor already chose");
  assert.deepEqual(sample.plans[DEMO_TERM].map((course) => course.courseId), ["MATH141", "CMSC132", "COMM107", "PSYC100", "ENGL101"]);
  assert.equal(sample.preferences.busyBlocks.length, 1);
  assert.deepEqual(readTaken().completed, ["MATH140", "CMSC131"]);
  writeSavedState({ plans: { [DEMO_TERM]: [] } });
  assert.deepEqual(JSON.parse(local.getItem("terpplan:v1")), realPlan);

  leaveDemo();
  assert.ok(!isDemo());
  assert.equal(reloads, 1);
  assert.deepEqual(readSavedState().plans[DEMO_TERM].map((course) => course.courseId), ["BMGT220"]);
  assert.deepEqual(readTaken().completed, ["BMGT110"]);
  assert.ok(![...local.items.keys()].some((key) => key.endsWith(":demo")), "the sample's copies are removed");
});

test("the sample passes the same checks as a saved plan", () => {
  window.location.href = "https://terpplan.test/?demo=1";
  local.items.clear();
  startDemoFromUrl();
  const stored = JSON.parse(local.getItem("terpplan:v1:demo"));
  const parsed = parseSavedState(stored);
  // Nothing in the sample is dropped by the saved-plan checks.
  assert.deepEqual(parsed.plans, stored.plans);
  assert.equal(parsed.term, stored.term);
  assert.deepEqual(parsed.preferences.busyBlocks, stored.preferences.busyBlocks);
  assert.equal(stored.language, "zh", "a Chinese browser without a saved language gets the Chinese sample");
  leaveDemo();
});

test("a new sample asks the planner to open on the schedules, once", () => {
  session.items.clear();
  local.items.clear();
  window.location.href = "https://terpplan.test/?demo=1";
  startDemoFromUrl();
  assert.equal(takeFreshDemo(), true, "the page that set the sample up opens it on the ranked schedules");
  assert.equal(takeFreshDemo(), false, "later loads of the tab keep whatever step the student is on");
  leaveDemo();
});

test("leaving the sample drops a request to open the schedules that was never read", () => {
  session.items.clear();
  local.items.clear();
  window.location.href = "https://terpplan.test/?demo=1";
  startDemoFromUrl();
  leaveDemo();
  assert.equal(takeFreshDemo(), false);
});

test("a saved language beats the browser's, which beats English", () => {
  local.items.clear();
  assert.equal(readLanguage(), "zh", "nothing saved, Chinese browser");
  writeSavedState({ language: "en" });
  assert.equal(readLanguage(), "en", "the choice the visitor made is kept");
  local.items.clear();
});
