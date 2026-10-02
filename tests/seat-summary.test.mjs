import assert from "node:assert/strict";
import test from "node:test";
import { summarizeSeats } from "../lib/seat-summary.ts";

test("counts open seats, leaves out Freshman Connection, and keeps unknown counts apart from full", () => {
  const summary = summarizeSeats([
    { section_id: "CMSC131-0101", open_seats: 3 },
    { section_id: "CMSC131-0102", open_seats: 0 },
    { section_id: "CMSC131-0103", open_seats: "5" },
    { section_id: "CMSC131-0104", open_seats: null },
    { section_id: "CMSC131-FC01", open_seats: 40 },
  ]);
  assert.deepEqual(summary, { sections: 4, openSections: 2, openSeats: 8, unknownSections: 1 });
  assert.deepEqual(summarizeSeats([]), { sections: 0, openSections: 0, openSeats: 0, unknownSections: 0 });
});
