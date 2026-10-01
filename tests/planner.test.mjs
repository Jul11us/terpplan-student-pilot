import assert from "node:assert/strict";
import test from "node:test";
import { generateOptions, applyRepair, replacementOptions } from "../lib/planner.ts";
import { anonymousBusyBlocks, validBusyBlocks, validBuffer } from "../lib/personal-schedule.ts";
import { readSavedState, writeSavedState, STORAGE_KEY } from "../lib/saved-state.ts";

const meeting = (start, end, days = "Mon", classtype = "Lecture") => ({ days, start_time: start, end_time: end, classtype, building: "CSI", room: "1115" });
const section = (id, start, end, extra = {}) => ({ section_id: id, open_seats: 4, instructors: [], meetings: [meeting(start, end)], ...extra });
const course = (id, sections, extra = {}) => ({ course_id: id, title: id, credits: 3, sections, ...extra });
const a = course("CMSC131", [section("CMSC131-0101", "10:00", "10:50"), section("CMSC131-0201", "14:00", "14:50")]);
const b = course("MATH140", [section("MATH140-0101", "11:00", "11:50")]);
const block = { id: "lunch", label: "Private lunch", days: ["Mon"], start: "10:00", end: "11:00" };
const complete = (result, n) => result.options.filter((option) => option.selectedSections.length === n);

test("keeps pinned sections and excluded/instructor choices authoritative", () => {
  const pinned = generateOptions([{ ...a, pinnedSectionId: "CMSC131-0201" }, b], {}, {});
  assert.ok(pinned.options.every((option) => option.selectedSections.some((s) => s.section_id === "CMSC131-0201")));
  const excluded = generateOptions([{ ...a, excludedSectionIds: ["CMSC131-0101"] }], {}, {});
  assert.equal(excluded.options[0].selectedSections[0].section_id, "CMSC131-0201");
  const missing = generateOptions([{ ...a, pinnedSectionId: "CMSC131-9999" }], {}, {});
  assert.equal(missing.options.length, 0);
  assert.ok(missing.repairs.some((repair) => repair.kind === "unpin"));
});

test("busy commitments exclude overlapping classes but allow touching endpoints", () => {
  const result = generateOptions([a, b], {}, { busyBlocks: [block], bufferMinutes: 10 });
  assert.equal(result.options[0].selectedSections.find((s) => s.course_id === a.course_id).section_id, "CMSC131-0201");
  assert.equal(result.diagnostics.length, 0);
  const blocked = generateOptions([{ ...a, sections: [a.sections[0]] }, b], {}, { busyBlocks: [block] });
  assert.ok(blocked.diagnostics.some((d) => d.code === "busyBlock" && d.blockId === "lunch"));
  assert.ok(blocked.repairs.some((repair) => repair.kind === "removeBlock"));
});

test("exact class buffer fits and an extra minute produces a concrete diagnosis", () => {
  const courses = [{ ...a, sections: [a.sections[0]] }, b];
  assert.equal(complete(generateOptions(courses, {}, { bufferMinutes: 10 }), 2).length, 1);
  const result = generateOptions(courses, {}, { bufferMinutes: 11 });
  assert.equal(result.options.length, 0);
  assert.equal(result.diagnostics[0].code, "bufferConflict");
  assert.deepEqual(result.diagnostics[0].courseIds, ["CMSC131", "MATH140"]);
  assert.equal(result.diagnostics[0].sample.leftEnd, "10:50");
  assert.ok(result.repairs.some((repair) => repair.kind === "clearBuffer"));
});

test("the buffer checks discussions and labs within a section too", () => {
  const labs = course("CHEM131", [section("CHEM131-0101", "10:00", "10:50", { meetings: [meeting("10:00", "10:50"), meeting("11:00", "11:50", "Mon", "Lab")] })]);
  assert.equal(generateOptions([labs], {}, { bufferMinutes: 10 }).options.length, 1);
  const result = generateOptions([labs], {}, { bufferMinutes: 15 });
  assert.equal(result.options.length, 0);
  assert.ok(result.diagnostics.some((d) => d.code === "bufferConflict"));
  assert.ok(result.repairs.some((r) => r.kind === "clearBuffer"));
});

test("proposed repairs are verified against every remaining requested course", () => {
  const courses = [{ ...a, sections: [a.sections[0]] }, b];
  const preferences = { excludedDays: ["Mon"], earliestStart: "12:00" };
  const result = generateOptions(courses, {}, preferences);
  assert.equal(result.repairs.length, 0, "neither individual change resolves both restrictions");
  assert.ok(result.diagnostics.some((d) => d.code === "excludedDay"));
  assert.ok(result.diagnostics.some((d) => d.code === "earliestStart"));
  const fixable = generateOptions(courses, {}, { excludedDays: ["Mon"] });
  for (const repair of fixable.repairs) {
    const changed = applyRepair(courses, { excludedDays: ["Mon"] }, repair);
    assert.ok(complete(generateOptions(changed.courses, {}, changed.preferences), changed.courses.length).length);
  }
});

test("diagnoses an unavoidable overlap and suggests removing a course", () => {
  const courses = [{ ...a, sections: [a.sections[0]] }, course("HIST110", [section("HIST110-0101", "10:30", "11:20")])];
  const result = generateOptions(courses, {}, {});
  assert.equal(result.diagnostics[0].code, "courseConflict");
  assert.ok(result.repairs.some((r) => r.kind === "removeCourse"));
});

test("a three-course conflict does not falsely blame a compatible pair", () => {
  const courses = ["CMSC131", "MATH140", "HIST110"].map((id) => course(id, [section(`${id}-0101`, "10:00", "11:00"), section(`${id}-0201`, "11:00", "12:00")]));
  const result = generateOptions(courses, {}, {});
  assert.equal(result.options.length, 0);
  assert.equal(result.diagnostics[0].code, "combinationConflict");
  assert.ok(result.repairs.every((r) => r.kind === "removeCourse"));
});

test("unknown meeting times remain explicitly unverified", () => {
  const unknown = course("HIST110", [{ section_id: "HIST110-0101", meetings: [], open_seats: null }]);
  const result = generateOptions([unknown], {}, { busyBlocks: [block], bufferMinutes: 30 });
  assert.equal(result.options.length, 1);
  assert.deepEqual(result.options[0].unknownSectionIds, ["HIST110-0101"]);
  assert.ok(result.warnings.some((w) => w.code === "tbaTimes"));
});

test("asynchronous classes do not conflict with commitments or buffers", () => {
  const online = course("INST104", [{ section_id: "INST104-0101", meetings: [{ days: null, start_time: null, end_time: null, building: "ONLINE" }] }]);
  const result = generateOptions([online], {}, { busyBlocks: [block], bufferMinutes: 30 });
  assert.equal(result.options.length, 1);
  assert.equal(result.options[0].unknownSectionIds.length, 0);
});

test("swapping keeps all other selected section IDs and respects busy blocks", () => {
  const target = { ...a, sections: [...a.sections, section("CMSC131-0301", "11:10", "12:00"), section("CMSC131-0401", "12:00", "12:50")] };
  const prefs = { busyBlocks: [{ ...block, start: "12:00", end: "13:00" }], bufferMinutes: 10 };
  const result = replacementOptions([target, b], {}, prefs, ["CMSC131-0101", "MATH140-0101"], "CMSC131");
  assert.equal(result.total, 1);
  assert.equal(result.options[0].selectedSections.find((s) => s.course_id === "CMSC131").section_id, "CMSC131-0201");
  assert.equal(result.options[0].selectedSections.find((s) => s.course_id === "MATH140").section_id, "MATH140-0101");
});

test("swapping a required section allows a new choice and honors exclusions", () => {
  const target = { ...a, pinnedSectionId: "CMSC131-0101", sections: [...a.sections, section("CMSC131-0301", "15:00", "15:50")], excludedSectionIds: ["CMSC131-0301"] };
  const result = replacementOptions([target, b], {}, {}, ["CMSC131-0101", "MATH140-0101"], "CMSC131");
  assert.equal(result.total, 1);
  assert.equal(result.options[0].selectedSections[0].section_id, "CMSC131-0201");
});

test("swapping rejects unavailable, duplicate and stale selections", () => {
  assert.throws(() => replacementOptions([a, b], {}, {}, ["CMSC131-9999", "MATH140-0101"], "CMSC131"));
  assert.throws(() => replacementOptions([a, b], {}, {}, ["CMSC131-0101", "CMSC131-0101"], "CMSC131"));
  assert.throws(() => replacementOptions([a, b], {}, { busyBlocks: [{ ...block, start: "11:00", end: "12:00" }] }, ["CMSC131-0101", "MATH140-0101"], "CMSC131"));
});

test("full and unknown seats are different, and open alternatives come first", () => {
  const target = { ...a, sections: [...a.sections, section("CMSC131-0301", "15:00", "15:50", { open_seats: 0 }), section("CMSC131-0401", "16:00", "16:50", { open_seats: null })] };
  const result = replacementOptions([target, b], {}, {}, ["CMSC131-0101", "MATH140-0101"], "CMSC131");
  assert.equal(result.options.at(-1).selectedSections[0].section_id, "CMSC131-0301");
  assert.equal(result.options.find((o) => o.selectedSections[0].section_id === "CMSC131-0401").fullSectionIds.length, 0);
  assert.equal(replacementOptions([target, b], {}, { openSeatsOnly: true }, ["CMSC131-0101", "MATH140-0101"], "CMSC131").total, 2);
});

test("validates same-day intervals, weekdays, IDs, limits and buffers", () => {
  assert.equal(validBusyBlocks([block]), true);
  for (const value of [[{ ...block, days: [] }], [{ ...block, days: ["Funday"] }], [{ ...block, start: "25:00" }], [{ ...block, end: "09:00" }], [block, block], Array.from({ length: 25 }, (_, i) => ({ ...block, id: `b${i}` }))]) assert.equal(validBusyBlocks(value), false);
  assert.equal(validBuffer(10), true);
  assert.equal(validBuffer(10.5), false);
  assert.equal(validBuffer(121), false);
  assert.deepEqual(anonymousBusyBlocks([block]), [{ id: "lunch", days: ["Mon"], start: "10:00", end: "11:00" }]);
});

test("restores commitments and buffer and keeps old saved plans compatible", () => {
  const storage = new Map();
  const previous = globalThis.window;
  globalThis.window = { localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) } };
  try {
    storage.set(STORAGE_KEY, JSON.stringify({ plans: { "202701": [{ courseId: "CMSC131", courseTitle: "Intro" }] }, preferences: { excludedDays: [], earliestStart: "", windowStart: "", windowEnd: "" } }));
    assert.equal(readSavedState().preferences.bufferMinutes, 0);
    writeSavedState({ preferences: { ...readSavedState().preferences, busyBlocks: [block], bufferMinutes: 15 } });
    assert.equal(readSavedState().preferences.busyBlocks[0].label, "Private lunch");
    assert.equal(readSavedState().preferences.bufferMinutes, 15);
    assert.equal(readSavedState().plans["202701"][0].courseId, "CMSC131");
  } finally { globalThis.window = previous; }
});
