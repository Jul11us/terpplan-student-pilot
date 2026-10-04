// Earlier semesters for a course's offering history. TerpPlan only records the terms people open, so a
// course first looks like it ran once. The first time a course's history is asked for, the last few fall and
// spring semesters are read from Testudo (which keeps past schedules and answers in well under a second) and
// stored (see backfillCourseOfferings); later requests read the database only. Summer and winter are left
// out: they are not part of a course's regular rotation.

import { getTestudoTermSections, parseCount, type UmdSection } from "@/lib/umd";
import type { OfferingTermStatus } from "@/lib/seat-trends";

export const BACKFILL_TERMS = 4;

// The fall and spring semesters before `term`, newest first: 202701 -> 202608, 202601, 202508, 202501.
export function previousRegularTerms(term: string, count = BACKFILL_TERMS): string[] {
  let year = Number(term.slice(0, 4));
  // Months into the year: spring 01, summer 05, fall 08, winter 12. The regular term before a given one is
  // the latest spring or fall that starts earlier.
  let month = Number(term.slice(4));
  const terms: string[] = [];
  while (terms.length < count) {
    if (month > 8) month = 8;
    else if (month > 1) month = 1;
    else { year -= 1; month = 8; }
    terms.push(`${year}${String(month).padStart(2, "0")}`);
  }
  return terms;
}

// Roughly when each kind of semester runs (month, day), generous at the end so finals and grading are in.
const TERM_DATES: Record<string, { start: [number, number]; end: [number, number]; endsNextYear?: boolean }> = {
  "01": { start: [1, 20], end: [5, 31] },
  "05": { start: [6, 1], end: [8, 20] },
  "08": { start: [8, 25], end: [12, 23] },
  "12": { start: [1, 2], end: [1, 26], endsNextYear: true },
};

export function termEnd(term: string) {
  const dates = TERM_DATES[term.slice(4)] ?? TERM_DATES["08"];
  const year = Number(term.slice(0, 4)) + (dates.endsNextYear ? 1 : 0);
  return new Date(Date.UTC(year, dates.end[0] - 1, dates.end[1], 23, 59));
}

// Whether a term's seat numbers are final: "past" once it has ended, "current" while it runs, "upcoming"
// before it starts (registration).
export function termStatus(term: string, now = new Date()): OfferingTermStatus {
  const dates = TERM_DATES[term.slice(4)] ?? TERM_DATES["08"];
  const year = Number(term.slice(0, 4)) + (dates.endsNextYear ? 1 : 0);
  if (now.getTime() < Date.UTC(year, dates.start[0] - 1, dates.start[1])) return "upcoming";
  return now.getTime() > termEnd(term).getTime() ? "past" : "current";
}

export type TermOffering = { sectionCount: number; totalSeats: number; openSeats: number | null; fullSections: number | null };

// Totals for a term's sections. Open seats are counted only when every section lists them.
export function summarizeSections(sections: UmdSection[]): TermOffering {
  const open = sections.map((section) => parseCount(section.open_seats));
  const known = open.every((count) => count !== null);
  return {
    sectionCount: sections.length,
    totalSeats: sections.reduce((sum, section) => sum + (parseCount(section.seats) ?? 0), 0),
    openSeats: known ? open.reduce<number>((sum, count) => sum + (count ?? 0), 0) : null,
    fullSections: known ? open.filter((count) => count === 0).length : null,
  };
}

// One semester: the sections' count and seats, "none" when the course did not run then, or null when Testudo
// could not answer (the term is tried again on a later request).
export async function fetchTermOffering(courseId: string, term: string): Promise<TermOffering | "none" | null> {
  try {
    const sections = await getTestudoTermSections(courseId, term);
    return sections.length ? summarizeSections(sections) : "none";
  } catch {
    return null;
  }
}
