// "My week": the schedule option a student chose, kept in this browser so /week can show it without a
// network connection (from the home screen, between classes). Only meeting times and rooms are kept.

import { isAsyncOnline, meetingDays, meetingMinutes, type MeetingTime } from "@/lib/meeting-time";

export const MY_WEEK_KEY = "terpplan:my-week";
export const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type WeekClass = {
  courseId: string;
  courseTitle: string;
  sectionId: string;
  kind: string | null;
  days: string[];
  start: number;
  end: number;
  building: string | null;
  room: string | null;
};

export type MyWeek = {
  term: string;
  termName: string;
  savedAt: string;
  classes: WeekClass[];
  // Sections with online work or a time still to be announced, which have no place on the grid.
  unscheduled: string[];
};

type SectionLike = { course_id: string; course_title: string; section_id: string; meetings?: (MeetingTime & { classtype?: string | null })[] | null };

export function weekFromSections(sections: SectionLike[], term: string, termName: string, now = new Date()): MyWeek {
  const classes: WeekClass[] = [];
  const unscheduled = new Set<string>();
  for (const section of sections) {
    const meetings = section.meetings ?? [];
    if (!meetings.length) unscheduled.add(section.section_id);
    for (const meeting of meetings) {
      const days = meetingDays(meeting.days), start = meetingMinutes(meeting.start_time), end = meetingMinutes(meeting.end_time);
      if (isAsyncOnline(meeting) || !days.length || start === null || end === null || end <= start) { unscheduled.add(section.section_id); continue; }
      classes.push({ courseId: section.course_id, courseTitle: section.course_title, sectionId: section.section_id, kind: meeting.classtype?.trim() || null, days, start, end, building: meeting.building?.trim() || null, room: meeting.room?.trim() || null });
    }
  }
  return { term, termName, savedAt: now.toISOString(), classes, unscheduled: [...unscheduled] };
}

const text = (value: unknown) => typeof value === "string" ? value : null;

export function parseMyWeek(value: unknown): MyWeek | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.term !== "string" || !Array.isArray(record.classes)) return null;
  const classes = record.classes.flatMap((item): WeekClass[] => {
    if (!item || typeof item !== "object") return [];
    const c = item as Record<string, unknown>;
    const days = Array.isArray(c.days) ? c.days.filter((day): day is string => (WEEK_DAYS as readonly string[]).includes(day as string)) : [];
    if (typeof c.courseId !== "string" || typeof c.sectionId !== "string" || !days.length || typeof c.start !== "number" || typeof c.end !== "number" || c.end <= c.start) return [];
    return [{ courseId: c.courseId, courseTitle: text(c.courseTitle) ?? c.courseId, sectionId: c.sectionId, kind: text(c.kind), days, start: c.start, end: c.end, building: text(c.building), room: text(c.room) }];
  });
  return {
    term: record.term,
    termName: text(record.termName) ?? record.term,
    savedAt: text(record.savedAt) ?? "",
    classes,
    unscheduled: Array.isArray(record.unscheduled) ? record.unscheduled.filter((id): id is string => typeof id === "string") : [],
  };
}

export function readMyWeek(): MyWeek | null {
  try {
    return parseMyWeek(JSON.parse(window.localStorage.getItem(MY_WEEK_KEY) ?? "null"));
  } catch {
    return null;
  }
}

export function writeMyWeek(week: MyWeek) {
  try {
    window.localStorage.setItem(MY_WEEK_KEY, JSON.stringify(week));
    return true;
  } catch {
    return false;
  }
}

export function classesOn(week: MyWeek, day: string) {
  return week.classes.filter((item) => item.days.includes(day)).sort((a, b) => a.start - b.start || a.courseId.localeCompare(b.courseId));
}

// "Mon".."Sun" for a date in the device's time zone (students' phones are on campus time).
export function dayOf(date: Date) {
  return WEEK_DAYS[(date.getDay() + 6) % 7];
}
