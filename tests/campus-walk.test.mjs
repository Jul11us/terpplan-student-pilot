import assert from "node:assert/strict";
import test from "node:test";
import { buildingFor, mapsUrl, tightWalks, walkMinutes } from "../lib/campus-walk.ts";

const section = (id, building, days, start, end) => ({
  course_id: id.split("-")[0],
  section_id: id,
  meetings: [{ days, start_time: start, end_time: end, building, room: "0100" }],
});

test("finds buildings by Testudo code, including ones umd.io lists without a code", () => {
  assert.equal(buildingFor("irb")?.name, "Brendan Iribe Center");
  assert.equal(buildingFor("ATL")?.name, "Atlantic Building");
  assert.equal(buildingFor("TBA"), null);
  assert.equal(buildingFor(null), null);
  const tydings = buildingFor("TYD");
  assert.ok(tydings);
  assert.equal(mapsUrl(tydings), "https://www.google.com/maps/search/?api=1&query=Tydings%20Hall%2C%20College%20Park%2C%20MD");
  assert.match(mapsUrl(buildingFor("KEY")), /query=Francis%20Scott%20Key%20Hall%20University%20of%20Maryland$/);
});

test("estimates a cross-campus walk longer than a walk next door", () => {
  const across = walkMinutes(buildingFor("IRB"), buildingFor("TYD"));
  const nextDoor = walkMinutes(buildingFor("IRB"), buildingFor("CSI"));
  assert.ok(across >= 11 && across <= 18, `IRB to TYD: ${across} min`);
  assert.ok(nextDoor <= 4, `IRB to CSI: ${nextDoor} min`);
});

test("flags a 10-minute gap across campus on every shared day", () => {
  const walks = tightWalks([
    section("CMSC131-0101", "IRB", "MWF", "10:00am", "10:50am"),
    section("ENGL101-0201", "TYD", "MWF", "11:00am", "11:50am"),
  ]);
  assert.deepEqual(walks.map((walk) => walk.day), ["Mon", "Wed", "Fri"]);
  assert.equal(walks[0].gapMinutes, 10);
  assert.equal(walks[0].from.building, "IRB");
  assert.equal(walks[0].to.sectionId, "ENGL101-0201");
  assert.ok(walks[0].walkMinutes > 10);
});

test("does not flag nearby buildings, long gaps, the same building, or unknown places", () => {
  assert.deepEqual(tightWalks([
    section("CMSC131-0101", "IRB", "MWF", "10:00am", "10:50am"),
    section("CMSC132-0101", "CSI", "MWF", "11:00am", "11:50am"),
  ]), []);
  assert.deepEqual(tightWalks([
    section("CMSC131-0101", "IRB", "TuTh", "9:30am", "10:45am"),
    section("ENGL101-0201", "TYD", "TuTh", "11:30am", "12:45pm"),
  ]), []);
  assert.deepEqual(tightWalks([
    section("ENGL101-0201", "TYD", "MW", "10:00am", "10:50am"),
    section("HIST200-0101", "TYD", "MW", "11:00am", "11:50am"),
  ]), []);
  assert.deepEqual(tightWalks([
    section("CMSC131-0101", "IRB", "MWF", "10:00am", "10:50am"),
    section("ENGL101-0201", "TBA", "MWF", "11:00am", "11:50am"),
    { course_id: "UNIV100", section_id: "UNIV100-0101", meetings: [{ days: null, start_time: null, end_time: null, building: "ONLINE", room: null }] },
  ]), []);
});
