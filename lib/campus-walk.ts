// Building positions for map links, and a rough walking-time check between back-to-back classes.
// The walk is estimated from straight-line distance (times 1.3 for paths that do not run straight, at
// 80 m a minute), so it is a hint, not a route: stairs, crowds and building entrances are not counted.

import buildings from "@/data/umd-buildings.json";
import { isAsyncOnline, meetingDays, meetingMinutes, type MeetingTime } from "@/lib/meeting-time";

export type Building = { name: string; lat: number; lng: number };

const BUILDINGS = buildings as Record<string, Building>;
const PATH_FACTOR = 1.3;
const METERS_PER_MINUTE = 80;

export function buildingFor(code: string | null | undefined): (Building & { code: string }) | null {
  const key = code?.trim().toUpperCase() ?? "";
  const building = key ? BUILDINGS[key] : undefined;
  return building ? { ...building, code: key } : null;
}

export function mapsUrl(building: Building) {
  return `https://www.google.com/maps/search/?api=1&query=${building.lat},${building.lng}`;
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

type WalkSection = { course_id: string; section_id: string; meetings?: MeetingTime[] | null };

export type TightWalk = {
  day: string;
  from: { sectionId: string; building: string; end: number };
  to: { sectionId: string; building: string; start: number };
  gapMinutes: number;
  walkMinutes: number;
};

// Consecutive classes on the same day whose gap is shorter than the estimated walk between their buildings.
// Meetings without a known time or building (TBA, online) are skipped rather than guessed.
export function tightWalks(sections: WalkSection[]): TightWalk[] {
  const byDay = new Map<string, Array<{ sectionId: string; building: Building & { code: string }; start: number; end: number }>>();
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
  const result: TightWalk[] = [];
  for (const [day, list] of byDay) {
    list.sort((a, b) => a.start - b.start || a.end - b.end);
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
