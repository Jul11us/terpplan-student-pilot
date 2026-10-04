import assert from "node:assert/strict";
import test from "node:test";
import { applyTransfer, decodeTransfer, encodeTransfer, transferCourseCount, MAX_TRANSFER_BYTES } from "../lib/device-transfer.ts";
import { deflateRawSync } from "node:zlib";
import { readSavedState, writeSavedState } from "../lib/saved-state.ts";
import { readTaken, writeTaken } from "../lib/taken-courses.ts";

const state = {
  language: "zh",
  term: "202701",
  plans: { "202701": [{ courseId: "CMSC216", courseTitle: "Introduction to Computer Systems", pinnedSectionId: "CMSC216-0104" }, { courseId: "MATH141", courseTitle: "Calculus II" }] },
  preferences: { excludedDays: ["Fri"], earliestStart: "09:00", windowStart: "", windowEnd: "", strictTime: false, openSeatsOnly: true, includeFreshmanConnection: false, busyBlocks: [{ id: "b1", days: ["Mon"], start: "12:00", end: "13:00", label: "Shift at the dining hall" }], bufferMinutes: 10 },
};
const taken = { completed: ["CMSC131", "CMSC132"], inProgress: ["MATH140"], credits: 45, source: "manual", updatedAt: "2026-10-01T00:00:00Z" };

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
  assert.equal(back.taken.credits, 45);
  assert.equal(transferCourseCount(back), 2);
});

test("damaged or foreign links are rejected", async () => {
  const code = await encodeTransfer(state, null);
  assert.equal((await decodeTransfer(code)).taken, null);
  assert.equal(await decodeTransfer(code.slice(0, code.length / 2)), null);
  assert.equal(await decodeTransfer("not-a-transfer"), null);
});

test("small compressed links cannot expand into an unbounded browser allocation", async () => {
  const bomb = deflateRawSync(JSON.stringify({ v: 1, s: { plans: {}, padding: "x".repeat(MAX_TRANSFER_BYTES * 4) } })).toString("base64url");
  assert.ok(bomb.length < 4096);
  assert.equal(await decodeTransfer(bomb), null);
  assert.equal(await decodeTransfer("x".repeat(65537)), null);
  await assert.rejects(encodeTransfer({ plans: { "202701": [{ courseId: "CMSC131", courseTitle: "x".repeat(MAX_TRANSFER_BYTES) }] } }, null), /too large/);
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
    assert.equal(readTaken().credits, 45);
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

test("Plan B travels with the link and swapping keeps both plans", async () => {
  const { swapPlans } = await import("../lib/saved-state.ts");
  const planA = [{ courseId: "CMSC216", courseTitle: "Introduction to Computer Systems" }];
  const planB = [{ courseId: "CMSC250", courseTitle: "Discrete Structures" }];
  const swapped = swapPlans({ plans: { "202701": planA } }, "202701", planA);
  assert.deepEqual(swapped.plans["202701"], []);
  assert.deepEqual(swapped.otherPlans["202701"], planA);
  assert.equal(swapped.showingB["202701"], true);
  const back = swapPlans({ ...swapped, plans: { "202701": planB } }, "202701", planB);
  assert.deepEqual(back.plans["202701"], planA);
  assert.equal(back.showingB["202701"], undefined);

  const transfer = await decodeTransfer(await encodeTransfer({ term: "202701", plans: { "202701": planB }, otherPlans: { "202701": planA }, showingB: { "202701": true } }, null));
  assert.deepEqual(transfer.state.otherPlans["202701"], planA);
  assert.equal(transfer.state.showingB["202701"], true);
  assert.equal(transferCourseCount(transfer), 2);
});
