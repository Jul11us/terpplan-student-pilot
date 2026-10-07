import assert from "node:assert/strict";
import test from "node:test";
import { parseDegreeAudit } from "../lib/degree-audit.ts";
import { parseCourseCodes, readTaken, writeTaken, writeTakenFromAudit, TAKEN_KEY, TAKEN_EVENT } from "../lib/taken-courses.ts";

test("audit import persists only passing and in-progress course codes and can be cleared", () => {
  const previous = globalThis.window;
  const values = new Map();
  const events = [];
  globalThis.window = {
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
    dispatchEvent: event => events.push(event.type),
  };
  try {
    const audit = parseDegreeAudit(`Doe, Jane\nFa25 CMSC131 4.0 B+ Programming I\nSp26 MATH140 4.0 TP Calculus I\nFa26 MATH141 4.0 IP Calculus II\nFa25 CMSC132 4.0 F Programming II\nSp26 STAT400 3.0 W Statistics`);
    writeTakenFromAudit(audit);
    const taken = readTaken();
    assert.deepEqual(taken.completed, ["CMSC131", "MATH140"]);
    assert.deepEqual(taken.inProgress, ["MATH141"]);
    assert.equal(taken.source, "audit");
    const stored = JSON.parse(values.get(TAKEN_KEY));
    assert.deepEqual(Object.keys(stored).sort(), ["completed", "credits", "inProgress", "source", "updatedAt"]);
    assert.equal(stored.credits, 12);
    assert.equal(values.get(TAKEN_KEY).includes("Doe"), false);
    // Saving also tells account sync that something changed.
    assert.deepEqual(events, ["terpplan:local-change", TAKEN_EVENT]);
    writeTaken(null);
    assert.equal(readTaken(), null);
    assert.equal(values.has(TAKEN_KEY), false);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test("manual course entry normalizes codes and removes duplicates", () => {
  assert.deepEqual(parseCourseCodes("cmsc131, MATH 140; stat400, CMSC131"), ["CMSC131", "MATH140", "STAT400"]);
});
