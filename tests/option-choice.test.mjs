import assert from "node:assert/strict";
import test from "node:test";
import { findSavedOption, optionSectionIds } from "../lib/option-choice.ts";
import { choiceKey, parseSavedState, readSavedState, STORAGE_KEY, writeOptionChoice } from "../lib/saved-state.ts";
import { decodeTransfer, encodeTransfer } from "../lib/device-transfer.ts";

const option = (...ids) => ({ selectedSections: ids.map((id) => ({ section_id: id, course_id: id.slice(0, id.indexOf("-")) })) });
const first = option("CMSC330-0101", "STAT400-0101");
const second = option("CMSC330-0201", "STAT400-0101");
const courses = ["CMSC330", "STAT400"];

test("the picked option is found by its sections, wherever it ranks now", () => {
  const picked = optionSectionIds(second);
  assert.equal(findSavedOption([first, second], picked, courses).option, second);
  assert.equal(findSavedOption([second, first], picked, courses).option, second, "re-ranked after new seat counts");
  assert.equal(findSavedOption([first, second], undefined, courses).option, null, "nothing picked yet");
});

test("a course added since keeps the picked sections; a course removed is left out", () => {
  const withMath = [option("CMSC330-0101", "STAT400-0101", "MATH240-0101"), option("CMSC330-0201", "STAT400-0101", "MATH240-0201")];
  assert.equal(findSavedOption(withMath, ["CMSC330-0201", "STAT400-0101"], [...courses, "MATH240"]).option, withMath[1]);
  const match = findSavedOption([option("CMSC330-0101"), option("CMSC330-0201")], ["CMSC330-0201", "STAT400-0101"], ["CMSC330"]);
  assert.deepEqual([match.option?.selectedSections[0].section_id, match.wanted], ["CMSC330-0201", ["CMSC330-0201"]]);
  assert.deepEqual(findSavedOption([first], ["ENGL101-0101"], courses), { option: null, wanted: [], gone: [] }, "none of the picked courses left");
});

test("when the pick is gone, the sections no option has any more are named", () => {
  assert.deepEqual(findSavedOption([first], ["CMSC330-0201", "STAT400-0101"], courses), { option: null, wanted: ["CMSC330-0201", "STAT400-0101"], gone: ["CMSC330-0201"] });
  // Both sections still exist, just not together.
  const apart = findSavedOption([option("CMSC330-0201", "STAT400-0201"), option("CMSC330-0101", "STAT400-0101")], ["CMSC330-0201", "STAT400-0101"], courses);
  assert.deepEqual([apart.option, apart.gone], [null, []]);
});

test("picks are kept per term and plan, checked when read, and travel with a device link", async () => {
  assert.equal(choiceKey("202701", true), "202701:B");
  const state = parseSavedState({ plans: {}, chosen: { "202701:A": ["STAT400-0101", "CMSC330-0201", "CMSC330-0201", "bad"], "202701:C": ["CMSC330-0101"], "202608:B": [] } });
  assert.deepEqual(state.chosen, { "202701:A": ["CMSC330-0201", "STAT400-0101"] });
  const transfer = await decodeTransfer(await encodeTransfer({ term: "202701", plans: { "202701": [{ courseId: "CMSC330", courseTitle: "CMSC330" }] }, chosen: state.chosen }, null));
  assert.deepEqual(transfer.state.chosen, state.chosen);
});

function withStorage(run) {
  const previous = globalThis.window;
  const values = new Map();
  globalThis.window = {
    localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    dispatchEvent: () => {},
  };
  try { run(values); }
  finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}

test("switching between identical Plan A and B inputs keeps each plan's own pick", () => withStorage(() => {
  const keyA = choiceKey("202701", false), keyB = choiceKey("202701", true);
  let choices = writeOptionChoice(keyA, optionSectionIds(second));
  choices = writeOptionChoice(keyB, optionSectionIds(first), choices);
  const options = [first, second];
  for (const [key, expected] of [[keyA, second], [keyB, first], [keyA, second]]) {
    assert.equal(findSavedOption(options, choices[key], courses).option, expected);
  }
}));

test("picking after another tab's change preserves its newer choices and other saved data", () => withStorage((values) => {
  const keyA = choiceKey("202701", false), keyB = choiceKey("202701", true);
  const stale = writeOptionChoice(keyA, optionSectionIds(first));
  // A different tab updates B and another term after this component read its choices.
  values.set(STORAGE_KEY, JSON.stringify({ language: "zh", plans: { "202701": [{ courseId: "CMSC330", courseTitle: "CMSC330" }] }, chosen: { ...stale, [keyB]: optionSectionIds(second), "202608:A": ["MATH240-0101"] } }));
  const choices = writeOptionChoice(keyA, optionSectionIds(second), stale);
  assert.deepEqual(choices[keyB], optionSectionIds(second));
  assert.deepEqual(choices["202608:A"], ["MATH240-0101"]);
  assert.deepEqual(readSavedState().chosen, choices);
  assert.equal(readSavedState().language, "zh");
  assert.equal(readSavedState().plans["202701"][0].courseId, "CMSC330");
  // A deliberate clear in another tab must not bring stale picks back.
  values.delete(STORAGE_KEY);
  assert.deepEqual(writeOptionChoice(keyB, optionSectionIds(first), choices), { [keyB]: optionSectionIds(first) });
}));

test("when storage is blocked, this visit can still pick independently for both plans", () => withStorage(() => {
  globalThis.window.localStorage = { getItem: () => { throw new Error("Blocked"); }, setItem: () => { throw new Error("Blocked"); } };
  const keyA = choiceKey("202701", false), keyB = choiceKey("202701", true);
  let choices = writeOptionChoice(keyA, optionSectionIds(second));
  choices = writeOptionChoice(keyB, optionSectionIds(first), choices);
  assert.equal(findSavedOption([first, second], choices[keyA], courses).option, second);
  assert.equal(findSavedOption([first, second], choices[keyB], courses).option, first);
}));
