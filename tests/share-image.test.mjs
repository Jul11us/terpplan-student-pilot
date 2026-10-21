import assert from "node:assert/strict";
import test from "node:test";
import { imageModel } from "../lib/share-image.ts";

const section = (course_id, meetings) => ({ course_id, section_id: `${course_id}-0101`, meetings });

test("a schedule picture covers Monday to Friday and at least six hours, one block per meeting day", () => {
  const model = imageModel([
    section("CMSC330", [{ days: "TuTh", start_time: "9:30am", end_time: "10:45am" }, { days: "F", start_time: "12:00pm", end_time: "12:50pm", classtype: "Discussion" }]),
    section("STAT400", [{ days: "MWF", start_time: "8:00am", end_time: "8:50am" }]),
  ]);
  assert.deepEqual(model.days, ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  assert.deepEqual([model.from, model.to], [8 * 60, 14 * 60], "from the 8am class, six hours at least");
  assert.equal(model.blocks.length, 6);
  assert.deepEqual(model.courses, ["CMSC330", "STAT400"]);
  assert.deepEqual(model.blocks.filter((block) => block.courseId === "STAT400").map((block) => block.color), [1, 1, 1]);
});

test("online or unannounced sections are listed apart; a weekend day appears only when used", () => {
  const model = imageModel([
    section("ARTH200", [{ days: null, start_time: null, end_time: null, building: "ONLINE", room: "ONLINE" }]),
    section("HIST200", [{ days: "TBA", start_time: null, end_time: null }]),
    section("BMGT110", [{ days: "Sa", start_time: "6:00pm", end_time: "8:30pm" }, { days: null, start_time: null, end_time: null, building: "ONLINE", room: "ONLINE" }]),
  ]);
  assert.deepEqual(model.unscheduled, ["ARTH200", "HIST200"], "BMGT110 has a time on the grid");
  assert.deepEqual(model.days, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  assert.deepEqual([model.from, model.to], [16 * 60, 22 * 60], "an evening class: earlier hours, not past 10pm");
});

test("personal commitments only when given, as unnamed busy blocks", () => {
  const sections = [section("CMSC330", [{ days: "TuTh", start_time: "9:30am", end_time: "10:45am" }])];
  assert.equal(imageModel(sections).blocks.length, 2);
  const busy = imageModel(sections, [{ id: "work", label: "Dining hall shift", days: ["Mon", "Sun"], start: "07:00", end: "09:00" }]);
  const blocks = busy.blocks.filter((block) => block.courseId === null);
  assert.deepEqual(blocks.map((block) => [block.day, block.start, block.end]), [["Mon", 420, 540], ["Sun", 420, 540]]);
  assert.ok(!JSON.stringify(busy).includes("Dining"), "the commitment's name never reaches the picture");
  assert.deepEqual([busy.days.at(-1), busy.from], ["Sun", 420]);
});
