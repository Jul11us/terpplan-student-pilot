import data from "@/data/rooms.json";
import buildings from "@/data/umd-buildings.json";
import { roomsNow, usableRooms, type Position, type RoomData } from "@/lib/rooms";

// How many classrooms have no class right now, for the home page (the full list is on /rooms).
const BUILDINGS = buildings as Record<string, Position>;
const rooms = usableRooms(data as RoomData, BUILDINGS);

export function GET() {
  return Response.json(roomsNow(rooms, (data as RoomData).calendar, BUILDINGS), { headers: { "Cache-Control": "public, max-age=60" } });
}
