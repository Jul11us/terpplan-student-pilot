// "Between classes, sit here": the gaps in a student's day (from My week) and the empty rooms that fit them.
// A room fits a gap when it has nothing booked from the moment the student can walk there from the class
// that just ended until they must leave for the next one. Rooms are ranked by the total walk (there and on
// to the next class), general-purpose classrooms before department rooms; rarely used rooms (often locked)
// are left out. Only used when My week and the room data are for the same term (see roomsForWeekTerm).

import { distanceMeters, walkMinutesFrom, type Bookings, type Position, type Room } from "@/lib/rooms";

export type DayClass = { courseId: string; start: number; end: number; building: string | null };
export type Gap = { start: number; end: number; from: DayClass; to: DayClass };
export type GapRoom = { room: Room; walkIn: number; walkOut: number; arrive: number; leave: number; sit: number };

// A gap is worth suggesting a room for when it is at least this long.
export const MIN_GAP = 30;
// ...and the student would get at least this long in the room after walking both ways.
export const MIN_SIT = 20;
// A department room counts as this many minutes' more walking than a general-purpose classroom.
const DEPARTMENT_PENALTY = 5;
const MAX_PER_BUILDING = 2;

// The gaps of MIN_GAP minutes or more between one day's classes (overlapping classes leave no gap).
export function dayGaps(classes: DayClass[], minMinutes = MIN_GAP): Gap[] {
  const sorted = [...classes].sort((a, b) => a.start - b.start || a.end - b.end);
  const gaps: Gap[] = [];
  let latest = sorted[0];
  for (const next of sorted.slice(1)) {
    if (!latest) break;
    if (next.start - latest.end >= minMinutes) gaps.push({ start: latest.end, end: next.start, from: latest, to: next });
    if (next.end > latest.end) latest = next;
  }
  return gaps;
}

function booked(room: Room, day: number, bookings: Bookings | null | undefined) {
  const live = room.liveId !== null ? bookings?.get(room.liveId) : undefined;
  return live ?? room.slots.filter(([slotDay]) => slotDay === day).map(([, start, end]) => [start, end] as [number, number]);
}

// The best rooms for one gap on a weekday (0 = Monday), using that day's 25Live bookings when given.
export function roomsForGap(rooms: Room[], gap: Gap, day: number, positions: Record<string, Position>, bookings?: Bookings | null, limit = 3): GapRoom[] {
  const from = gap.from.building ? positions[gap.from.building.toUpperCase()] : undefined;
  const to = gap.to.building ? positions[gap.to.building.toUpperCase()] : undefined;
  if (!from && !to) return [];
  const suggestions: Array<GapRoom & { score: number }> = [];
  for (const room of rooms) {
    if (room.rare) continue;
    const here = positions[room.building];
    if (!here) continue;
    // With one end unknown, only the known walk counts.
    const walkIn = from ? walkMinutesFrom(distanceMeters(from, here)) : 0;
    const walkOut = to ? walkMinutesFrom(distanceMeters(here, to)) : 0;
    const arrive = gap.start + walkIn, leave = gap.end - walkOut, sit = leave - arrive;
    if (sit < MIN_SIT) continue;
    if (booked(room, day, bookings).some(([start, end]) => start < leave && arrive < end)) continue;
    suggestions.push({ room, walkIn, walkOut, arrive, leave, sit, score: walkIn + walkOut + (room.liveId === null ? DEPARTMENT_PENALTY : 0) });
  }
  // At most two rooms from one building, so a nearby second building is offered too.
  const perBuilding = new Map<string, number>();
  return suggestions
    .sort((a, b) => a.score - b.score || b.sit - a.sit || b.room.size - a.room.size || a.room.room.localeCompare(b.room.room, "en", { numeric: true }))
    .filter((item) => {
      const count = perBuilding.get(item.room.building) ?? 0;
      perBuilding.set(item.room.building, count + 1);
      return count < MAX_PER_BUILDING;
    })
    .slice(0, limit)
    .map(({ room, walkIn, walkOut, arrive, leave, sit }) => ({ room, walkIn, walkOut, arrive, leave, sit }));
}

// My week and the room data must describe the same term; otherwise there is nothing to suggest.
export function roomsForWeekTerm(weekTerm: string | null | undefined, roomTerm: string) {
  return Boolean(weekTerm) && weekTerm === roomTerm;
}
