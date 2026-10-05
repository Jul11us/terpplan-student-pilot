// Open-seat counts for a list of courses, for the search results list. Testudo's sections page takes many
// course IDs at once, so a page of results costs one or two requests instead of one per course.
// Freshman Connection sections are left out: they are only open to students in that program, and the
// planner skips them unless the student opts in.

import { isFreshmanConnection } from "@/lib/planner";
import { getTestudoSectionsBatch, isTestudoTerm, parseCount, type UmdSection } from "@/lib/umd";
import type { MeetingTime } from "@/lib/meeting-time";

export type SeatSummary = {
  sections: number; // sections other than Freshman Connection
  openSections: number; // of those, sections with at least one open seat
  openSeats: number; // open seats across sections whose count is known
  unknownSections: number; // sections Testudo gave no seat count for
  // Each section's open seats and meeting times, so the page can tell which sections fit a schedule.
  slots?: SectionSlot[];
};

export type SectionSlot = { open: number | null; meetings: MeetingTime[] };

// Only what the fit check needs: days, times, and the building/room that mark online-only meetings.
export function sectionSlots(sections: UmdSection[]): SectionSlot[] {
  return sections.filter((section) => !isFreshmanConnection(section)).map((section) => ({
    open: parseCount(section.open_seats),
    meetings: (section.meetings ?? []).map((meeting) => ({ days: meeting.days ?? null, start_time: meeting.start_time ?? null, end_time: meeting.end_time ?? null, building: meeting.building ?? null, room: meeting.room ?? null })),
  }));
}

const CACHE_MS = 60_000;
const cache = new Map<string, { expiresAt: number; summary: SeatSummary }>();

export function summarizeSeats(sections: Array<{ section_id?: string; number?: string; open_seats?: string | number | null }>): SeatSummary {
  const summary: SeatSummary = { sections: 0, openSections: 0, openSeats: 0, unknownSections: 0 };
  for (const section of sections) {
    if (isFreshmanConnection(section)) continue;
    summary.sections += 1;
    const open = parseCount(section.open_seats);
    if (open === null) summary.unknownSections += 1;
    else if (open > 0) { summary.openSections += 1; summary.openSeats += open; }
  }
  return summary;
}

export async function seatSummaries(term: string, courseIds: string[]): Promise<Record<string, SeatSummary>> {
  // Only the Testudo term has live seat counts; older terms come from umd.io, where seats are history.
  if (!isTestudoTerm(term)) return {};
  const now = Date.now();
  const result: Record<string, SeatSummary> = {};
  const missing: string[] = [];
  for (const id of courseIds) {
    const hit = cache.get(`${term}|${id}`);
    if (hit && hit.expiresAt > now) result[id] = hit.summary;
    else missing.push(id);
  }
  const sections = await getTestudoSectionsBatch(term, missing);
  for (const id of missing) {
    const list = sections.get(id) ?? [];
    const summary: SeatSummary = { ...summarizeSeats(list), slots: sectionSlots(list) };
    result[id] = summary;
    if (cache.size >= 2000) cache.delete(cache.keys().next().value!);
    cache.set(`${term}|${id}`, { expiresAt: now + CACHE_MS, summary });
  }
  return result;
}
