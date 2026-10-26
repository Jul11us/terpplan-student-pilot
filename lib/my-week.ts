// "My week": the schedule option a student chose for a term, kept in this browser so /week can show it without a
// network connection (from the home screen, between classes). Only meeting times and rooms are kept.

import { isAsyncOnline, meetingDays, meetingMinutes, type MeetingTime } from "@/lib/meeting-time";
import { storageKey } from "@/lib/demo";
import { markLocalChange } from "@/lib/sync-meta";
import { termEnded } from "@/lib/term-calendar";

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

export type UnscheduledKind = "async" | "tba" | "unknown";
export type WeekSection = {
  courseId: string;
  courseTitle: string;
  sectionId: string;
  // Older saved weeks combined asynchronous work and TBA into one list, so their exact state is unknown.
  unscheduled: UnscheduledKind[];
};

export type MyWeek = {
  term: string;
  termName: string;
  savedAt: string;
  classes: WeekClass[];
  // Sections with online work or a time still to be announced, which have no place on the grid.
  unscheduled: string[];
  // Optional for old saved/account copies. Timed rows and the ID list above remain compatible with them.
  sections?: WeekSection[];
};

type SectionLike = { course_id: string; course_title: string; section_id: string; meetings?: (MeetingTime & { classtype?: string | null })[] | null };

export function weekFromSections(sections: SectionLike[], term: string, termName: string, now = new Date()): MyWeek {
  const classes: WeekClass[] = [];
  const unscheduled = new Set<string>();
  const details = new Map<string, WeekSection>();
  for (const section of sections) {
    const detail: WeekSection = details.get(section.section_id) ?? { courseId: section.course_id, courseTitle: section.course_title, sectionId: section.section_id, unscheduled: [] };
    const mark = (kind: UnscheduledKind) => {
      unscheduled.add(section.section_id);
      if (!detail.unscheduled.includes(kind)) detail.unscheduled.push(kind);
    };
    const meetings = section.meetings ?? [];
    if (!meetings.length) mark("tba");
    for (const meeting of meetings) {
      const days = meetingDays(meeting.days), start = meetingMinutes(meeting.start_time), end = meetingMinutes(meeting.end_time);
      if (isAsyncOnline(meeting)) { mark("async"); continue; }
      if (!days.length || start === null || end === null || end <= start) { mark("tba"); continue; }
      classes.push({ courseId: section.course_id, courseTitle: section.course_title, sectionId: section.section_id, kind: meeting.classtype?.trim() || null, days, start, end, building: meeting.building?.trim() || null, room: meeting.room?.trim() || null });
    }
    details.set(section.section_id, detail);
  }
  return { term, termName, savedAt: now.toISOString(), classes: uniqueClasses(classes), unscheduled: [...unscheduled], sections: [...details.values()] };
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
  const unscheduled = Array.isArray(record.unscheduled) ? [...new Set(record.unscheduled.filter((id): id is string => typeof id === "string"))] : [];
  const knownIds = new Set([...classes.map((item) => item.sectionId), ...unscheduled]);
  const sections = Array.isArray(record.sections) ? record.sections.flatMap((item): WeekSection[] => {
    if (!item || typeof item !== "object") return [];
    const section = item as Record<string, unknown>;
    if (typeof section.sectionId !== "string" || typeof section.courseId !== "string" || !knownIds.has(section.sectionId)) return [];
    const kinds = Array.isArray(section.unscheduled) ? section.unscheduled.filter((kind): kind is UnscheduledKind => kind === "async" || kind === "tba" || kind === "unknown") : [];
    return [{ sectionId: section.sectionId, courseId: section.courseId, courseTitle: text(section.courseTitle) ?? section.courseId, unscheduled: [...new Set(kinds)] }];
  }) : undefined;
  return {
    term: record.term,
    termName: text(record.termName) ?? record.term,
    savedAt: text(record.savedAt) ?? "",
    classes: uniqueClasses(classes),
    unscheduled,
    ...(sections ? { sections } : {}),
  };
}

// Every saved section, including ones with no timed row. The section number supplies the course code for
// legacy records; new records also preserve the course's title and distinguish TBA from asynchronous work.
export function weekSections(week: MyWeek): WeekSection[] {
  const details = new Map((week.sections ?? []).map((section) => [section.sectionId, section]));
  const ids = new Set([...week.classes.map((item) => item.sectionId), ...week.unscheduled]);
  return [...ids].map((sectionId) => {
    const row = week.classes.find((item) => item.sectionId === sectionId);
    const detail = details.get(sectionId);
    const courseId = row?.courseId ?? detail?.courseId ?? sectionId.slice(0, sectionId.lastIndexOf("-"));
    return { sectionId, courseId, courseTitle: row?.courseTitle || detail?.courseTitle || courseId,
      unscheduled: week.unscheduled.includes(sectionId) ? detail?.unscheduled.length ? detail.unscheduled : ["unknown" as const] : [] };
  });
}

// One week per term ({ weeks: { "202608": ..., "202701": ... } }), so saving next term's schedule keeps this term's.
// A week stored before that (a single week) is read as its term's. The newest terms are kept, and synced with the
// account (lib/plan-sync.ts).
export type MyWeeks = Record<string, MyWeek>;
export const MAX_WEEKS = 4;

const newest = (weeks: MyWeeks): MyWeeks => Object.fromEntries(Object.entries(weeks).sort(([a], [b]) => b.localeCompare(a)).slice(0, MAX_WEEKS));

export function parseMyWeeks(value: unknown): MyWeeks {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  if (typeof record.term === "string" && Array.isArray(record.classes)) {
    const week = parseMyWeek(record);
    return week && /^\d{6}$/.test(week.term) ? { [week.term]: week } : {};
  }
  const weeks: MyWeeks = {};
  if (record.weeks && typeof record.weeks === "object") {
    for (const [term, raw] of Object.entries(record.weeks as Record<string, unknown>)) {
      const week = parseMyWeek(raw);
      if (week && /^\d{6}$/.test(term) && week.term === term) weeks[term] = week;
    }
  }
  return newest(weeks);
}

export function readMyWeeks(): MyWeeks {
  try {
    return parseMyWeeks(JSON.parse(window.localStorage.getItem(storageKey(MY_WEEK_KEY)) ?? "null"));
  } catch {
    return {};
  }
}

// Replaces every saved week (with the account's copy); not a change of the student's own.
export function writeMyWeeks(weeks: MyWeeks) {
  try {
    window.localStorage.setItem(storageKey(MY_WEEK_KEY), JSON.stringify({ weeks: newest(weeks) }));
    return true;
  } catch {
    return false;
  }
}

// Saves one term's week, keeping the other terms'.
export function writeMyWeek(week: MyWeek) {
  const saved = writeMyWeeks({ ...readMyWeeks(), [week.term]: week });
  if (saved) markLocalChange();
  return saved;
}

// The week /week opens on: the first saved term whose classes are not over yet (the one in session, else the next
// to start), else the latest.
export function pickWeekTerm(weeks: MyWeeks, now = new Date()) {
  const terms = Object.keys(weeks).sort();
  return terms.find((term) => !termEnded(term, now)) ?? terms.at(-1) ?? null;
}

// A term's saved week, or without a term the one /week opens on.
export function readMyWeek(term?: string): MyWeek | null {
  const weeks = readMyWeeks();
  const key = term ?? pickWeekTerm(weeks);
  return key ? weeks[key] ?? null : null;
}

export function classesOn(week: MyWeek, day: string) {
  return week.classes.filter((item) => item.days.includes(day)).sort((a, b) => a.start - b.start || a.courseId.localeCompare(b.courseId));
}

// "Mon".."Sun" for a date in the device's time zone (students' phones are on campus time).
export function dayOf(date: Date) {
  return WEEK_DAYS[(date.getDay() + 6) % 7];
}

// A saved section whose meetings are no longer what the Schedule of Classes lists: a new time or room, or
// (after === null) the section is gone.
export type WeekChange = {
  sectionId: string; courseId: string; courseTitle: string;
  before: WeekClass[]; after: WeekClass[] | null;
  beforeUnscheduled: UnscheduledKind[]; afterUnscheduled: UnscheduledKind[];
};
export type WeekSectionSnapshot = { classes: WeekClass[]; unscheduled: UnscheduledKind[]; courseTitle?: string };

const meetingKey = (item: WeekClass) => [item.days.slice().sort().join(""), item.start, item.end, (item.building ?? "").toUpperCase(), (item.room ?? "").toUpperCase(), item.kind ?? ""].join("|");
const uniqueClasses = (classes: WeekClass[]) => [...new Map(classes.map((item) => [item.sectionId + ":" + meetingKey(item), item])).values()];
const sameUnscheduled = (before: UnscheduledKind[], after: UnscheduledKind[]) =>
  before.length > 0 && after.length > 0 && (before.includes("unknown") || after.includes("unknown"))
    || before.slice().sort().join("|") === after.slice().sort().join("|");

// `current` holds each section's complete time state, or null when the section is no longer listed.
// Missing keys were not checked (for example a failed lookup). Accept the old timed-array callers too.
export function compareWeek(week: MyWeek, current: Record<string, WeekSectionSnapshot | WeekClass[] | null>): WeekChange[] {
  const changes: WeekChange[] = [];
  for (const section of weekSections(week)) {
    const { sectionId, courseId } = section;
    if (!(sectionId in current)) continue;
    const before = week.classes.filter((item) => item.sectionId === sectionId);
    const value = current[sectionId];
    const snapshot = Array.isArray(value) ? { classes: value, unscheduled: value.length ? [] : ["unknown" as const] } : value;
    const after = snapshot?.classes ?? null;
    const afterUnscheduled = snapshot?.unscheduled ?? [];
    const same = after !== null && after.length === before.length && before.map(meetingKey).sort().join(";") === after.map(meetingKey).sort().join(";")
      && sameUnscheduled(section.unscheduled, afterUnscheduled);
    if (!same) changes.push({ sectionId, courseId, courseTitle: snapshot?.courseTitle ?? section.courseTitle, before, after, beforeUnscheduled: section.unscheduled, afterUnscheduled });
  }
  return changes;
}

// The week with each changed section's meetings replaced by the current ones (a section that is gone keeps
// its old meetings, since the student still has to sort it out in Testudo).
export function applyWeekChanges(week: MyWeek, changes: WeekChange[], now = new Date()): MyWeek {
  const updated = new Map(changes.filter((change) => change.after !== null).map((change) => [change.sectionId, change]));
  const classes = uniqueClasses(week.classes.filter((item) => !updated.has(item.sectionId)).concat([...updated.values()].flatMap((change) => change.after!)));
  const sections = weekSections(week).map((section) => {
    const change = updated.get(section.sectionId);
    return change ? { ...section, courseTitle: change.courseTitle, unscheduled: [...new Set(change.afterUnscheduled)] } : section;
  });
  return { ...week, classes, unscheduled: sections.filter((section) => section.unscheduled.length).map((section) => section.sectionId), sections, savedAt: now.toISOString() };
}
