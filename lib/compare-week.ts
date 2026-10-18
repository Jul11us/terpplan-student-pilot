// A shared schedule next to the viewer's own My week for the same term (app/share): the classes the two have in
// common, and the times on each day when both are free. Worked out in the browser; nothing is sent.

import { WEEK_DAYS, type WeekClass } from "@/lib/my-week";

export type FreeSlot = { start: number; end: number };
export type WeekComparison = {
  // Sections both take.
  sameSections: string[];
  // The same course in different sections.
  sameCourses: Array<{ courseId: string; mine: string[]; theirs: string[] }>;
  // Monday to Friday, and a weekend day either has classes on.
  days: string[];
  // Each day's times when neither has a class, between FREE_FROM and FREE_TO, MIN_FREE minutes or longer.
  free: Record<string, FreeSlot[]>;
  // Days neither has a class on.
  bothOff: string[];
};

export const FREE_FROM = 8 * 60;
export const FREE_TO = 20 * 60;
export const MIN_FREE = 30;

const sectionsOf = (classes: WeekClass[]) => [...new Set(classes.map((item) => item.sectionId))];

export function compareWeeks(mine: WeekClass[], theirs: WeekClass[]): WeekComparison {
  const ours = new Set(sectionsOf(mine));
  const sameSections = sectionsOf(theirs).filter((id) => ours.has(id)).sort();
  const courses = (classes: WeekClass[]) => {
    const map = new Map<string, Set<string>>();
    for (const item of classes) map.set(item.courseId, new Set([...(map.get(item.courseId) ?? []), item.sectionId]));
    return map;
  };
  const myCourses = courses(mine), theirCourses = courses(theirs);
  const sameCourses = [...theirCourses.entries()]
    .filter(([courseId, sections]) => myCourses.has(courseId) && ![...sections].some((id) => ours.has(id)))
    .map(([courseId, sections]) => ({ courseId, mine: [...myCourses.get(courseId)!].sort(), theirs: [...sections].sort() }))
    .sort((a, b) => a.courseId.localeCompare(b.courseId));
  const all = [...mine, ...theirs];
  const days = WEEK_DAYS.filter((day) => (day !== "Sat" && day !== "Sun") || all.some((item) => item.days.includes(day)));
  const free: Record<string, FreeSlot[]> = {};
  const bothOff: string[] = [];
  for (const day of days) {
    const busy = all.filter((item) => item.days.includes(day)).map((item) => [item.start, item.end] as const).sort((a, b) => a[0] - b[0]);
    if (!busy.length) bothOff.push(day);
    const slots: FreeSlot[] = [];
    let cursor = FREE_FROM;
    for (const [start, end] of busy) {
      if (start > cursor) slots.push({ start: cursor, end: Math.min(start, FREE_TO) });
      cursor = Math.max(cursor, end);
      if (cursor >= FREE_TO) break;
    }
    if (cursor < FREE_TO) slots.push({ start: cursor, end: FREE_TO });
    free[day] = slots.filter((slot) => slot.end - slot.start >= MIN_FREE);
  }
  return { sameSections, sameCourses, days, free, bothOff };
}
