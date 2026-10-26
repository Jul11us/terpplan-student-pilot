import assert from "node:assert/strict";
import test from "node:test";
import { generateOptions, applyRepair, replacementOptions } from "../lib/planner.ts";
import { anonymousBusyBlocks, validBusyBlocks, validBuffer } from "../lib/personal-schedule.ts";
import { readSavedState, writeSavedState, STORAGE_KEY } from "../lib/saved-state.ts";
import { normalizeProfessorName } from "../lib/planetterp.ts";
import { findSavedOption, optionSectionIds } from "../lib/option-choice.ts";

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

test("ranks a schedule you can walk between above one that crosses campus in ten minutes", () => {
  const at = (building, start, end) => ({ days: "MWF", start_time: start, end_time: end, classtype: "Lecture", building, room: "0100" });
  const cmsc = course("CMSC131", [{ section_id: "CMSC131-0101", open_seats: 4, instructors: [], meetings: [at("IRB", "10:00", "10:50")] }]);
  const engl = course("ENGL101", [
    // Both open, no instructor, same time: the only difference is where the class meets.
    { section_id: "ENGL101-0101", open_seats: 4, instructors: [], meetings: [at("TYD", "11:00", "11:50")] },
    { section_id: "ENGL101-0102", open_seats: 4, instructors: [], meetings: [at("CSI", "11:00", "11:50")] },
  ]);
  const result = generateOptions([cmsc, engl], {}, {});
  const near = result.options.find((option) => option.selectedSections.some((s) => s.section_id === "ENGL101-0102"));
  const far = result.options.find((option) => option.selectedSections.some((s) => s.section_id === "ENGL101-0101"));
  assert.ok(near && far);
  assert.equal(result.options[0], near);
  assert.equal(near.tightWalkCount, 0);
  assert.equal(far.tightWalkCount, 3);
  assert.ok(near.score - far.score > 0.6, `penalty ${near.score - far.score}`);
});

test("walking penalties do not promote full schedules or evict an open schedule from the candidate pool", () => {
  const at = (building, start, end) => ({ days: "MWF", start_time: start, end_time: end, classtype: "Lecture", building, room: "0100" });
  const cmsc = course("CMSC131", [{ section_id: "CMSC131-0101", open_seats: 4, instructors: [], meetings: [at("IRB", "10:00", "10:50")] }]);
  for (const fullCount of [1, 65]) {
    const engl = course("ENGL101", [
      { section_id: "ENGL101-0101", open_seats: 4, instructors: [], meetings: [at("TYD", "10:50", "11:40")] },
      ...Array.from({ length: fullCount }, (_, index) => ({ section_id: `ENGL101-${1000 + index}`, open_seats: 0, instructors: [], meetings: [at("CSI", "10:50", "11:40")] })),
    ]);
    const result = generateOptions([cmsc, engl], {}, {});
    assert.equal(result.options[0].fullSectionIds.length, 0, `open schedule stays first with ${fullCount} full alternatives`);
    assert.ok(result.options[0].selectedSections.some((item) => item.section_id === "ENGL101-0101"));
    assert.ok(!result.warnings.some((warning) => warning.code === "allOptionsFull"));
  }
});

test("score parts explain the score and add up to it", () => {
  const result = generateOptions([a, b], {}, {});
  for (const option of result.options) {
    const sum = option.scoreParts.reduce((total, part) => total + part.points, 0);
    assert.ok(Math.abs(sum - option.score) < 1e-9);
    // Gaps are shown but not scored; long walks are.
    assert.ok(!option.scoreParts.some((part) => part.key === "gaps"));
    assert.ok(option.scoreParts.some((part) => part.key === "longWalks"));
  }
});

test("the GPA preference puts the higher-GPA instructor first and explains the points", () => {
  const two = course("CMSC131", [
    section("CMSC131-0101", "10:00", "10:50", { instructors: ["Tough Grader"] }),
    section("CMSC131-0201", "14:00", "14:50", { instructors: ["Easy Grader"] }),
  ], { instructorGpa: { "tough grader": 2.6, "easy grader": 3.6 } });
  const plain = generateOptions([two], {}, {});
  assert.equal(plain.options[0].averageGpa, null);
  assert.ok(!plain.options[0].scoreParts.some((part) => part.key === "gpa"));
  const preferred = generateOptions([two], {}, { preferGpa: true });
  assert.equal(preferred.options[0].selectedSections[0].section_id, "CMSC131-0201");
  assert.equal(preferred.options[0].averageGpa, 3.6);
  const part = preferred.options[0].scoreParts.find((item) => item.key === "gpa");
  assert.ok(Math.abs(part.points - 1.2) < 1e-9);
});

test("the fewer-days preference ranks a compact week first and explains the points", () => {
  // Same course either on Monday (next to MATH140) or on Thursday, which adds a day on campus.
  const twoDays = course("CMSC132", [
    section("CMSC132-0101", "13:00", "13:50", { meetings: [meeting("13:00", "13:50", "Mon")] }),
    section("CMSC132-0201", "13:00", "13:50", { meetings: [meeting("13:00", "13:50", "Thu")] }),
  ]);
  const courses = [{ ...a, sections: [a.sections[0]] }, b, twoDays];
  const plain = generateOptions(courses, {}, {});
  assert.ok(!plain.options[0].scoreParts.some((part) => part.key === "days"));
  const fewer = generateOptions(courses, {}, { preferFewerDays: true });
  assert.deepEqual(fewer.options[0].campusDays, ["Mon"]);
  assert.equal(fewer.options[0].selectedSections.find((s) => s.course_id === "CMSC132").section_id, "CMSC132-0101");
  const part = fewer.options[0].scoreParts.find((item) => item.key === "days");
  assert.equal(part.count, 1);
  assert.ok(Math.abs(part.points + 1.2) < 1e-9);
  // Still a complete schedule: preferring fewer days must not drop a course.
  assert.equal(fewer.options[0].selectedSections.length, 3);
  assert.ok(Math.abs(fewer.options[0].scoreParts.reduce((sum, item) => sum + item.points, 0) - fewer.options[0].score) < 1e-9);
});

const at = (building, start, end, days = "MWF") => ({ days, start_time: start, end_time: end, classtype: "Lecture", building, room: "0100" });
const placed = (id, building, start, end, extra = {}) => ({ section_id: id, open_seats: 4, instructors: [], meetings: [at(building, start, end)], ...extra });

test("every option reports the parts of campus it meets in and its weekly walking time", () => {
  const cmsc = course("CMSC131", [placed("CMSC131-0101", "IRB", "10:00", "10:50")]);
  const engl = course("ENGL101", [placed("ENGL101-0101", "TYD", "13:00", "13:50")]);
  const option = generateOptions([cmsc, engl], {}, {}).options[0];
  assert.deepEqual(option.campusAreas, ["engineering", "mall"]);
  assert.ok(option.walkMinutes > 0);
  // One building all week is no walking, and no score part unless the preference asks for one.
  const near = generateOptions([cmsc, course("CMSC132", [placed("CMSC132-0101", "IRB", "13:00", "13:50")])], {}, {}).options[0];
  assert.deepEqual(near.campusAreas, ["engineering"]);
  assert.equal(near.walkMinutes, 0);
  assert.ok(!near.scoreParts.some((part) => part.key === "walkTime"));
});

test("the nearby preference ranks the closer building first and explains the points", () => {
  const cmsc = course("CMSC131", [placed("CMSC131-0101", "IRB", "10:00", "10:50")]);
  // Same time, same seats, no instructor: where the class meets is the only difference, and the gap is
  // long enough that neither option is a tight walk.
  const engl = course("ENGL101", [
    placed("ENGL101-0101", "TYD", "13:00", "13:50"),
    placed("ENGL101-0102", "CSI", "13:00", "13:50"),
  ]);
  const plain = generateOptions([cmsc, engl], {}, {});
  assert.ok(plain.options.every((option) => option.tightWalkCount === 0));
  assert.ok(!plain.options[0].scoreParts.some((part) => part.key === "walkTime"));
  const nearby = generateOptions([cmsc, engl], {}, { preferNearbyClasses: true });
  assert.equal(nearby.options[0].selectedSections.find((s) => s.course_id === "ENGL101").section_id, "ENGL101-0102");
  const part = nearby.options[0].scoreParts.find((item) => item.key === "walkTime");
  assert.equal(part.count, nearby.options[0].walkMinutes);
  assert.ok(Math.abs(part.points + 0.025 * nearby.options[0].walkMinutes) < 1e-9);
  assert.ok(Math.abs(nearby.options[0].scoreParts.reduce((sum, item) => sum + item.points, 0) - nearby.options[0].score) < 1e-9);
  // Ranking only: both sections are still offered as options.
  assert.equal(nearby.options.length, plain.options.length);
});

test("the campus-area filter leaves out sections elsewhere and keeps online and unplaced rooms", () => {
  const engl = course("ENGL101", [
    placed("ENGL101-0101", "TYD", "13:00", "13:50"),
    placed("ENGL101-0102", "CSI", "14:00", "14:50"),
    placed("ENGL101-0103", "TBA", "15:00", "15:50"),
    { section_id: "ENGL101-0104", open_seats: 4, instructors: [], meetings: [{ days: null, start_time: null, end_time: null, building: "ONLINE", room: null }] },
  ]);
  const ids = (preferences) => generateOptions([engl], {}, preferences).options.map((option) => option.selectedSections[0].section_id);
  // No areas chosen means anywhere on campus; the planner still returns at most three options.
  assert.ok(ids({}).length > 0);
  const engineering = generateOptions([engl], {}, { campusAreas: ["engineering"] });
  const kept = engineering.options.map((option) => option.selectedSections[0].section_id);
  assert.ok(kept.includes("ENGL101-0102"), `kept: ${kept}`);
  assert.ok(!kept.includes("ENGL101-0101"), `Tydings is on the mall, not in engineering: ${kept}`);
  // A room with no listed building and an online class are never ruled out by an area filter.
  assert.ok(kept.includes("ENGL101-0103") && kept.includes("ENGL101-0104"), `kept: ${kept}`);
  // An unknown area name cannot narrow anything, so it behaves like no filter at all.
  assert.deepEqual(
    generateOptions([engl], {}, { campusAreas: ["atlantis"] }).options.map((option) => option.selectedSections[0].section_id),
    ids({}),
  );
});

test("an impossible campus-area filter explains itself and offers to clear it", () => {
  const mallOnly = course("ENGL101", [placed("ENGL101-0101", "TYD", "13:00", "13:50")]);
  const result = generateOptions([mallOnly], {}, { campusAreas: ["west"] });
  assert.equal(result.options.length, 0);
  assert.ok(result.diagnostics.some((item) => item.code === "campusAreas" && item.courseIds.includes("ENGL101")));
  const repair = result.repairs.find((item) => item.kind === "clearCampusAreas");
  assert.ok(repair, `repairs: ${result.repairs.map((item) => item.kind)}`);
  const changed = applyRepair([mallOnly], { campusAreas: ["west"] }, repair);
  assert.deepEqual(changed.preferences.campusAreas, []);
  assert.equal(complete(generateOptions(changed.courses, {}, changed.preferences), 1).length, 1);
});

test("a required section is kept even when it meets outside the chosen areas", () => {
  const engl = course("ENGL101", [
    placed("ENGL101-0101", "TYD", "13:00", "13:50"),
    placed("ENGL101-0102", "CSI", "14:00", "14:50"),
  ], { pinnedSectionId: "ENGL101-0101" });
  const result = generateOptions([engl], {}, { campusAreas: ["engineering"] });
  assert.equal(result.options[0].selectedSections[0].section_id, "ENGL101-0101");
});

test("early classes cost points before the student's chosen time, or not at all when turned off", () => {
  const eight = course("CMSC131", [section("CMSC131-0101", "08:00", "08:50")]);
  const early = (preferences) => generateOptions([eight], {}, preferences).options[0].scoreParts.find((part) => part.key === "early");
  assert.deepEqual([early({}).count, early({}).at], [1, "9am"]);
  assert.equal(early({ earlyBefore: "08:00" }).count, 0);
  assert.deepEqual([early({ earlyBefore: "08:30" }).count, early({ earlyBefore: "08:30" }).at], [1, "8:30am"]);
  assert.equal(early({ earlyBefore: "off" }), undefined);
  // The preference also orders sections within a course: with 8am fine, the 8am section is not pushed back.
  const choice = course("MATH140", [section("MATH140-0101", "08:00", "08:50", { instructors: ["Ada Lovelace"] }), section("MATH140-0201", "13:00", "13:50", { instructors: ["Alan Turing"] })]);
  // 4.0 at 8am against 3.6 at 1pm: the 0.7 early-class cost decides it.
  const rated = (name, averageRating) => [normalizeProfessorName(name), { name, matched: true, averageRating, reviewCount: 10, status: "ok" }];
  const ratings = Object.fromEntries([rated("Ada Lovelace", 4.0), rated("Alan Turing", 3.6)]);
  assert.equal(generateOptions([choice], ratings, {}).options[0].selectedSections[0].section_id, "MATH140-0201", "9am default pushes the 8am section back");
  assert.equal(generateOptions([choice], ratings, { earlyBefore: "off" }).options[0].selectedSections[0].section_id, "MATH140-0101");
});

test("a saved early-class time survives, and anything else falls back to the default", () => {
  const values = new Map();
  const previous = globalThis.window;
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) } };
  try {
    writeSavedState({ preferences: { excludedDays: [], earliestStart: "", earlyBefore: "08:00", windowStart: "", windowEnd: "", strictTime: false, openSeatsOnly: false, includeFreshmanConnection: false } });
    assert.equal(readSavedState().preferences.earlyBefore, "08:00");
    values.set(STORAGE_KEY, JSON.stringify({ preferences: { earlyBefore: "<script>" } }));
    assert.equal(readSavedState().preferences.earlyBefore, "");
  } finally {
    if (previous === undefined) delete globalThis.window; else globalThis.window = previous;
  }
});

test("fixes come smallest change first, each with an example schedule to preview", () => {
  // MATH140 is pinned to a section that overlaps CMSC131's only section; MATH140 also has an open one at 2pm.
  const cmsc = course("CMSC131", [section("CMSC131-0101", "10:00", "10:50")]);
  const math = course("MATH140", [section("MATH140-0101", "10:30", "11:20"), section("MATH140-0201", "14:00", "14:50")], { pinnedSectionId: "MATH140-0101" });
  const result = generateOptions([cmsc, math], {}, { excludedDays: ["Fri"] });
  const kinds = result.repairs.map((repair) => repair.kind);
  assert.equal(kinds[0], "unpin", "switching the pinned section is the smallest change");
  assert.ok(kinds.indexOf("unpin") < kinds.indexOf("removeCourse"));
  assert.deepEqual(result.repairs.map((repair) => repair.cost), [...result.repairs.map((repair) => repair.cost)].sort((x, y) => x - y));
  const unpin = result.repairs[0];
  assert.deepEqual(unpin.preview.map((item) => [item.courseId, item.sectionId, item.full]), [["CMSC131", "CMSC131-0101", false], ["MATH140", "MATH140-0201", false]]);
  assert.deepEqual(unpin.preview[1].meetings, [{ days: "Mon", start: "14:00", end: "14:50" }]);
  assert.deepEqual([...unpin.sectionIds].sort(), ["CMSC131-0101", "MATH140-0201"]);
});

test("an example schedule uses open sections before full ones when both fit", () => {
  const cmsc = course("CMSC131", [section("CMSC131-0101", "10:00", "10:50")]);
  const math = course("MATH140", [
    section("MATH140-0101", "10:30", "11:20"),
    section("MATH140-0201", "13:00", "13:50", { open_seats: 0 }),
    section("MATH140-0301", "15:00", "15:50"),
  ], { pinnedSectionId: "MATH140-0101" });
  const unpin = generateOptions([cmsc, math], {}, {}).repairs.find((repair) => repair.kind === "unpin");
  assert.equal(unpin.preview.find((item) => item.courseId === "MATH140").sectionId, "MATH140-0301");
});

// Random courses for checking the search against every combination: a few lecture patterns, buildings across
// campus, rated, unrated and TBA instructors, some full sections and some discussions.
function randomCourses(seed, courseCount, sizes) {
  let state = seed;
  const random = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = (list) => list[Math.floor(random() * list.length)];
  const clock = (value) => `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
  const patterns = [["MWF", 50], ["TuTh", 75], ["MW", 75], ["F", 50], ["Th", 50]];
  const buildings = ["IRB", "CSI", "TYD", "ESJ", "MTH", "ARM", "VMH", "PHY", "SPH", "HBK"];
  const people = ["Ada Rated", "Bo Rated", "Cy Rated", "Di Unrated", "TBA"];
  return Array.from({ length: courseCount }, (_, index) => {
    const id = `TEST${100 + index}`;
    const sections = Array.from({ length: sizes[index] ?? 3 + Math.floor(random() * 3) }, (_, number) => {
      const [days, length] = pick(patterns);
      const start = 8 * 60 + 30 * Math.floor(random() * 18);
      const meetings = [{ days, start_time: clock(start), end_time: clock(start + length), classtype: "Lecture", building: pick(buildings), room: "0100" }];
      if (random() < 0.3) meetings.push({ days: days === "TuTh" ? "F" : "Th", start_time: clock(start), end_time: clock(start + 50), classtype: "Discussion", building: pick(buildings), room: "0200" });
      return { section_id: `${id}-0${101 + number}`, open_seats: random() < 0.15 ? 0 : 5, instructors: [pick(people)], meetings };
    });
    return course(id, sections, { instructorGpa: { "ada rated": 3.5, "bo rated": 2.7, "cy rated": 3.1 } });
  });
}
const searchRatings = Object.fromEntries([["Ada Rated", 4.6], ["Bo Rated", 3.2], ["Cy Rated", 4.1]].map(([name, rating]) => [normalizeProfessorName(name), { name, matched: true, status: "ok", averageRating: rating, reviewCount: 10, sourceUrl: null }]));
// How the page ranks schedules: fewer full sections, then the score as shown, then less walking, then fewer gaps.
const rankOf = (option) => [option.fullSectionIds.length, -Math.round(option.score * 100 + 1e-6), option.walkMinutes, option.gapMinutes];
const before = (a, b) => { for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] < b[index]; return false; };

test("the best schedule found is the best of every combination, under each preference", () => {
  const preferenceSets = [{}, { preferFewerDays: true }, { preferNearbyClasses: true, earlyBefore: "10:00" }, { windowStart: "10:00", windowEnd: "15:00", preferGpa: true }, { preferFewerDays: true, preferNearbyClasses: true, preferGpa: true }];
  for (let seed = 1; seed <= 12; seed += 1) {
    const courses = randomCourses(seed, 4, []);
    for (const preferences of preferenceSets) {
      let best = null;
      const visit = (index, picked) => {
        if (index === courses.length) {
          const option = generateOptions(courses.map((item, position) => ({ ...item, pinnedSectionId: picked[position] })), searchRatings, preferences).options[0];
          if (option?.selectedSections.length === courses.length && (!best || before(rankOf(option), rankOf(best)))) best = option;
          return;
        }
        for (const item of courses[index].sections) visit(index + 1, [...picked, item.section_id]);
      };
      visit(0, []);
      const result = generateOptions(courses, searchRatings, preferences);
      assert.equal(result.truncated, false);
      if (!best) { assert.equal(result.options.length, 0); continue; }
      assert.deepEqual(rankOf(result.options[0]), rankOf(best), `seed ${seed}, ${JSON.stringify(preferences)}`);
    }
  }
});

test("a five-course plan with large courses is searched completely", () => {
  const courses = randomCourses(99, 5, [20, 18, 30, 26, 90]);
  const result = generateOptions(courses, searchRatings, { busyBlocks: [{ id: "job", days: ["Tue", "Thu"], start: "13:00", end: "16:00" }] });
  assert.equal(result.truncated, false);
  assert.ok(!result.warnings.some((warning) => warning.code === "searchLimit"));
  assert.equal(result.options.length, 3);
});

test("schedules that show the same score are ranked by walking, then by time between classes", () => {
  const cmsc = course("CMSC131", [placed("CMSC131-0101", "IRB", "10:00", "10:50")]);
  // The same score each way (both buildings are a short walk from IRB): PHY is the longer walk, and the
  // 3pm section leaves the longer gap.
  const engl = course("ENGL101", [
    placed("ENGL101-0101", "PHY", "13:00", "13:50"),
    placed("ENGL101-0201", "CSI", "15:00", "15:50"),
    placed("ENGL101-0301", "CSI", "13:00", "13:50"),
  ]);
  const options = generateOptions([cmsc, engl], {}, {}).options;
  assert.equal(new Set(options.map((option) => option.score.toFixed(2))).size, 1);
  assert.deepEqual(options.map((option) => option.selectedSections.find((item) => item.course_id === "ENGL101").section_id), ["ENGL101-0301", "ENGL101-0201", "ENGL101-0101"]);
});

test("sections that differ only in room are one choice, the one with the most open seats", () => {
  const cmsc = course("CMSC131", [placed("CMSC131-0101", "IRB", "10:00", "10:50")]);
  const engl = course("ENGL101", [
    { ...placed("ENGL101-0101", "TYD", "13:00", "13:50"), open_seats: 2 },
    { ...placed("ENGL101-0102", "TYD", "13:00", "13:50"), open_seats: 9, meetings: [{ ...at("TYD", "13:00", "13:50"), room: "2110" }] },
    placed("ENGL101-0201", "TYD", "15:00", "15:50"),
  ]);
  const ids = generateOptions([cmsc, engl], {}, {}).options.map((option) => option.selectedSections.find((item) => item.course_id === "ENGL101").section_id);
  assert.deepEqual([...ids].sort(), ["ENGL101-0102", "ENGL101-0201"]);
});

test("a still-valid saved pick survives falling below the top three after ratings change", () => {
  const names = ["Ada Rated", "Bo Rated", "Cy Rated", "Dee Rated"];
  const offered = [course("CMSC131", names.map((name, i) => section(`CMSC131-0${i + 1}01`, `${10 + i}:00`, `${10 + i}:50`, { instructors: [name], open_seats: 10 })))];
  const ratings = (values) => Object.fromEntries(names.map((name, i) => [normalizeProfessorName(name), { name, matched: true, status: "ok", averageRating: values[i], reviewCount: 10 }]));
  const before = generateOptions(offered, ratings([5, 4, 3, 2]), {}).options;
  const saved = optionSectionIds(before[2]);
  assert.deepEqual(saved, ["CMSC131-0301"]);
  const changedRatings = ratings([5, 4, 1, 4.5]);
  const recommended = generateOptions(offered, changedRatings, {}).options;
  assert.equal(findSavedOption(recommended, saved, ["CMSC131"]).option, null);
  const retained = generateOptions(offered, changedRatings, {}, saved).options;
  assert.deepEqual(retained.slice(0, 3), recommended, "the top three recommendations stay intact");
  assert.equal(retained.length, 4);
  const match = findSavedOption(retained, saved, ["CMSC131"]);
  assert.deepEqual(match.gone, []);
  assert.equal(match.option.selectedSections[0].open_seats, 10);
  assert.equal(match.option.professorRating, 1, "the saved option is scored from the current data");
});

test("a saved pick discarded as an equivalent recommendation is still independently restored", () => {
  const offered = [course("CMSC131", [section("CMSC131-0101", "10:00", "10:50", { open_seats: 2 }), section("CMSC131-0102", "10:00", "10:50", { open_seats: 9 })])];
  const saved = ["CMSC131-0101"];
  assert.equal(findSavedOption(generateOptions(offered, {}, {}).options, saved, ["CMSC131"]).option, null);
  assert.ok(findSavedOption(generateOptions(offered, {}, {}, saved).options, saved, ["CMSC131"]).option);
});

test("restoring a saved pick respects current filters instead of making the pick a pin", () => {
  const wanted = section("CMSC131-0101", "10:00", "10:50", { instructors: ["Ada Rated"] });
  const alternate = section("CMSC131-0201", "14:00", "14:50", { instructors: ["Bo Rated"], meetings: [meeting("14:00", "14:50", "Tue")] });
  const saved = [wanted.section_id];
  const cases = [
    ["instructors", { instructors: ["Bo Rated"] }, {}, wanted],
    ["excluded section", { excludedSectionIds: [wanted.section_id] }, {}, wanted],
    ["different explicit pin", { pinnedSectionId: alternate.section_id }, {}, wanted],
    ["earliest start", {}, { earliestStart: "12:00" }, wanted],
    ["excluded day", {}, { excludedDays: ["Mon"] }, wanted],
    ["strict time window", {}, { strictTime: true, windowStart: "12:00", windowEnd: "16:00" }, wanted],
    ["personal commitment", {}, { busyBlocks: [block] }, wanted],
    ["open seats only", {}, { openSeatsOnly: true }, { ...wanted, open_seats: 0 }],
    ["section no longer offered", {}, {}, null],
  ];
  for (const [label, fields, preferences, current] of cases) {
    const offered = [course("CMSC131", [current, alternate].filter(Boolean), fields)];
    const options = generateOptions(offered, {}, preferences, saved).options;
    assert.equal(findSavedOption(options, saved, ["CMSC131"]).option, null, label);
    assert.ok(options.some((option) => option.selectedSections.some((section) => section.section_id === alternate.section_id)), `${label}: valid alternative remains`);
  }
});

test("restoring a saved combination rejects new meeting conflicts and class buffers", () => {
  const saved = ["CMSC131-0101", "MATH140-0101"];
  const offered = [a, course("MATH140", [section("MATH140-0101", "10:30", "11:20")])];
  assert.equal(findSavedOption(generateOptions(offered, {}, {}, saved).options, saved, ["CMSC131", "MATH140"]).option, null);
  assert.equal(findSavedOption(generateOptions([a, b], {}, { bufferMinutes: 11 }, saved).options, saved, ["CMSC131", "MATH140"]).option, null);
});

test("restoring a saved pick finds compatible added courses and forgets removed courses", () => {
  const offered = course("CMSC131", Array.from({ length: 4 }, (_, i) => section(`CMSC131-0${i + 1}01`, `${10 + i}:00`, `${10 + i}:50`)));
  const saved = ["CMSC131-0401", "STAT400-0101"];
  const added = course("MATH140", [section("MATH140-0101", "09:00", "09:50")]);
  const options = generateOptions([offered, added], {}, {}, saved).options;
  const match = findSavedOption(options, saved, ["CMSC131", "MATH140"]);
  assert.deepEqual(match.wanted, ["CMSC131-0401"]);
  assert.deepEqual(optionSectionIds(match.option), ["CMSC131-0401", "MATH140-0101"]);
  const removed = generateOptions([offered], {}, {}, saved).options;
  assert.deepEqual(optionSectionIds(findSavedOption(removed, saved, ["CMSC131"]).option), ["CMSC131-0401"]);
});
