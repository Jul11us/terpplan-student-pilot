import assert from "node:assert/strict";
import test from "node:test";
import { sectionsTaughtBy } from "../lib/instructor.ts";

test("an instructor's sections are matched by name regardless of capitalization or spacing", () => {
  const sections = [
    { section_id: "CMSC131-0201", number: "0201", instructors: ["Elias  Gonzalez"], seats: 29, open_seats: 3, waitlist: null, meetings: [{ days: "MW", start_time: "2:00pm", end_time: "3:15pm" }] },
    { section_id: "CMSC131-0101", number: "0101", instructors: ["Nora Burkhauser"], seats: 30, open_seats: 30 },
    { section_id: "CMSC131-0105", number: "0105", instructors: ["Nora Burkhauser", "ELIAS GONZALEZ"], seats: "20", open_seats: "0", waitlist: "4" },
  ];
  const found = sectionsTaughtBy("CMSC131", sections, ["Elias Gonzalez"]);
  assert.deepEqual(found.map((section) => [section.sectionId, section.openSeats, section.waitlist]), [["CMSC131-0105", 0, 4], ["CMSC131-0201", 3, null]]);
  assert.equal(found[1].meetings.length, 1);
  assert.deepEqual(sectionsTaughtBy("CMSC131", sections, ["Someone Else"]), []);
});
