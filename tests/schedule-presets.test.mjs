import assert from "node:assert/strict";
import test from "node:test";
import { PRESET_KEYS, presetActive, presetOff, presetOn, togglePreset } from "../lib/schedule-presets.ts";
import { optionKey, sortOptions } from "../lib/option-sort.ts";

const empty = { excludedDays: [], earliestStart: "", windowStart: "", windowEnd: "", strictTime: false, preferFewerDays: false, preferNearbyClasses: false };
const apply = (fields, patch) => ({ ...fields, ...patch });

test("every preset turns on, reads as active, and turns back off", () => {
  for (const key of PRESET_KEYS) {
    assert.equal(presetActive(key, empty), false, key);
    const on = apply(empty, presetOn(key, empty));
    assert.equal(presetActive(key, on), true, key);
    const off = apply(on, presetOff(key, on));
    assert.equal(presetActive(key, off), false, key);
  }
});

test("no Friday adds only Friday and keeps other excluded days", () => {
  const fields = apply(empty, { excludedDays: ["Mon"] });
  const on = apply(fields, presetOn("noFriday", fields));
  assert.deepEqual(on.excludedDays, ["Mon", "Fri"]);
  assert.deepEqual(apply(on, presetOff("noFriday", on)).excludedDays, ["Mon"]);
  assert.deepEqual(presetOn("noFriday", on).excludedDays, ["Mon", "Fri"]);
});

test("no early classes sets the earliest start and counts a stricter one as active", () => {
  assert.equal(apply(empty, presetOn("noEarly", empty)).earliestStart, "10:00");
  assert.equal(presetActive("noEarly", apply(empty, { earliestStart: "10:30" })), true);
  assert.equal(presetActive("noEarly", apply(empty, { earliestStart: "09:00" })), false);
  assert.equal(presetActive("noEarly", apply(empty, { earliestStart: "nonsense" })), false);
});

test("nothing after 5pm keeps a chosen morning start and only drops strict mode when turned off", () => {
  const fields = apply(empty, { windowStart: "09:30" });
  const on = apply(fields, presetOn("noEvening", fields));
  assert.deepEqual([on.windowStart, on.windowEnd, on.strictTime], ["09:30", "17:00", true]);
  const off = apply(on, presetOff("noEvening", on));
  assert.deepEqual([off.windowStart, off.windowEnd, off.strictTime], ["09:30", "17:00", false]);
  // An earlier end is still "nothing after 5pm"; a window that is not enforced is not.
  assert.equal(presetActive("noEvening", apply(empty, { windowEnd: "15:00", strictTime: true })), true);
  assert.equal(presetActive("noEvening", apply(empty, { windowEnd: "17:00", strictTime: false })), false);
  assert.equal(presetActive("noEvening", apply(empty, { windowEnd: "19:00", strictTime: true })), false);
});

test("presets do not clear each other", () => {
  let fields = empty;
  for (const key of PRESET_KEYS) fields = apply(fields, togglePreset(key, fields));
  for (const key of PRESET_KEYS) assert.equal(presetActive(key, fields), true, key);
  const withoutFriday = apply(fields, togglePreset("noFriday", fields));
  assert.equal(presetActive("noFriday", withoutFriday), false);
  assert.equal(presetActive("noEarly", withoutFriday), true);
  assert.equal(presetActive("noEvening", withoutFriday), true);
  assert.equal(presetActive("fewerDays", withoutFriday), true);
  assert.equal(presetActive("nearby", withoutFriday), true);
});

test("the ranking-only presets leave every section-excluding field untouched", () => {
  for (const key of ["fewerDays", "nearby"]) {
    const on = apply(empty, presetOn(key, empty));
    assert.deepEqual([on.excludedDays, on.earliestStart, on.windowEnd, on.strictTime], [[], "", "", false], key);
  }
});

const option = (name, extra) => ({
  selectedSections: [{ section_id: name }],
  campusDays: ["Mon", "Tue"],
  earliestStart: "10:00am",
  gapMinutes: 60,
  professorRating: 4,
  ...extra,
});

test("option sort leaves the planner's order alone for 'best'", () => {
  const options = [option("a"), option("b")];
  assert.equal(sortOptions(options, "best"), options);
});

test("option sort orders by days, start, gaps and rating", () => {
  const options = [
    option("a", { campusDays: ["Mon", "Tue", "Wed"], earliestStart: "9:00am", gapMinutes: 30, professorRating: 3.1 }),
    option("b", { campusDays: ["Mon", "Tue"], earliestStart: "11:00am", gapMinutes: 120, professorRating: 4.5 }),
    option("c", { campusDays: ["Mon", "Tue", "Wed", "Thu"], earliestStart: "8:00am", gapMinutes: 0, professorRating: 2.0 }),
  ];
  const ids = (sort) => sortOptions(options, sort).map(optionKey);
  assert.deepEqual(ids("fewestDays"), ["b", "a", "c"]);
  assert.deepEqual(ids("latestStart"), ["b", "a", "c"]);
  assert.deepEqual(ids("fewestGaps"), ["c", "a", "b"]);
  assert.deepEqual(ids("highestRating"), ["b", "a", "c"]);
});

test("least walking orders by weekly walking time, and zero walking is a value, not a blank", () => {
  const options = [option("a", { walkMinutes: 24 }), option("b", { walkMinutes: 0 }), option("c", { walkMinutes: 8 })];
  assert.deepEqual(sortOptions(options, "leastWalking").map(optionKey), ["b", "c", "a"]);
  // Options the planner reported no walking time for keep their order and go last.
  const partial = [option("a"), option("b", { walkMinutes: 15 })];
  assert.deepEqual(sortOptions(partial, "leastWalking").map(optionKey), ["b", "a"]);
});

test("options with no value for the measure keep their order and go last", () => {
  const options = [
    option("a", { professorRating: null, earliestStart: null, campusDays: [] }),
    option("b", { professorRating: null, earliestStart: null, campusDays: [] }),
    option("c", { professorRating: 2.5, earliestStart: "9:00am", campusDays: ["Mon"] }),
  ];
  assert.deepEqual(sortOptions(options, "highestRating").map(optionKey), ["c", "a", "b"]);
  assert.deepEqual(sortOptions(options, "latestStart").map(optionKey), ["c", "a", "b"]);
  assert.deepEqual(sortOptions(options, "fewestDays").map(optionKey), ["c", "a", "b"]);
  assert.equal(sortOptions([], "fewestDays").length, 0);
});

test("option key identifies a schedule by its sections", () => {
  assert.equal(optionKey({ selectedSections: [{ section_id: "CMSC131-0101" }, { section_id: "MATH140-0111" }] }), "CMSC131-0101|MATH140-0111");
});
