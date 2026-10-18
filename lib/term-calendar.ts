// Class dates per term for calendar export, from the UMD Office of the Provost semester calendar:
// https://provost.umd.edu/calendar (checked 2026-09-23; UMD notes dates may change).
// Only regular class weeks are covered: final exams and reading days follow a different schedule.
// Add a term here before its export button can be used; a missing term never guesses dates.

export type TermCalendar = {
  firstDay: string;
  lastDay: string;
  // Inclusive date ranges with no classes (holidays and breaks).
  noClasses: Array<[start: string, end: string]>;
};

export const TERM_CALENDARS: Record<string, TermCalendar> = {
  // Fall 2026: Labor Day, Fall Break, Thanksgiving Recess.
  "202608": { firstDay: "2026-08-31", lastDay: "2026-12-11", noClasses: [["2026-09-07", "2026-09-07"], ["2026-10-12", "2026-10-13"], ["2026-11-25", "2026-11-29"]] },
  // Winter 2027: Dr. Martin Luther King Holiday.
  "202612": { firstDay: "2027-01-04", lastDay: "2027-01-22", noClasses: [["2027-01-18", "2027-01-18"]] },
  // Spring 2027: Spring Break.
  "202701": { firstDay: "2027-01-27", lastDay: "2027-05-11", noClasses: [["2027-03-14", "2027-03-21"]] },
};

// The term in progress on a date, by month (close enough for which terms are still ahead): January is winter,
// February to May spring, June and July summer, August to December fall.
export function termAt(date: Date) {
  const year = date.getFullYear(), month = date.getMonth() + 1;
  if (month === 1) return `${year - 1}12`;
  if (month <= 5) return `${year}01`;
  if (month <= 7) return `${year}05`;
  return `${year}08`;
}

// The device's calendar date ("2026-10-18"), to compare with the calendar's days.
const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// Whether a term's classes run on a date: from its first to its last class day when its calendar is here, else
// by month.
export function termInSession(term: string, date: Date) {
  const calendar = TERM_CALENDARS[term];
  return calendar ? calendar.firstDay <= localDay(date) && localDay(date) <= calendar.lastDay : termAt(date) === term;
}

// Whether a term's classes are over by a date (its last class day has passed, or by month a later term has begun).
export function termEnded(term: string, date: Date) {
  const calendar = TERM_CALENDARS[term];
  return calendar ? localDay(date) > calendar.lastDay : term < termAt(date);
}
