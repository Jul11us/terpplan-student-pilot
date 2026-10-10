import buildings from "@/data/umd-buildings.json";
import { ROOM_DATA } from "@/lib/room-data";
import { bookingsFor } from "@/lib/room-bookings";
import { easternClock, usableRooms, type Position } from "@/lib/rooms";
import { roomsForGap, roomsForWeekTerm } from "@/lib/study-gaps";

// Rooms to sit in during a gap between two classes, for My week (which stays light enough to open offline):
// ?term=&day=0-6&start=&end=&from=<building>&to=<building>. Today's 25Live bookings are used for today's day.
// { active: false } when the room data is for another term than the student's week.
const BUILDINGS = buildings as Record<string, Position>;
const rooms = usableRooms(ROOM_DATA, BUILDINGS);
const minuteOf = (value: string | null) => value !== null && /^\d{1,4}$/.test(value) && Number(value) <= 24 * 60 ? Number(value) : null;
const buildingOf = (value: string | null) => value && /^[A-Z0-9]{2,5}$/i.test(value) ? value.toUpperCase() : null;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const day = Number(params.get("day")), start = minuteOf(params.get("start")), end = minuteOf(params.get("end"));
  if (!Number.isInteger(day) || day < 0 || day > 6 || start === null || end === null || end <= start) return Response.json({ error: "Give day=0-6 and a start before the end, in minutes." }, { status: 400 });
  if (!roomsForWeekTerm(params.get("term"), ROOM_DATA.term)) return Response.json({ active: false, rooms: [] }, { headers: { "Cache-Control": "public, max-age=3600" } });
  const now = easternClock();
  const bookings = day === now.day ? (await bookingsFor(now.date).catch(() => null))?.bookings ?? null : null;
  const gap = { start, end, from: { courseId: "", start, end: start, building: buildingOf(params.get("from")) }, to: { courseId: "", start: end, end, building: buildingOf(params.get("to")) } };
  const found = roomsForGap(rooms, gap, day, BUILDINGS, bookings);
  return Response.json({
    active: true,
    rooms: found.map((item) => ({ building: item.room.building, room: item.room.room, size: item.room.size, general: item.room.liveId !== null, walkIn: item.walkIn, walkOut: item.walkOut, sit: item.sit, live: Boolean(bookings && item.room.liveId !== null && bookings.has(item.room.liveId)) })),
  }, { headers: { "Cache-Control": "public, max-age=120" } });
}
