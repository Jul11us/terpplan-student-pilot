import assert from "node:assert/strict";
import test from "node:test";
import { areaFor, buildingFor, CAMPUS_AREA_KEYS, mapsUrl, sectionAreas, tightWalks, walkMinutes, weeklyWalkMinutes } from "../lib/campus-walk.ts";

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

test("buildings fall into the part of campus the map puts them in", () => {
  assert.equal(areaFor("IRB"), "engineering");
  assert.equal(areaFor("KEB"), "engineering");
  assert.equal(areaFor("MTH"), "engineering");
  assert.equal(areaFor("TYD"), "mall");
  assert.equal(areaFor("MCK"), "mall");
  assert.equal(areaFor("ESJ"), "mall");
  assert.equal(areaFor("VMH"), "south");
  assert.equal(areaFor("ARC"), "south");
  assert.equal(areaFor("SPH"), "north");
  assert.equal(areaFor("ICC"), "west");
  // Nothing on campus, or far enough off it that no area would be honest.
  assert.equal(areaFor("FDA"), null);
  assert.equal(areaFor("TBA"), null);
  assert.equal(areaFor(null), null);
  assert.ok(CAMPUS_AREA_KEYS.every((area) => typeof area === "string"));
});

test("a schedule's areas are listed once each, and online or unplaced meetings add none", () => {
  assert.deepEqual(sectionAreas([
    section("CMSC131-0101", "IRB", "MWF", "10:00am", "10:50am"),
    section("CMSC132-0101", "CSI", "TuTh", "9:30am", "10:45am"),
    section("ENGL101-0201", "TYD", "MWF", "1:00pm", "1:50pm"),
  ]), ["engineering", "mall"]);
  assert.deepEqual(sectionAreas([
    section("ENGL101-0201", "TBA", "MWF", "11:00am", "11:50am"),
    { course_id: "UNIV100", section_id: "UNIV100-0101", meetings: [{ days: null, start_time: null, end_time: null, building: "ONLINE", room: null }] },
  ]), []);
  assert.deepEqual(sectionAreas([]), []);
});

test("weekly walking counts every building change, once for each day it happens", () => {
  const acrossCampus = weeklyWalkMinutes([
    section("CMSC131-0101", "IRB", "MWF", "10:00am", "10:50am"),
    section("ENGL101-0201", "TYD", "MWF", "11:00am", "11:50am"),
  ]);
  const oneDay = weeklyWalkMinutes([
    section("CMSC131-0101", "IRB", "Mon", "10:00am", "10:50am"),
    section("ENGL101-0201", "TYD", "Mon", "11:00am", "11:50am"),
  ]);
  assert.equal(acrossCampus, oneDay * 3, `${acrossCampus} vs ${oneDay}`);
  // Same building, one class a day, and online or TBA meetings are all no walking at all.
  assert.equal(weeklyWalkMinutes([
    section("ENGL101-0201", "TYD", "MW", "10:00am", "10:50am"),
    section("HIST200-0101", "TYD", "MW", "11:00am", "11:50am"),
  ]), 0);
  assert.equal(weeklyWalkMinutes([section("CMSC131-0101", "IRB", "MWF", "10:00am", "10:50am")]), 0);
  assert.equal(weeklyWalkMinutes([
    section("ENGL101-0201", "TBA", "MWF", "11:00am", "11:50am"),
    { course_id: "UNIV100", section_id: "UNIV100-0101", meetings: [{ days: null, start_time: null, end_time: null, building: "ONLINE", room: null }] },
  ]), 0);
  // A gap long enough not to be a tight walk is still walking time that the week costs.
  const relaxed = weeklyWalkMinutes([
    section("CMSC131-0101", "IRB", "TuTh", "9:30am", "10:45am"),
    section("ENGL101-0201", "TYD", "TuTh", "11:30am", "12:45pm"),
  ]);
  assert.ok(relaxed > 0 && tightWalks([
    section("CMSC131-0101", "IRB", "TuTh", "9:30am", "10:45am"),
    section("ENGL101-0201", "TYD", "TuTh", "11:30am", "12:45pm"),
  ]).length === 0, `relaxed walk: ${relaxed}`);
});

test("only the part of a walk past 10 minutes counts, once for each day it happens", async () => {
  const { longWalkMinutes } = await import("../lib/campus-walk.ts");
  const meet = (days, start, end, building) => ({ days, start_time: start, end_time: end, building, room: "1" });
  const far = walkMinutes(buildingFor("IRB"), buildingFor("VMH"));
  const week = [
    { course_id: "A", section_id: "A-1", meetings: [meet("MW", "9:00am", "9:50am", "IRB")] },
    { course_id: "B", section_id: "B-1", meetings: [meet("MW", "11:00am", "11:50am", "VMH")] },
  ];
  assert.equal(longWalkMinutes(week), 2 * Math.max(0, far - 10));
  assert.equal(longWalkMinutes(week, 60), 0);
  // A long break between classes in the same building costs nothing.
  assert.equal(longWalkMinutes([week[0], { course_id: "C", section_id: "C-1", meetings: [meet("MW", "3:00pm", "3:50pm", "IRB")] }]), 0);
});
