import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { registerHooks } from "node:module";
import { testDatabase } from "./helpers/d1-sqlite.mjs";

globalThis.__bookingEnv = {};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export const env = globalThis.__bookingEnv;", shortCircuit: true };
  return next(specifier, context);
} });
const { bookingsByDay, bookingsFor, nextDate, syncRoomBookings, ROOMS_PER_REQUEST } = await import("../lib/room-bookings.ts");
const { GET: bookingsApi } = await import("../app/api/rooms/bookings/route.ts");
const { roomStatus } = await import("../lib/rooms.ts");

let database;
beforeEach(() => { database = testDatabase(); globalThis.__bookingEnv.DB = database; });
afterEach(() => { database.sqlite.close(); delete globalThis.__bookingEnv.DB; });

const reservation = (id, start, end) => ({ reservation_start_dt: start, reservation_end_dt: end, spaces: { space_id: id }, event: { event_title: "Private event name" } });
// 9:00am Eastern on Wednesday Oct 14.
const now = new Date("2026-10-14T13:00:00Z");

test("25Live reservations become each room's booked times per day, merged where they overlap", () => {
  const byDay = bookingsByDay([
    reservation(1, "2026-10-14T10:00:00-04:00", "2026-10-14T10:50:00-04:00"),
    reservation(1, "2026-10-14T10:00:00-04:00", "2026-10-14T10:50:00-04:00"),
    reservation(1, "2026-10-14T10:30:00-04:00", "2026-10-14T11:15:00-04:00"),
    reservation(1, "2026-10-14T17:30:00-04:00", "2026-10-14T19:00:00-04:00"),
    reservation(2, "2026-10-15T22:00:00-04:00", "2026-10-16T01:00:00-04:00"),
    { reservation_start_dt: "bad", reservation_end_dt: "bad", spaces: { space_id: 3 } },
  ]);
  assert.deepEqual(byDay.get("2026-10-14").get(1), [[600, 675], [1050, 1140]]);
  assert.deepEqual(byDay.get("2026-10-15").get(2), [[1320, 1440]], "ends at midnight");
  assert.equal(byDay.get("2026-10-14").has(3), false);
  assert.equal(nextDate("2026-10-31"), "2026-11-01");
});

test("each run reads the 40 rooms read longest ago, for today and tomorrow, keeping only times", async () => {
  const ids = Array.from({ length: 50 }, (_, index) => 1000 + index);
  const urls = [];
  const fetcher = async (url) => {
    urls.push(String(url));
    const asked = new URL(url).searchParams.get("space_id").split(/[+ ]/).map(Number);
    return Response.json({ space_reservations: { space_reservation: asked.includes(1000) ? [reservation(1000, "2026-10-14T17:30:00-04:00", "2026-10-14T19:00:00-04:00")] : [] } });
  };
  assert.deepEqual(await syncRoomBookings(now, fetcher, ids), { synced: ROOMS_PER_REQUEST });
  const asked = new URL(urls[0]);
  assert.equal(asked.searchParams.get("start_dt"), "20261014");
  assert.equal(asked.searchParams.get("end_dt"), "20261015");
  assert.equal(asked.searchParams.get("space_id").split(/[+ ]/).length, 40);
  const row = database.sqlite.prepare("SELECT slots FROM room_booking_days WHERE space_id = 1000 AND day = '2026-10-14'").get();
  assert.equal(row.slots, "[[1050,1140]]");
  assert.ok(!JSON.stringify(database.sqlite.prepare("SELECT * FROM room_booking_days").all()).includes("Private"), "event names are never stored");
  assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS n FROM room_booking_days").get().n, 80, "both days for each room read");
  // The next run reads the 10 left; after that nothing is due for two hours.
  assert.deepEqual(await syncRoomBookings(new Date(now.getTime() + 120_000), fetcher, ids), { synced: 10 });
  assert.deepEqual(await syncRoomBookings(new Date(now.getTime() + 240_000), fetcher, ids), { synced: 0 });
  assert.equal(urls.length, 2);
  assert.equal((await syncRoomBookings(new Date(now.getTime() + 2 * 3_600_000 + 60_000), fetcher, ids)).synced, 40, "stale again after two hours");
});

test("a failed 25Live read changes nothing, and stale rows are not served", async () => {
  await assert.rejects(syncRoomBookings(now, async () => new Response("busy", { status: 503 }), [1, 2]));
  assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS n FROM room_booking_days").get().n, 0);
  await syncRoomBookings(now, async () => Response.json({ space_reservations: {} }), [1, 2]);
  assert.equal((await bookingsFor("2026-10-14", new Date(now.getTime() + 60_000))).bookings.size, 2);
  const late = await bookingsFor("2026-10-14", new Date(now.getTime() + 7 * 3_600_000));
  assert.equal(late.bookings.size, 0, "older than six hours: the page falls back to class times");
});

test("a room with today's bookings is judged by them; without, by its weekly classes", () => {
  const room = { building: "IRB", room: "0324", size: 300, rare: false, liveId: 3031, slots: [[2, 600, 650]] };
  const bookings = new Map([[3031, [[1050, 1140]]]]);
  // Wednesday 5:45pm: no class in Testudo, but an evening exam in 25Live.
  assert.deepEqual([roomStatus(room, 2, 1065).free, roomStatus(room, 2, 1065).source], [true, "schedule"]);
  assert.deepEqual([roomStatus(room, 2, 1065, bookings).free, roomStatus(room, 2, 1065, bookings).busyUntil, roomStatus(room, 2, 1065, bookings).source], [false, 1140, "live"]);
  // 10:15am: the class is not in today's bookings (cancelled), so the room is free until the exam.
  assert.deepEqual([roomStatus(room, 2, 615, bookings).free, roomStatus(room, 2, 615, bookings).until], [true, 1050]);
  const departmentRoom = { ...room, liveId: null };
  assert.equal(roomStatus(departmentRoom, 2, 615, bookings).source, "schedule");
});

test("the bookings API serves today or tomorrow only, as id -> times", async () => {
  assert.equal((await bookingsApi(new Request("https://terpplan.test/api/rooms/bookings?date=2020-01-01"))).status, 400);
  const body = await (await bookingsApi(new Request("https://terpplan.test/api/rooms/bookings"))).json();
  assert.deepEqual(Object.keys(body).sort(), ["date", "rooms", "syncedAt"]);
});
