// "Registration day": the course and section numbers of the schedule a student picked, with each course's
// backup sections next to it, saved in this browser so /register opens straight to them (and keeps working
// if the connection drops) while the student registers in Testudo. Also the countdown to the registration
// time the student entered, which is Eastern time like everything at UMD.

import { storageKey } from "@/lib/demo";

export const REGISTRATION_DAY_KEY = "terpplan:registration-day";
// Same-tab notice that the saved list or the registration time changed (other tabs hear "storage").
export const REGISTRATION_DAY_EVENT = "terpplan:registration-day-changed";

export type RegistrationCourse = {
  courseId: string;
  title: string;
  section: string;
  full: boolean;
  backups: Array<{ section: string; full: boolean }>;
};

export type RegistrationDay = {
  term: string;
  termName: string;
  savedAt: string;
  courses: RegistrationCourse[];
  missing: string[];
  // The term, course and section the student ticked off, as registrationCourseKey values.
  done: string[];
};

export const registrationCourseKey = (term: string, courseId: string, section: string) => `${term}:${courseId}:${section}`;

// Older copies kept only course ids. Bind those marks to the sections in that saved copy before a new
// schedule replaces it, so changing a section cannot carry its old "registered" mark across.
function normalizedDone(day: Pick<RegistrationDay, "term" | "courses">, done: unknown) {
  const values = new Set(Array.isArray(done) ? done.filter((value): value is string => typeof value === "string") : []);
  return day.courses.flatMap((course) => {
    const key = registrationCourseKey(day.term, course.courseId, course.section);
    return values.has(key) || values.has(course.courseId) ? [key] : [];
  });
}

type Section = { course_id: string; course_title: string; section_id: string; open_seats?: string | number | null };

const sectionNumber = (section: Section) => section.section_id.slice(section.course_id.length + 1) || section.section_id;
const isFull = (section: Section) => section.open_seats !== null && section.open_seats !== undefined && section.open_seats !== "" && Number(section.open_seats) === 0;

// The chosen sections in order, each with the other options' sections of the same course as its backups.
export function registrationCourses(chosen: Section[], others: Section[][]): RegistrationCourse[] {
  return chosen.map((section) => {
    const backups = new Map<string, { section: string; full: boolean }>();
    for (const other of others.flat()) {
      if (other.course_id !== section.course_id || other.section_id === section.section_id) continue;
      backups.set(other.section_id, { section: sectionNumber(other), full: isFull(other) });
    }
    return { courseId: section.course_id, title: section.course_title, section: sectionNumber(section), full: isFull(section), backups: [...backups.values()] };
  });
}

// Minutes Eastern time is behind UTC at a moment (240 in summer, 300 in winter).
function easternOffsetMinutes(at: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(at).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((at.getTime() - asUtc) / 60_000);
}

// "2026-11-02" + "08:30" Eastern -> the moment, or null for an incomplete entry.
export function easternMoment(date: string, time: string): Date | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date), clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!day || !clock) return null;
  const guess = Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]), Number(clock[1]), Number(clock[2]));
  // Two passes settle the offset even on the night the clocks change.
  let moment = guess + easternOffsetMinutes(new Date(guess)) * 60_000;
  moment = guess + easternOffsetMinutes(new Date(moment)) * 60_000;
  return new Date(moment);
}

export type Countdown = { state: "upcoming"; days: number; hours: number; minutes: number; seconds: number } | { state: "open" } | { state: "past" };

// Until the registration time; "open" for the first six hours after it (the student is registering), then "past".
export function countdown(target: Date, now = new Date()): Countdown {
  const left = target.getTime() - now.getTime();
  if (left <= 0) return -left < 6 * 3_600_000 ? { state: "open" } : { state: "past" };
  const seconds = Math.floor(left / 1000);
  return { state: "upcoming", days: Math.floor(seconds / 86_400), hours: Math.floor(seconds / 3600) % 24, minutes: Math.floor(seconds / 60) % 60, seconds: seconds % 60 };
}

export function formatCountdown(value: Extract<Countdown, { state: "upcoming" }>, language: "en" | "zh") {
  const { days, hours, minutes, seconds } = value;
  if (language === "zh") return days ? `${days} 天 ${hours} 小时` : hours ? `${hours} 小时 ${minutes} 分` : `${minutes} 分 ${seconds} 秒`;
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`;
}

type SessionCopy = { raw: string | null; day: RegistrationDay | null; dirty: boolean; readFailed: boolean };
// A failed write must not erase this tab's preceding checkbox changes. Keep that draft only while the
// stored copy is unchanged; a newer copy from another tab (including deletion) always takes priority.
const sessionCopies = new WeakMap<Window, Map<string, SessionCopy>>();
function sessionCopy() {
  if (typeof window === "undefined") return null;
  let copies = sessionCopies.get(window);
  if (!copies) { copies = new Map(); sessionCopies.set(window, copies); }
  return { copies, key: storageKey(REGISTRATION_DAY_KEY) };
}

export function registrationDayIsSaved() {
  const session = sessionCopy();
  const copy = session?.copies.get(session.key);
  return Boolean(copy && !copy.dirty && !copy.readFailed);
}

export function readRegistrationDay(): RegistrationDay | null {
  const session = sessionCopy();
  if (!session) return null;
  const previous = session.copies.get(session.key);
  try {
    const raw = window.localStorage.getItem(session.key);
    if (previous?.dirty && raw === previous.raw) {
      previous.readFailed = false;
      return previous.day;
    }
    const value = JSON.parse(raw ?? "null") as RegistrationDay | null;
    const day = value && Array.isArray(value.courses) && typeof value.term === "string" ? { ...value, done: normalizedDone(value, value.done), missing: Array.isArray(value.missing) ? value.missing : [] } : null;
    session.copies.set(session.key, { raw, day, dirty: false, readFailed: false });
    return day;
  } catch {
    const copy = previous ?? { raw: null, day: null, dirty: false, readFailed: true };
    copy.readFailed = true;
    session.copies.set(session.key, copy);
    return copy.day;
  }
}

export function writeRegistrationDay(value: RegistrationDay) {
  const session = sessionCopy();
  if (!session) return false;
  if (!session.copies.has(session.key)) readRegistrationDay();
  const previous = session.copies.get(session.key)!;
  const day = { ...value, done: normalizedDone(value, value.done) };
  let raw = previous.raw;
  let saved = false;
  try {
    // Without a successful latest read, writing this snapshot could replace another tab's new schedule.
    if (!previous.readFailed) {
      const encoded = JSON.stringify(day);
      window.localStorage.setItem(session.key, encoded);
      raw = encoded;
      saved = true;
    }
  } catch { /* Keep the unsaved draft in this tab, and tell the UI it is not persisted. */ }
  session.copies.set(session.key, { raw, day, dirty: !saved, readFailed: previous.readFailed });
  window.dispatchEvent(new Event(REGISTRATION_DAY_EVENT));
  return saved;
}

// A newly chosen schedule keeps completion only for the same term and exact sections. Read the latest
// browser copy here too, since a registration tab may have checked off another course in the meantime.
export function saveRegistrationSchedule(value: Omit<RegistrationDay, "done">) {
  const previous = readRegistrationDay();
  const matching = new Set(value.courses.map((course) => registrationCourseKey(value.term, course.courseId, course.section)));
  const next = { ...value, done: (previous?.done ?? []).filter((key) => matching.has(key)) };
  writeRegistrationDay(next);
  return next;
}

// Apply the checkbox's intended state to the latest saved list, never the tab's old whole snapshot.
// If its term or section changed, return that newer list without changing it.
export function setRegistrationDone(term: string, courseId: string, section: string, registered: boolean) {
  const latest = readRegistrationDay();
  if (!latest || latest.term !== term || !latest.courses.some((course) => course.courseId === courseId && course.section === section)) return latest;
  const key = registrationCourseKey(term, courseId, section);
  if (latest.done.includes(key) === registered) return latest;
  const next = { ...latest, done: registered ? [...latest.done, key] : latest.done.filter((value) => value !== key) };
  writeRegistrationDay(next);
  return next;
}

// Same-tab writes and changes in other tabs both refresh the registration page, including its countdown.
// Match this tab's storage keys so a sample never follows changes to the student's real list.
export function subscribeRegistrationDay(load: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === storageKey(REGISTRATION_DAY_KEY) || event.key === storageKey(REMINDER_KEY)) load();
  };
  window.addEventListener(REGISTRATION_DAY_EVENT, load);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(REGISTRATION_DAY_EVENT, load); window.removeEventListener("storage", onStorage); };
}

// The registration time the student entered in the checklist, by term name (shared with the checklist).
export const REMINDER_KEY = "terpplan:registration-time";
export function savedReminder(termName: string): { date: string; time: string } {
  try {
    const value = (JSON.parse(window.localStorage.getItem(storageKey(REMINDER_KEY)) ?? "{}") as Record<string, { date?: unknown; time?: unknown }>)[termName];
    return { date: typeof value?.date === "string" ? value.date : "", time: typeof value?.time === "string" ? value.time : "" };
  } catch {
    return { date: "", time: "" };
  }
}
