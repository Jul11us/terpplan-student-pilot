import { hasUnknownTime, meetingsConflict, type MeetingTime } from "@/lib/meeting-time";
import type { SectionSlot } from "@/lib/seat-summary";

// Filters for the course search results list. They work on the results already loaded (the first 40
// matches), using the credits, seat counts and prerequisite checks the page has for each course.

export type CreditFilter = "any" | "1" | "2" | "3" | "4+";
export type ResultFilters = { openSeats: boolean; prereqsMet: boolean; credits: CreditFilter; fitsSchedule?: boolean };

export const NO_FILTERS: ResultFilters = { openSeats: false, prereqsMet: false, credits: "any", fitsSchedule: false };

export const filtersActive = (filters: ResultFilters) => filters.openSeats || filters.prereqsMet || filters.credits !== "any" || Boolean(filters.fitsSchedule);

// How a course's sections sit against a schedule (its meetings plus personal commitments): sections with
// set times that clash with none of them, and sections whose time is not listed (they cannot be checked).
// With openOnly, full sections do not count.
export type ScheduleFit = { fit: number; tba: number };

export function scheduleFit(slots: SectionSlot[], schedule: MeetingTime[], openOnly = false): ScheduleFit {
  let fit = 0, tba = 0;
  for (const slot of slots) {
    if (openOnly && slot.open !== null && slot.open <= 0) continue;
    if (hasUnknownTime(slot.meetings)) tba += 1;
    else if (!meetingsConflict(slot.meetings, schedule)) fit += 1;
  }
  return { fit, tba };
}

// "3" or a range "1–3". A variable-credit course matches every value its range covers; a course with
// no known credits matches only "any".
export function creditsMatch(credits: string | undefined, wanted: CreditFilter) {
  if (wanted === "any") return true;
  const [min, max = min] = (credits ?? "").split(/[–-]/).map((part) => Number(part.trim()));
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0) return false;
  return wanted === "4+" ? max >= 4 : min <= Number(wanted) && Number(wanted) <= max;
}

type SeatsKnown = { sections: number; openSeats: number } | null | undefined;

export function filterResults<T extends { course_id: string; credits?: string }>(
  courses: T[],
  filters: ResultFilters,
  seatsOf: (courseId: string) => SeatsKnown,
  needsOf: (courseId: string) => string[] | null,
  fitOf: (courseId: string) => ScheduleFit | null | undefined = () => undefined,
): T[] {
  return courses.filter((course) => {
    if (filters.fitsSchedule) {
      // Still loading (undefined) stays; a course whose every timed section clashes goes. Untimed sections
      // keep a course, since they might fit.
      const fit = fitOf(course.course_id);
      if (fit && fit.fit === 0 && fit.tba === 0) return false;
    }
    if (!creditsMatch(course.credits, filters.credits)) return false;
    if (filters.openSeats) {
      // Still loading (undefined) or unreadable (null) stays: only a known count of zero is "no seats".
      const seats = seatsOf(course.course_id);
      if (seats && (!seats.sections || seats.openSeats <= 0)) return false;
    }
    if (filters.prereqsMet) {
      const needs = needsOf(course.course_id);
      if (needs && needs.length) return false;
    }
    return true;
  });
}

export type ResultSort = "match" | "seats" | "gpa" | "credits";

const minCredits = (credits: string | undefined) => {
  const value = Number((credits ?? "").split(/[–-]/)[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
};

// Reorders the (filtered) results. "match" keeps the search's own order; for the others, courses whose value
// is not known yet (still loading, or no data) go last, in their original order.
export function sortResults<T extends { course_id: string; credits?: string }>(
  courses: T[],
  sort: ResultSort,
  seatsOf: (courseId: string) => SeatsKnown,
  gpaOf: (courseId: string) => number | null | undefined,
): T[] {
  if (sort === "match") return courses;
  const value = (course: T): number | null => {
    if (sort === "seats") { const seats = seatsOf(course.course_id); return seats ? seats.openSeats : null; }
    if (sort === "gpa") return gpaOf(course.course_id) ?? null;
    return minCredits(course.credits);
  };
  const direction = sort === "credits" ? 1 : -1;
  return courses.map((course, index) => ({ course, index, key: value(course) }))
    .sort((a, b) => (a.key === null ? 1 : 0) - (b.key === null ? 1 : 0) || (a.key !== null && b.key !== null ? direction * (a.key - b.key) : 0) || a.index - b.index)
    .map(({ course }) => course);
}
