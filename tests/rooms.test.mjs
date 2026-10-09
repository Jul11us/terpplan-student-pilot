import assert from "node:assert/strict";
import test from "node:test";
import { buildingsAt, clockLabel, dayIndexes, distanceMeters, easternClock, minutes, roomStatus, termDay, usableRooms, walkMinutesFrom } from "../lib/rooms.ts";

const buildings = { CSI: { lat: 38.9899, lng: -76.9362 }, EGR: { lat: 38.9890, lng: -76.9378 }, TYD: { lat: 38.9852, lng: -76.9441 } };
const data = { builtAt: "2026-10-08", term: "202608", calendar: null, rooms: [
  // CSI 1115: Mon/Wed 10:00-10:50 and 14:00-15:15.
  { b: "CSI", r: "1115", s: 120, t: [[0, 600, 650], [0, 840, 915], [2, 600, 650]] },
  { b: "CSI", r: "2117", s: 40, t: [[0, 660, 710], [1, 540, 615], [3, 540, 615]] },
  { b: "CSI", r: "3120", s: 30, t: [[4, 600, 650]] },
  { b: "EGR", r: "1202", s: 60, t: [[0, 540, 590], [2, 540, 590], [4, 540, 590]] },
  { b: "TYD", r: "0130", s: 8, t: [[0, 600, 650], [2, 600, 650], [4, 600, 650]] },
  { b: "XYZ", r: "0100", s: 50, t: [[0, 600, 650], [2, 600, 650], [4, 600, 650]] },
] };

test("the build script reads Testudo's days and times", () => {
  assert.deepEqual(dayIndexes("MWF"), [0, 2, 4]);
  assert.deepEqual(dayIndexes("TuTh"), [1, 3]);
  assert.deepEqual(dayIndexes("SaSu"), [5, 6]);
  assert.deepEqual(dayIndexes("TBA"), []);
  assert.equal(minutes("9:30am"), 570);
  assert.equal(minutes("12:00pm"), 720);
  assert.equal(minutes("12:15am"), 15);
  assert.equal(minutes("1:45pm"), 825);
  assert.equal(minutes("TBA"), null);
});

test("only rooms in mapped buildings and big enough to study in are listed; rarely booked rooms are marked", () => {
  const rooms = usableRooms(data, buildings);
  assert.deepEqual(rooms.map((room) => `${room.building} ${room.room}`), ["CSI 1115", "CSI 2117", "CSI 3120", "EGR 1202"]);
  assert.equal(rooms.find((room) => room.room === "3120").rare, true);
  assert.equal(rooms.find((room) => room.room === "1115").rare, false);
});

test("a room is free until its next class that day, or busy until the current one ends", () => {
  const [room] = usableRooms(data, buildings);
  assert.deepEqual([roomStatus(room, 0, 620).free, roomStatus(room, 0, 620).busyUntil], [false, 650]);
  assert.deepEqual([roomStatus(room, 0, 650).free, roomStatus(room, 0, 650).until], [true, 840], "free the minute a class ends");
  assert.deepEqual([roomStatus(room, 0, 915).free, roomStatus(room, 0, 915).until], [true, null], "no more classes today");
  assert.equal(roomStatus(room, 1, 620).until, null, "no class at all on Tuesday");
});

test("buildings list rooms free long enough, longest first; nearest building first when the position is known", () => {
  const rooms = usableRooms(data, buildings);
  const monday11 = buildingsAt(rooms, 0, 660, { buildings });
  // CSI 2117 is in class (11:00-11:50); 1115 is free until 2pm; 3120 has no class Monday but is rarely used.
  assert.deepEqual(monday11.map((entry) => [entry.code, entry.free.map((status) => status.room.room), entry.busy]), [["CSI", ["1115", "3120"], 1], ["EGR", ["1202"], 0]]);
  const strict = buildingsAt(rooms, 0, 800, { buildings, minFree: 60 });
  assert.ok(!strict.find((entry) => entry.code === "CSI").free.some((status) => status.room.room === "1115"), "free only 40 minutes until 2pm");
  const nearTyd = buildingsAt(rooms, 0, 660, { buildings, position: buildings.TYD });
  assert.deepEqual(nearTyd.map((entry) => entry.code), ["EGR", "CSI"]);
  assert.ok(nearTyd[0].distance < nearTyd[1].distance);
});

test("Eastern time, the term calendar and labels", () => {
  assert.deepEqual(easternClock(new Date("2026-10-08T18:30:00Z")), { date: "2026-10-08", day: 3, minute: 14 * 60 + 30 });
  assert.deepEqual(easternClock(new Date("2026-10-09T03:10:00Z")), { date: "2026-10-08", day: 3, minute: 23 * 60 + 10 }, "late evening is still the same day in Maryland");
  const calendar = { firstDay: "2026-08-31", lastDay: "2026-12-11", noClasses: [["2026-11-25", "2026-11-29"]] };
  assert.equal(termDay(calendar, "2026-10-08"), "classes");
  assert.equal(termDay(calendar, "2026-11-26"), "noClasses");
  assert.equal(termDay(calendar, "2026-12-20"), "afterTerm");
  assert.equal(termDay(null, "2026-10-08"), "unknown");
  assert.equal(clockLabel(840, "en"), "2:00pm");
  assert.equal(clockLabel(720, "en"), "12:00pm");
  assert.equal(clockLabel(570, "zh"), "9:30");
  assert.ok(Math.abs(distanceMeters(buildings.CSI, buildings.EGR) - 165) < 20);
  assert.equal(walkMinutesFrom(400), 7);
});

test("the home page count: rooms free for 30 minutes or more, only on class weekdays, 8am to 8pm", async () => {
  const { roomsNow } = await import("../lib/rooms.ts");
  const calendar = { firstDay: "2026-08-31", lastDay: "2026-12-11", noClasses: [["2026-11-25", "2026-11-29"]] };
  const rooms = usableRooms(data, buildings);
  // Monday Oct 12 is Fall Break in the real calendar but not in this one: 11:00am Eastern.
  assert.deepEqual(roomsNow(rooms, calendar, buildings, new Date("2026-10-12T15:00:00Z")), { show: true, rooms: 3, buildings: 2 });
  assert.equal(roomsNow(rooms, calendar, buildings, new Date("2026-10-10T15:00:00Z")).show, false, "Saturday");
  assert.equal(roomsNow(rooms, calendar, buildings, new Date("2026-10-13T03:00:00Z")).show, false, "11pm");
  assert.equal(roomsNow(rooms, calendar, buildings, new Date("2026-10-13T01:00:00Z")).show, false, "9pm: nearly every room is free and many buildings are locked");
  assert.equal(roomsNow(rooms, calendar, buildings, new Date("2026-11-25T15:00:00Z")).show, false, "Thanksgiving break");
});
