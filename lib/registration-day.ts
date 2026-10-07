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
  // Courses the student ticked off as registered.
  done: string[];
};

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

export function readRegistrationDay(): RegistrationDay | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(REGISTRATION_DAY_KEY)) ?? "null") as RegistrationDay | null;
    return value && Array.isArray(value.courses) && typeof value.term === "string" ? { ...value, done: Array.isArray(value.done) ? value.done : [], missing: Array.isArray(value.missing) ? value.missing : [] } : null;
  } catch {
    return null;
  }
}

export function writeRegistrationDay(value: RegistrationDay) {
  try {
    window.localStorage.setItem(storageKey(REGISTRATION_DAY_KEY), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
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
