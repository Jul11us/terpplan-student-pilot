// Earlier semesters for a course's offering history. TerpPlan only records the terms people open, so a
// course first looks like it ran once. The first time a course's history is asked for, the last few fall and
// spring semesters are read from Testudo (which keeps past schedules and answers in well under a second) and
// stored (see backfillCourseOfferings); later requests read the database only. Summer and winter are left
// out: they are not part of a course's regular rotation.

import { getTestudoTermSections, parseCount } from "@/lib/umd";

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

export type TermOffering = { sectionCount: number; totalSeats: number };

// One semester: the sections' count and seats, "none" when the course did not run then, or null when Testudo
// could not answer (the term is tried again on a later request).
export async function fetchTermOffering(courseId: string, term: string): Promise<TermOffering | "none" | null> {
  try {
    const sections = await getTestudoTermSections(courseId, term);
    if (!sections.length) return "none";
    return { sectionCount: sections.length, totalSeats: sections.reduce((sum, section) => sum + (parseCount(section.seats) ?? 0), 0) };
  } catch {
    return null;
  }
}
