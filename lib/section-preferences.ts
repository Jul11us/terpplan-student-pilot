// Whether one section suits the schedule preferences set in step 02 (days off, earliest start, a strict time
// window, personal commitments, parts of campus), for pages that judge sections one at a time in the browser,
// such as the Gen Ed finder. The rules are the scheduler's own (conflictsWithTimePreferences and
// outsideCampusAreas in lib/planner.ts); tests/section-preferences.test.mjs checks that the two agree.
// Browser-safe: no server code.

import { areaFor, buildingFor, CAMPUS_AREA_KEYS, type CampusArea } from "@/lib/campus-walk";
import { isAsyncOnline, meetingDays, meetingMinutes, type MeetingTime } from "@/lib/meeting-time";
import { normalizeBusyBlocks, type BusyBlock } from "@/lib/personal-schedule";

export type SectionPreferences = {
  excludedDays?: string[];
  earliestStart?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  strictTime?: boolean;
  busyBlocks?: BusyBlock[];
  campusAreas?: string[];
};

// The preferences that can rule a section out, read once; null when none of them is set.
export function activePreferences(preferences: SectionPreferences | null | undefined) {
  if (!preferences) return null;
  const windowStart = meetingMinutes(preferences.windowStart);
  const windowEnd = meetingMinutes(preferences.windowEnd);
  const active = {
    // Day names as the preferences store them ("Mon" ... "Sun"), compared as they are.
    excludedDays: [...new Set(preferences.excludedDays ?? [])],
    earliest: meetingMinutes(preferences.earliestStart),
    // The time window only rules sections out when it is strict and both ends are set.
    window: preferences.strictTime && windowStart !== null && windowEnd !== null && windowEnd > windowStart ? { start: windowStart, end: windowEnd } : null,
    busyBlocks: normalizeBusyBlocks(preferences.busyBlocks ?? []),
    // Unknown area names are dropped, as the scheduler does.
    campusAreas: (preferences.campusAreas ?? []).filter((area): area is CampusArea => (CAMPUS_AREA_KEYS as string[]).includes(area)),
  };
  const set = active.excludedDays.length || active.earliest !== null || active.window || active.busyBlocks.length || active.campusAreas.length;
  return set ? active : null;
}

export type ActivePreferences = NonNullable<ReturnType<typeof activePreferences>>;
export type PreferenceMiss = "busy" | "day" | "early" | "window" | "area";

// A meeting's days and times, when all of them are known.
function knownTime(meeting: MeetingTime) {
  const start = meetingMinutes(meeting.start_time), end = meetingMinutes(meeting.end_time), days = meetingDays(meeting.days);
  return start !== null && end !== null && end > start && days.length ? { start, end, days } : null;
}

// The first preference a section's meetings break, or null when they suit every one. Asynchronous online work
// has no time or place, so it never breaks one; a meeting whose time is not known yet only breaks a strict window.
export function preferenceMiss(meetings: MeetingTime[], active: ActivePreferences | null): PreferenceMiss | null {
  if (!active) return null;
  for (const meeting of meetings) {
    if (isAsyncOnline(meeting)) continue;
    const time = knownTime(meeting);
    // Touching is fine: a class may end when a commitment starts.
    if (time && active.busyBlocks.some((block) => {
      const start = meetingMinutes(block.start)!, end = meetingMinutes(block.end)!;
      return block.days.some((day) => time.days.includes(day)) && time.start < end && start < time.end;
    })) return "busy";
    if (meetingDays(meeting.days).some((day) => active.excludedDays.includes(day))) return "day";
    const start = meetingMinutes(meeting.start_time);
    if (active.earliest !== null && start !== null && start < active.earliest) return "early";
    if (active.window && (!time || time.start < active.window.start || time.end > active.window.end)) return "window";
  }
  if (active.window && !meetings.length) return "window";
  // A meeting in a building with no known position, or online, is not ruled out by the parts of campus.
  if (active.campusAreas.length && meetings.some((meeting) => {
    if (isAsyncOnline(meeting) || !buildingFor(meeting.building)) return false;
    const area = areaFor(meeting.building);
    return area !== null && !active.campusAreas.includes(area);
  })) return "area";
  return null;
}
