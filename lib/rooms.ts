// The empty-room finder (/rooms): which classrooms have no class scheduled at a given time, and until when.
// The data is this term's Testudo class meetings per room (data/rooms.json, scripts/build-rooms.mjs). "No class"
// is all it can say: rooms are also used for exams and events, and many are locked outside class hours.

import type { TermCalendar } from "@/lib/term-calendar";

export type RoomData = { builtAt: string; term: string; calendar: TermCalendar | null; rooms: Array<{ b: string; r: string; s: number; t: number[][] }> };
export type Room = { building: string; room: string; size: number; slots: Array<[day: number, start: number, end: number]>; rare: boolean };
export type Position = { lat: number; lng: number };

// Rooms with a class at most twice a week are often labs, studios or department rooms that stay locked.
const RARE_SLOTS = 2;
// Smaller rooms are offices and research spaces rather than places to study.
const MIN_SIZE = 10;

// The rooms worth listing: in a building on the College Park map, and big enough to be a classroom.
export function usableRooms(data: RoomData, buildings: Record<string, Position>): Room[] {
  return data.rooms
    .filter((room) => buildings[room.b] && room.s >= MIN_SIZE)
    .map((room) => ({ building: room.b, room: room.r, size: room.s, slots: room.t.map(([day, start, end]) => [day!, start!, end!] as [number, number, number]), rare: room.t.length <= RARE_SLOTS }));
}

// Testudo's meeting days: "MWF" -> [0, 2, 4]; "TuTh" -> [1, 3]; anything else -> [].
const TESTUDO_DAYS = ["M", "Tu", "W", "Th", "F", "Sa", "Su"];
export function dayIndexes(days: string | null | undefined) {
  const found: number[] = [];
  let rest = days ?? "";
  while (rest) {
    const index = TESTUDO_DAYS.findIndex((day) => rest.startsWith(day));
    if (index < 0) return [];
    found.push(index); rest = rest.slice(TESTUDO_DAYS[index]!.length);
  }
  return found;
}

// Testudo's times: "9:30am" -> 570 (minutes after midnight), or null.
export function minutes(time: string | null | undefined) {
  const match = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec((time ?? "").trim());
  if (!match) return null;
  return (Number(match[1]) % 12 + (match[3]!.toLowerCase() === "pm" ? 12 : 0)) * 60 + Number(match[2]);
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// The date, weekday (0 = Monday) and minute of the day at UMD (Eastern time).
export function easternClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(now).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, day: DAY_NAMES.indexOf(parts.weekday!), minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

// Whether classes meet on a date: during the term, outside it, or on a break or holiday.
export function termDay(calendar: TermCalendar | null, date: string): "classes" | "noClasses" | "beforeTerm" | "afterTerm" | "unknown" {
  if (!calendar) return "unknown";
  if (date < calendar.firstDay) return "beforeTerm";
  if (date > calendar.lastDay) return "afterTerm";
  return calendar.noClasses.some(([start, end]) => date >= start && date <= end) ? "noClasses" : "classes";
}

export type RoomStatus = { room: Room; free: boolean; until: number | null; busyUntil: number | null };

// A room at one moment: free (and until when its next class starts that day, null if none) or in a class
// (and when that class ends).
export function roomStatus(room: Room, day: number, minute: number): RoomStatus {
  const today = room.slots.filter(([slotDay]) => slotDay === day);
  const current = today.filter(([, start, end]) => start <= minute && minute < end);
  if (current.length) return { room, free: false, until: null, busyUntil: Math.max(...current.map(([, , end]) => end)) };
  const next = today.filter(([, start]) => start > minute).map(([, start]) => start);
  return { room, free: true, until: next.length ? Math.min(...next) : null, busyUntil: null };
}

export type BuildingRooms = { code: string; free: RoomStatus[]; busy: number; distance: number | null };

// Rooms by building at one moment, keeping rooms free for at least `minFree` minutes (a room with no more
// classes that day always counts). Rooms: longest free first, then bigger. Buildings: nearest first when the
// student's position is known, otherwise the most free rooms first.
export function buildingsAt(rooms: Room[], day: number, minute: number, options: { minFree?: number; position?: Position | null; buildings: Record<string, Position> }): BuildingRooms[] {
  const byBuilding = new Map<string, BuildingRooms>();
  for (const room of rooms) {
    const entry = byBuilding.get(room.building) ?? { code: room.building, free: [], busy: 0, distance: options.position ? distanceMeters(options.position, options.buildings[room.building]!) : null };
    const status = roomStatus(room, day, minute);
    if (!status.free) entry.busy += 1;
    else if (status.until === null || status.until - minute >= (options.minFree ?? 0)) entry.free.push(status);
    byBuilding.set(room.building, entry);
  }
  const freeFor = (status: RoomStatus) => status.until === null ? Infinity : status.until - minute;
  const list = [...byBuilding.values()].filter((entry) => entry.free.length);
  for (const entry of list) entry.free.sort((a, b) => Number(a.room.rare) - Number(b.room.rare) || freeFor(b) - freeFor(a) || b.room.size - a.room.size || a.room.room.localeCompare(b.room.room, "en", { numeric: true }));
  return list.sort((a, b) => (a.distance !== null && b.distance !== null ? a.distance - b.distance : 0) || b.free.length - a.free.length || a.code.localeCompare(b.code));
}

// Straight-line distance in meters.
export function distanceMeters(a: Position, b: Position) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.lat - a.lat), dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

// A walk, as the planner estimates them: straight line times 1.3 at 80 m a minute.
export function walkMinutesFrom(meters: number) {
  return Math.max(1, Math.round((meters * 1.3) / 80));
}

// 840 -> "2:00pm" (English) or "14:00" (Chinese).
export function clockLabel(minute: number, language: "en" | "zh") {
  const hour = Math.floor(minute / 60) % 24, rest = String(minute % 60).padStart(2, "0");
  if (language === "zh") return `${hour}:${rest}`;
  return `${(hour + 11) % 12 + 1}:${rest}${hour < 12 ? "am" : "pm"}`;
}

// "How many rooms have no class right now" for the home page, counted the way /rooms counts by default (free
// for 30 minutes or more). Only during class weeks, on weekdays, 8am-8pm: later almost every room is free
// and many buildings are locked, so the number would mislead (`show` is false).
export function roomsNow(rooms: Room[], calendar: TermCalendar | null, buildings: Record<string, Position>, now = new Date()) {
  const clock = easternClock(now);
  const list = buildingsAt(rooms, clock.day, clock.minute, { minFree: 30, buildings });
  const show = termDay(calendar, clock.date) === "classes" && clock.day <= 4 && clock.minute >= 8 * 60 && clock.minute < 20 * 60;
  return { show, rooms: list.reduce((sum, entry) => sum + entry.free.length, 0), buildings: list.length };
}
