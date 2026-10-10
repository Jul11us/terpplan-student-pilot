import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

globalThis.__gapEnv = {};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export const env = globalThis.__gapEnv;", shortCircuit: true };
  return next(specifier, context);
} });
const { dayGaps, roomsForGap, roomsForWeekTerm, MIN_SIT } = await import("../lib/study-gaps.ts");
const { GET: gapApi } = await import("../app/api/rooms/gap/route.ts");
const { ROOM_DATA } = await import("../lib/room-data.ts");

// IRB and CSI are next to each other; MTH is a few minutes away; TYD is across the mall.
const positions = { IRB: { lat: 38.98916, lng: -76.93641 }, CSI: { lat: 38.98987, lng: -76.93621 }, MTH: { lat: 38.98853, lng: -76.93914 }, TYD: { lat: 38.98515, lng: -76.94406 } };
const room = (building, number, extra = {}) => ({ building, room: number, size: 40, slots: [], rare: false, liveId: 100 + Number(number.slice(-2)), ...extra });
const cmsc = { courseId: "CMSC131", start: 600, end: 650, building: "IRB" };
const math = { courseId: "MATH141", start: 720, end: 770, building: "MTH" };
const engl = { courseId: "ENGL101", start: 840, end: 915, building: "TWS" };

test("a day's gaps of 30 minutes or more, in order, ignoring overlaps", () => {
  assert.deepEqual(dayGaps([engl, cmsc, math]).map((gap) => [gap.from.courseId, gap.to.courseId, gap.start, gap.end]), [["CMSC131", "MATH141", 650, 720], ["MATH141", "ENGL101", 770, 840]]);
  assert.deepEqual(dayGaps([cmsc, { ...math, start: 670 }]), [], "20 minutes is too short");
  assert.deepEqual(dayGaps([cmsc, { courseId: "LAB", start: 600, end: 680, building: "CSI" }, math]).map((gap) => [gap.from.courseId, gap.start]), [["LAB", 680]], "the later-ending overlapping class counts");
});

test("rooms that stay free for the whole gap, shortest walk first, general classrooms before department rooms", () => {
  const gap = dayGaps([cmsc, math])[0];
  const rooms = [
    room("TYD", "0101"),
    room("CSI", "2117"),
    room("IRB", "1207", { liveId: null }),
    room("IRB", "2107"),
    room("MTH", "0302"),
    room("IRB", "0318", { slots: [[2, 690, 740]] }),
    room("CSI", "1115", { rare: true, liveId: null }),
  ];
  const found = roomsForGap(rooms, gap, 2, positions, null, 5);
  const names = found.map((item) => `${item.room.building} ${item.room.room}`);
  assert.ok(!names.includes("IRB 0318"), "class at 11:30 on Wednesday");
  assert.ok(!names.includes("CSI 1115"), "rarely used rooms are left out");
  assert.ok(names.indexOf("IRB 2107") < names.indexOf("IRB 1207"), "a department room ranks after a general classroom with the same walk");
  assert.equal(names.at(-1), "TYD 0101", "far away ranks last");
  const irb = found.find((item) => item.room.room === "2107");
  assert.equal(irb.walkIn, 1);
  assert.equal(irb.arrive, 651);
  assert.equal(irb.sit, irb.leave - irb.arrive);
  assert.ok(found.every((item) => item.sit >= MIN_SIT));
});

test("today's 25Live bookings are used when given, and a gap with no known building has no suggestions", () => {
  const gap = dayGaps([cmsc, math])[0];
  const rooms = [room("IRB", "2107", { slots: [[2, 690, 740]] })];
  assert.equal(roomsForGap(rooms, gap, 2, positions).length, 0, "the weekly class is in the way");
  assert.equal(roomsForGap(rooms, gap, 2, positions, new Map([[107, []]])).length, 1, "but it is cancelled today");
  assert.equal(roomsForGap(rooms, gap, 2, positions, new Map([[107, [[660, 700]]]])).length, 0, "and an event is booked instead");
  assert.deepEqual(roomsForGap([room("IRB", "2107")], { ...gap, from: { ...cmsc, building: null }, to: { ...math, building: "ZZZ" } }, 2, positions), []);
  assert.equal(roomsForGap([room("IRB", "2107")], { ...gap, from: { ...cmsc, building: null } }, 2, positions)[0].walkIn, 0, "one known end is enough");
});

test("suggestions only for a week saved for the same term as the room data", async () => {
  assert.equal(roomsForWeekTerm("202701", "202608"), false);
  assert.equal(roomsForWeekTerm("202608", "202608"), true);
  assert.equal(roomsForWeekTerm(null, "202608"), false);
  const ask = (term) => gapApi(new Request(`https://terpplan.test/api/rooms/gap?term=${term}&day=2&start=650&end=720&from=IRB&to=MTH`));
  assert.deepEqual(await (await ask("209901")).json(), { active: false, rooms: [] });
  const body = await (await ask(ROOM_DATA.term)).json();
  assert.equal(body.active, true);
  assert.ok(body.rooms.length > 0 && body.rooms.length <= 3);
  assert.deepEqual(Object.keys(body.rooms[0]).sort(), ["building", "general", "live", "room", "sit", "size", "walkIn", "walkOut"]);
  assert.equal((await gapApi(new Request("https://terpplan.test/api/rooms/gap?term=202608&day=9&start=650&end=720"))).status, 400);
});

test("at most two suggestions from one building", () => {
  const gap = dayGaps([cmsc, math])[0];
  const rooms = ["2107", "2117", "2119", "2120"].map((number) => room("IRB", number)).concat(room("CSI", "2118"));
  const found = roomsForGap(rooms, gap, 2, positions);
  assert.deepEqual(found.map((item) => item.room.building), ["IRB", "IRB", "CSI"]);
});
