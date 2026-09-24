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
