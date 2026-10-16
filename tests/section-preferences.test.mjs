import assert from "node:assert/strict";
import test from "node:test";
import { activePreferences, preferenceMiss } from "../lib/section-preferences.ts";
import { generateOptions } from "../lib/planner.ts";

const meeting = (days, start, end, building = "CSI", room = "1115") => ({ days, start_time: start, end_time: end, building, room });
const online = { days: null, start_time: null, end_time: null, building: "ONLINE", room: "" };
const lunch = { id: "lunch", days: ["Mon"], start: "12:00", end: "13:00" };

// Each case: a section's meetings, preferences, and whether the section suits them.
const cases = [
  ["no preferences", [meeting("MWF", "9:00am", "9:50am")], {}, true],
  ["a day off", [meeting("MWF", "10:00am", "10:50am")], { excludedDays: ["Fri"] }, false],
  ["another day off", [meeting("TuTh", "10:00am", "11:15am")], { excludedDays: ["Fri"] }, true],
  ["Saturday is not Tuesday", [meeting("Sa", "10:00am", "11:00am")], { excludedDays: ["Tue"] }, true],
  ["too early", [meeting("MWF", "8:00am", "8:50am")], { earliestStart: "09:00" }, false],
  ["starting at the earliest time", [meeting("MWF", "9:00am", "9:50am")], { earliestStart: "09:00" }, true],
  ["a discussion before the earliest time", [meeting("TuTh", "11:00am", "12:15pm"), meeting("F", "8:00am", "8:50am")], { earliestStart: "09:00" }, false],
  ["outside a strict window", [meeting("TuTh", "3:30pm", "4:45pm")], { windowStart: "09:00", windowEnd: "16:00", strictTime: true }, false],
  ["inside a strict window", [meeting("TuTh", "2:00pm", "3:15pm")], { windowStart: "09:00", windowEnd: "16:00", strictTime: true }, true],
  ["a window that is not strict", [meeting("TuTh", "3:30pm", "4:45pm")], { windowStart: "09:00", windowEnd: "16:00" }, true],
  ["a time still to be set, strict window", [meeting("TBA", null, null)], { windowStart: "09:00", windowEnd: "16:00", strictTime: true }, false],
  ["over a commitment", [meeting("MWF", "12:30pm", "1:20pm")], { busyBlocks: [lunch] }, false],
  ["ending as a commitment starts", [meeting("MWF", "11:00am", "12:00pm")], { busyBlocks: [lunch] }, true],
  ["online work, any preference", [online], { excludedDays: ["Mon"], earliestStart: "09:00", busyBlocks: [lunch] }, true],
  ["outside the chosen part of campus", [meeting("MWF", "10:00am", "10:50am", "CSI")], { campusAreas: ["south"] }, false],
  ["a building with no known place", [meeting("MWF", "10:00am", "10:50am", "ZZZ")], { campusAreas: ["south"] }, true],
];

test("a section breaks the step 02 preferences exactly when the scheduler would leave it out", () => {
  for (const [name, meetings, preferences, fits] of cases) {
    assert.equal(preferenceMiss(meetings, activePreferences(preferences)) === null, fits, name);
    const course = { course_id: "TEST100", title: "Test", credits: 3, sections: [{ section_id: "TEST100-0101", open_seats: 5, instructors: [], meetings }] };
    assert.equal(generateOptions([course], {}, preferences).options.length > 0, fits, `${name} (scheduler)`);
  }
});

test("only preferences that rule sections out count as set", () => {
  assert.equal(activePreferences(null), null);
  assert.equal(activePreferences({ excludedDays: [], earliestStart: "", windowStart: "09:00", windowEnd: "16:00", strictTime: false, busyBlocks: [], campusAreas: [] }), null);
  assert.equal(activePreferences({ campusAreas: ["nowhere"] }), null, "unknown parts of campus are dropped");
  assert.deepEqual(activePreferences({ excludedDays: ["Fri"] })?.excludedDays, ["Fri"]);
  assert.equal(preferenceMiss([meeting("F", "10:00am", "10:50am")], activePreferences({ excludedDays: ["Fri"] })), "day");
  assert.equal(preferenceMiss([meeting("M", "12:30pm", "1:20pm")], activePreferences({ busyBlocks: [lunch] })), "busy");
});
