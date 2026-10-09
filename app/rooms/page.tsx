import data from "@/data/rooms.json";
import buildings from "@/data/umd-buildings.json";
import { usableRooms, type RoomData } from "@/lib/rooms";
import { RoomsFinder } from "@/app/components/rooms-finder";
import type { Building } from "@/lib/campus-walk";

// Filtered on the server so the page ships only rooms it can show, with the buildings they are in.
const BUILDINGS = buildings as Record<string, Building>;
const rooms = usableRooms(data as RoomData, BUILDINGS);
const used = Object.fromEntries([...new Set(rooms.map((room) => room.building))].map((code) => [code, BUILDINGS[code]!]));

export default function RoomsPage() {
  return <RoomsFinder rooms={rooms} buildings={used} term={(data as RoomData).term} calendar={(data as RoomData).calendar} builtAt={(data as RoomData).builtAt} />;
}
