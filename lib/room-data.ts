// data/rooms.json, typed (scripts/build-rooms.mjs writes it; JSON imports cannot express its tuples).
import data from "@/data/rooms.json";
import type { RoomData } from "@/lib/rooms";

export const ROOM_DATA = data as unknown as RoomData;
