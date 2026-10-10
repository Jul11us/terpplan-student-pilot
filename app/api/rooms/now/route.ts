import { ROOM_DATA } from "@/lib/room-data";
import buildings from "@/data/umd-buildings.json";
import { easternClock, roomsNow, usableRooms, type Position } from "@/lib/rooms";
import { bookingsFor } from "@/lib/room-bookings";

// How many classrooms have nothing booked right now, for the home page (the full list is on /rooms): today's
// 25Live bookings where the background run has read them, the weekly class times elsewhere.
const BUILDINGS = buildings as Record<string, Position>;
const rooms = usableRooms(ROOM_DATA, BUILDINGS);

export async function GET() {
  const now = new Date();
  const { bookings } = await bookingsFor(easternClock(now).date, now).catch(() => ({ bookings: null }));
  return Response.json(roomsNow(rooms, ROOM_DATA.calendar, BUILDINGS, now, bookings), { headers: { "Cache-Control": "public, max-age=60" } });
}
