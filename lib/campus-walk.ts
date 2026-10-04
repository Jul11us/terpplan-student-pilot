// Building positions for map links, and a rough walking-time check between back-to-back classes.
// The walk is estimated from straight-line distance (times 1.3 for paths that do not run straight, at
// 80 m a minute), so it is a hint, not a route: stairs, crowds and building entrances are not counted.

import buildings from "@/data/umd-buildings.json";
import { isAsyncOnline, meetingDays, meetingMinutes, type MeetingTime } from "@/lib/meeting-time";

// `map` is the Google Maps search for the building's name, checked to open that building (see scripts/build-buildings.mjs).
export type Building = { name: string; lat: number; lng: number; map: string };

const BUILDINGS = buildings as Record<string, Building>;
const PATH_FACTOR = 1.3;
const METERS_PER_MINUTE = 80;

export function buildingFor(code: string | null | undefined): (Building & { code: string }) | null {
  const key = code?.trim().toUpperCase() ?? "";
  const building = key ? BUILDINGS[key] : undefined;
  return building ? { ...building, code: key } : null;
}

// Searches by name so Google shows the building's place card, not a bare coordinate.
export function mapsUrl(building: Building) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(building.map)}`;
}

function meters(a: Building, b: Building) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export function walkMinutes(from: Building, to: Building) {
  return Math.max(1, Math.ceil(meters(from, to) * PATH_FACTOR / METERS_PER_MINUTE));
}

// Named parts of campus, each as the point students would call its middle. A building belongs to the
// area whose middle it is closest to, so the grouping follows the map instead of a hand-drawn list that
// would have to be revisited every time a building is added to data/umd-buildings.json.
// Each middle is the rough centre of that cluster of buildings rather than one landmark inside it, which
// is what keeps the boundaries where the map puts them: Tydings reads as the mall, Atlantic as the science
// buildings next to it, Knight Hall as south campus near Education.
export const CAMPUS_AREAS = {
  engineering: { lat: 38.99000, lng: -76.93900 },  // Engineering and the science buildings, east of the mall
  north: { lat: 38.99250, lng: -76.94650 },        // North campus: the hill, dining and the recreation centre
  mall: { lat: 38.98580, lng: -76.94350 },         // McKeldin Mall and the libraries
  south: { lat: 38.98380, lng: -76.94480 },        // South campus: South Hill, business and architecture
  west: { lat: 38.98700, lng: -76.95420 },         // The west edge along Adelphi Road (UMUC, the golf course)
} as const;

export type CampusArea = keyof typeof CAMPUS_AREAS;

export const CAMPUS_AREA_KEYS = Object.keys(CAMPUS_AREAS) as CampusArea[];

// Anything more than this from every area's middle is somewhere else entirely (the FDA building in
// Beltsville, for one), and calling it part of a campus area would make an area filter lie.
const AREA_RADIUS_METERS = 900;

export function areaFor(code: string | null | undefined): CampusArea | null {
  const building = buildingFor(code);
  if (!building) return null;
  let best: { area: CampusArea; distance: number } | null = null;
  for (const area of CAMPUS_AREA_KEYS) {
    const distance = meters(building, { ...CAMPUS_AREAS[area], name: area, map: area });
    if (!best || distance < best.distance) best = { area, distance };
  }
  return best && best.distance <= AREA_RADIUS_METERS ? best.area : null;
}

type WalkSection = { course_id: string; section_id: string; meetings?: MeetingTime[] | null };

// The areas a schedule meets in, in the order the areas are listed above. Online and TBA meetings have
// no place on campus, so they add nothing.
export function sectionAreas(sections: WalkSection[]): CampusArea[] {
  const found = new Set<CampusArea>();
  for (const section of sections) {
    for (const meeting of section.meetings ?? []) {
      if (isAsyncOnline(meeting)) continue;
      const area = areaFor(meeting.building);
      if (area) found.add(area);
    }
  }
  return CAMPUS_AREA_KEYS.filter((area) => found.has(area));
}

export type TightWalk = {
  day: string;
  from: { sectionId: string; building: string; end: number };
  to: { sectionId: string; building: string; start: number };
  gapMinutes: number;
  walkMinutes: number;
};

type PlacedMeeting = { sectionId: string; building: Building & { code: string }; start: number; end: number };

// Each day's classes in time order, keeping only meetings with both a known time and a known building,
// which are the only ones a walk can be measured between.
function placedByDay(sections: WalkSection[]) {
  const byDay = new Map<string, PlacedMeeting[]>();
  for (const section of sections) {
    for (const meeting of section.meetings ?? []) {
      if (isAsyncOnline(meeting)) continue;
      const start = meetingMinutes(meeting.start_time), end = meetingMinutes(meeting.end_time);
      const building = buildingFor(meeting.building);
      if (start === null || end === null || end <= start || !building) continue;
      for (const day of meetingDays(meeting.days)) {
        const list = byDay.get(day) ?? [];
        list.push({ sectionId: section.section_id, building, start, end });
        byDay.set(day, list);
      }
    }
  }
  for (const list of byDay.values()) list.sort((a, b) => a.start - b.start || a.end - b.end);
  return byDay;
}

// Estimated minutes spent walking between classes over a week: every move from one building to the next,
// counted once for each day it happens. Walks within one building are zero, and a day with one class has
// no walk at all. This measures the whole week's legwork, where tightWalks only finds the rushed moves.
export function weeklyWalkMinutes(sections: WalkSection[]) {
  let total = 0;
  for (const list of placedByDay(sections).values()) {
    for (let index = 1; index < list.length; index += 1) {
      const from = list[index - 1], to = list[index];
      if (from.building.code === to.building.code) continue;
      total += walkMinutes(from.building, to.building);
    }
  }
  return total;
}

// Minutes a week spent walking beyond a comfortable walk: for every move between buildings longer than
// `allowance` minutes, the minutes past it, counted on each day the move happens. Free time between classes
// is not counted; only how far apart the buildings are.
export function longWalkMinutes(sections: WalkSection[], allowance = 10) {
  let total = 0;
  for (const list of placedByDay(sections).values()) {
    for (let index = 1; index < list.length; index += 1) {
      const from = list[index - 1], to = list[index];
      if (from.building.code === to.building.code) continue;
      total += Math.max(0, walkMinutes(from.building, to.building) - allowance);
    }
  }
  return total;
}

// Consecutive classes on the same day whose gap is shorter than the estimated walk between their buildings.
// Meetings without a known time or building (TBA, online) are skipped rather than guessed.
export function tightWalks(sections: WalkSection[]): TightWalk[] {
  const byDay = placedByDay(sections);
  const result: TightWalk[] = [];
  for (const [day, list] of byDay) {
    for (let index = 1; index < list.length; index += 1) {
      const from = list[index - 1], to = list[index];
      const gap = to.start - from.end;
      if (gap < 0 || from.building.code === to.building.code) continue;
      const walk = walkMinutes(from.building, to.building);
      if (walk > gap) result.push({ day, from: { sectionId: from.sectionId, building: from.building.code, end: from.end }, to: { sectionId: to.sectionId, building: to.building.code, start: to.start }, gapMinutes: gap, walkMinutes: walk });
    }
  }
  return result;
}
