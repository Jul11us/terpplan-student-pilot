import assert from "node:assert/strict";
import test from "node:test";
import { commitCurrentOption, optionCommitKey, optionSelection, requestPreferences, storedOptionContext } from "../lib/option-confirmation.ts";
import { optionSectionIds } from "../lib/option-choice.ts";
import { readSavedState, STORAGE_KEY, writeOptionChoice } from "../lib/saved-state.ts";
import { readRegistrationDay, registrationCourses, saveRegistrationSchedule, setRegistrationDone } from "../lib/registration-day.ts";

const option = (...ids) => ({ selectedSections: ids.map((id) => ({ section_id: id, course_id: id.slice(0, id.indexOf("-")), course_title: id.slice(0, id.indexOf("-")), open_seats: 5 })) });
const old = option("MATH141-0101", "CMSC132-0101");
const first = option("MATH141-0201", "CMSC132-0101");
const second = option("MATH141-0301", "CMSC132-0101");
const courses = ["MATH141", "CMSC132"];
const savedState = () => ({ plans: { 202701: courses.map((courseId) => ({ courseId, courseTitle: courseId })) }, chosen: { "202701:A": optionSectionIds(old) } });
const schedule = (value) => ({ term: "202701", termName: "Spring 2027", savedAt: "2026-10-26T12:00:00Z", courses: registrationCourses(value.selectedSections, []), missing: [] });

function browser(t) {
  const previous = globalThis.window;
  const values = new Map();
  const window = {
    localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    sessionStorage: { getItem: () => null }, dispatchEvent: () => {},
  };
  globalThis.window = window;
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  values.set(STORAGE_KEY, JSON.stringify(savedState()));
  saveRegistrationSchedule(schedule(old));
  setRegistrationDone("202701", "MATH141", "0101", true);
  setRegistrationDone("202701", "CMSC132", "0101", true);
  return values;
}

test("invalid picks and card previews retain the old choice, checklist and completion until confirmation", (t) => {
  browser(t);
  const before = readRegistrationDay();
  const saved = readSavedState();
  const context = storedOptionContext(saved, "202701");
  const key = optionCommitKey(context);
  const fallback = optionSelection([first, second], context.savedIds, courses, key, null);
  assert.equal(fallback.replacementRequired, true);
  assert.equal(fallback.option, first);
  const preview = optionSelection([first, second], context.savedIds, courses, key, { context: key, sectionIds: optionSectionIds(second) });
  assert.equal(preview.option, second);
  assert.equal(preview.replacementRequired, true, "tapping a different candidate remains a preview");
  assert.deepEqual(readRegistrationDay(), before);
  assert.deepEqual(readSavedState().chosen["202701:A"], optionSectionIds(old));

  assert.equal(commitCurrentOption(second, [first, second], context, storedOptionContext(readSavedState(), "202701"), true, (picked) => {
    writeOptionChoice(context.choiceKey, optionSectionIds(picked));
    saveRegistrationSchedule(schedule(picked));
  }), true);
  assert.deepEqual(readSavedState().chosen["202701:A"], optionSectionIds(second));
  assert.deepEqual(readRegistrationDay().courses.map((course) => course.section), ["0301", "0101"]);
  assert.deepEqual(readRegistrationDay().done, ["202701:CMSC132:0101"], "only unchanged sections retain registered marks");
  assert.equal(optionSelection([first, second], optionSectionIds(second), courses, key, null).replacementRequired, false);
});

test("loading, stale preferences, failed or empty results cannot commit a replacement", (t) => {
  browser(t);
  const context = storedOptionContext(readSavedState(), "202701");
  const before = readRegistrationDay();
  let writes = 0;
  const commit = () => { writes += 1; saveRegistrationSchedule(schedule(first)); };
  assert.equal(commitCurrentOption(first, [first], context, context, false, commit), false, "loading or stale results are not usable");
  assert.equal(commitCurrentOption(first, [], context, context, true, commit), false, "an empty successful result has no candidate");
  assert.equal(commitCurrentOption(first, [second], context, context, true, commit), false, "a candidate removed by a newer response is rejected");
  assert.equal(commitCurrentOption(first, [first], context, null, true, commit), false, "unreadable latest storage is never assumed current");
  assert.equal(writes, 0);
  assert.deepEqual(readRegistrationDay(), before);
  const empty = optionSelection([], context.savedIds, courses, optionCommitKey(context), null);
  assert.equal(empty.replacementRequired, true);
  assert.equal(empty.option, undefined);
});

test("another tab's course, preference, slot or picked-section change rejects an already-rendered confirmation", (t) => {
  const values = browser(t);
  const initial = readSavedState();
  const expected = storedOptionContext(initial, "202701");
  const before = readRegistrationDay();
  const changed = [
    { ...initial, plans: { 202701: [{ courseId: "ENGL101", courseTitle: "Writing" }] } },
    { ...initial, preferences: { ...requestPreferences({}), earliestStart: "10:00" } },
    { ...initial, showingB: { 202701: true }, otherPlans: initial.plans },
    { ...initial, chosen: { "202701:A": optionSectionIds(second) } },
  ];
  let commits = 0;
  for (const state of changed) {
    values.set(STORAGE_KEY, JSON.stringify(state));
    assert.equal(commitCurrentOption(first, [first, second], expected, storedOptionContext(readSavedState(), "202701"), true, () => { commits += 1; }), false);
    assert.deepEqual(readRegistrationDay(), before);
  }
  assert.equal(commits, 0);
});

test("unrelated saves in another tab survive a valid confirmation", (t) => {
  const values = browser(t);
  const expected = storedOptionContext(readSavedState(), "202701");
  const state = { ...readSavedState(), language: "zh", otherPlans: { 202701: [{ courseId: "ENGL101", courseTitle: "Writing" }] }, chosen: { ...readSavedState().chosen, "202701:B": ["ENGL101-0101"], "202608:A": ["STAT400-0101"] } };
  values.set(STORAGE_KEY, JSON.stringify(state));
  assert.equal(commitCurrentOption(first, [first], expected, storedOptionContext(readSavedState(), "202701"), true, (picked) => writeOptionChoice(expected.choiceKey, optionSectionIds(picked))), true);
  assert.equal(readSavedState().language, "zh");
  assert.deepEqual(readSavedState().chosen["202701:B"], ["ENGL101-0101"]);
  assert.deepEqual(readSavedState().chosen["202608:A"], ["STAT400-0101"]);
});

test("fully replaced course lists still need confirmation, while new plans and restored picks retain their normal behavior", () => {
  const key = "current";
  const different = option("ENGL101-0101");
  const replaced = optionSelection([different], optionSectionIds(old), ["ENGL101"], key, null);
  assert.deepEqual(replaced.match.wanted, []);
  assert.equal(replaced.replacementRequired, true, "an existing pick is not erased by filtering all its courses out");
  assert.equal(optionSelection([first, second], undefined, courses, key, null).replacementRequired, false, "first-time recommendations keep the existing workflow");
  const restored = optionSelection([first, second, old], optionSectionIds(old), courses, key, null);
  assert.equal(restored.option, old);
  assert.equal(restored.replacementRequired, false, "a saved valid pick can sit outside the first recommendations");
});

test("candidate previews cannot leak across A/B, course, preference or saved-choice contexts", () => {
  const expected = { choiceKey: "202701:A", requestKey: "courses", prefsKey: "prefs", savedIds: optionSectionIds(old) };
  const context = optionCommitKey(expected);
  const preview = { context, sectionIds: optionSectionIds(second) };
  for (const changed of [
    { ...expected, choiceKey: "202701:B" }, { ...expected, requestKey: "changed courses" },
    { ...expected, prefsKey: "changed prefs" }, { ...expected, savedIds: ["MATH141-0401"] },
  ]) {
    assert.equal(optionSelection([first, second], changed.savedIds, courses, optionCommitKey(changed), preview).option, first);
  }
});

test("form defaults and stored preferences compare equally and private event labels are excluded", () => {
  assert.deepEqual(requestPreferences({}), requestPreferences({ earliestStart: "", windowStart: "", windowEnd: "", excludedDays: [], strictTime: false, openSeatsOnly: false, includeFreshmanConnection: false }));
  const block = { id: "job", days: ["Tue"], start: "13:00", end: "16:00", label: "Private event name" };
  const preferences = requestPreferences({ busyBlocks: [block] });
  assert.equal(JSON.stringify(preferences).includes(block.label), false);
  assert.deepEqual(preferences, requestPreferences({ busyBlocks: [{ ...block, label: "Renamed event" }] }));
  assert.notDeepEqual(preferences, requestPreferences({ busyBlocks: [{ ...block, end: "17:00" }] }));
});

test("ordinary ready picks still work independently in this tab when storage is blocked, while replacements stay guarded", (t) => {
  const values = browser(t);
  const persisted = values.get(STORAGE_KEY);
  t.mock.method(window.localStorage, "getItem", () => { throw new Error("Blocked"); });
  t.mock.method(window.localStorage, "setItem", () => { throw new Error("Blocked"); });
  let choices = {};
  for (const [slot, picked] of [["A", first], ["B", second]]) {
    const expected = { choiceKey: `202701:${slot}`, requestKey: "current plan", prefsKey: "current preferences", savedIds: [] };
    assert.equal(commitCurrentOption(picked, [first, second], expected, null, true, (candidate) => {
      choices = writeOptionChoice(expected.choiceKey, optionSectionIds(candidate), choices);
    }, false), true);
  }
  assert.deepEqual(choices, { "202701:A": optionSectionIds(first), "202701:B": optionSectionIds(second) });
  const replacement = { choiceKey: "202701:A", requestKey: "current plan", prefsKey: "current preferences", savedIds: optionSectionIds(old) };
  assert.equal(commitCurrentOption(second, [first, second], replacement, null, true, () => assert.fail("unverified replacement")), false);
  assert.equal(commitCurrentOption(second, [first, second], replacement, null, false, () => assert.fail("stale ordinary pick"), false), false);
  assert.equal(values.get(STORAGE_KEY), persisted, "a session-only selection never claims to have persisted");
});
