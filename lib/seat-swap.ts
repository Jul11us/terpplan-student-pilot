// From a seat alert to the student's schedule: the alert email links to /?opening=<section>&term=<term>, and
// the planner page checks the opened section against the schedule chosen in TerpPlan on this device. The
// same check picks the sections worth watching ("only sections that fit my schedule").
// Registration itself always happens in Testudo.

import { hasUnknownTime, isOnlineOnly, meetingsConflict, type MeetingTime } from "@/lib/meeting-time";

export type SectionFit = "fits" | "conflict" | "unknown";
export type Opening = { courseId: string; sectionId: string; term: string };

const SECTION = /^([A-Z]{4}\d{3}[A-Z0-9]*)-([A-Z0-9]{1,6})$/;

// The link in a seat alert email, relative to the site.
export function openingPath(term: string, sectionId: string) {
  return `/plan?opening=${encodeURIComponent(sectionId)}&term=${encodeURIComponent(term)}`;
}

export function parseOpening(search: string): Opening | null {
  const params = new URLSearchParams(search);
  const sectionId = (params.get("opening") ?? "").trim().toUpperCase();
  const term = (params.get("term") ?? "").trim();
  const match = SECTION.exec(sectionId);
  if (!match || !/^\d{6}$/.test(term)) return null;
  return { courseId: match[1]!, sectionId, term };
}

const sameMeeting = (a: MeetingTime, b: MeetingTime) => (a.days ?? "") === (b.days ?? "") && (a.start_time ?? "") === (b.start_time ?? "") && (a.end_time ?? "") === (b.end_time ?? "");

// The schedule's meetings without one section's (the course's current section, which the opening would
// replace). The schedule is a flat list, so each of the section's meetings is taken out once.
export function scheduleWithout(schedule: MeetingTime[], sectionMeetings: MeetingTime[]) {
  const rest = [...schedule];
  for (const meeting of sectionMeetings) {
    const index = rest.findIndex((item) => sameMeeting(item, meeting));
    if (index >= 0) rest.splice(index, 1);
  }
  return rest;
}

// Whether a section can join the schedule: no clash with any class or personal commitment. Online work
// with no set time always fits; a section whose time is not listed cannot be checked.
export function sectionFit(meetings: MeetingTime[], schedule: MeetingTime[]): SectionFit {
  if (isOnlineOnly(meetings)) return "fits";
  if (hasUnknownTime(meetings)) return "unknown";
  return meetingsConflict(meetings, schedule) ? "conflict" : "fits";
}

// The sections worth watching for a schedule: the ones that fit (time-unknown sections are left out, since
// an alert for them could not be acted on without checking first).
export function fittingSections<T extends { meetings?: MeetingTime[] | null }>(sections: T[], schedule: MeetingTime[]) {
  return sections.filter((section) => sectionFit(section.meetings ?? [], schedule) === "fits");
}
