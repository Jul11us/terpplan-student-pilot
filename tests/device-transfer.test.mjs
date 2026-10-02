import assert from "node:assert/strict";
import test from "node:test";
import { applyTransfer, decodeTransfer, encodeTransfer, transferCourseCount } from "../lib/device-transfer.ts";
import { readSavedState, writeSavedState } from "../lib/saved-state.ts";
import { readTaken, writeTaken } from "../lib/taken-courses.ts";

const state = {
  language: "zh",
  term: "202701",
  plans: { "202701": [{ courseId: "CMSC216", courseTitle: "Introduction to Computer Systems", pinnedSectionId: "CMSC216-0104" }, { courseId: "MATH141", courseTitle: "Calculus II" }] },
  preferences: { excludedDays: ["Fri"], earliestStart: "09:00", windowStart: "", windowEnd: "", strictTime: false, openSeatsOnly: true, includeFreshmanConnection: false, busyBlocks: [{ id: "b1", days: ["Mon"], start: "12:00", end: "13:00", label: "Shift at the dining hall" }], bufferMinutes: 10 },
};
const taken = { completed: ["CMSC131", "CMSC132"], inProgress: ["MATH140"], source: "manual", updatedAt: "2026-10-01T00:00:00Z" };

test("a transfer link round-trips the plan and courses taken, without event names or language", async () => {
  const code = await encodeTransfer(state, taken);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  const back = await decodeTransfer(code);
  assert.equal(back.state.term, "202701");
  assert.deepEqual(back.state.plans, state.plans);
  assert.equal(back.state.language, undefined);
  assert.equal(back.state.preferences.bufferMinutes, 10);
  assert.deepEqual(back.state.preferences.busyBlocks, [{ id: "b1", days: ["Mon"], start: "12:00", end: "13:00" }]);
  assert.deepEqual([back.taken.completed, back.taken.inProgress], [taken.completed, taken.inProgress]);
  assert.equal(transferCourseCount(back), 2);
});

test("damaged or foreign links are rejected", async () => {
  const code = await encodeTransfer(state, null);
  assert.equal((await decodeTransfer(code)).taken, null);
  assert.equal(await decodeTransfer(code.slice(0, code.length / 2)), null);
  assert.equal(await decodeTransfer("not-a-transfer"), null);
});

test("loading another device's plan replaces old preferences and taken courses, even when absent", async () => {
  const previous = globalThis.window;
  const values = new Map();
  globalThis.window = {
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
    dispatchEvent: () => {},
  };
  try {
    writeSavedState({ ...state, plans: { "202608": [{ courseId: "ENGL101", courseTitle: "Academic Writing" }] } });
    writeTaken({ completed: ["HIST200"], inProgress: [], source: "manual" });
    const transferred = await decodeTransfer(await encodeTransfer(state, taken));
    applyTransfer(transferred);
    assert.equal(readSavedState().language, "zh");
    assert.deepEqual(readSavedState().plans, transferred.state.plans);
    assert.deepEqual(readTaken().completed, taken.completed);
    assert.equal(readSavedState().preferences.bufferMinutes, 10);

    const empty = await decodeTransfer(await encodeTransfer({ term: "202701", plans: {} }, null));
    applyTransfer(empty);
    assert.deepEqual(readSavedState().plans, {});
    assert.equal(readSavedState().preferences, undefined);
    assert.equal(readTaken(), null);
    assert.equal(readSavedState().language, "zh");
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
