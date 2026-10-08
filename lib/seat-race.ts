// "How fast do courses fill": which courses the background run reads, and what the readings say.
//
// Every course students look at is read about every two hours. The ones that matter most during
// registration (the hardest courses to get, the most planned on TerpPlan, the watched ones) are read every
// half hour, so a course that fills within hours of opening shows when it filled to the half hour.
//
// For each course the run also keeps one small row (course_fill): seats taken when TerpPlan first read it,
// when more seats were first taken than that (registration for it has started), and when it first became
// full. "Filled N hours after it started" is the difference.

import { isFull } from "@/lib/hard-courses";

export const READING_MINUTES = 120;
export const PRIORITY_READING_MINUTES = 30;

// Courses whose last reading is old enough, the priority ones first. Within each kind, never read first,
// then the longest ago.
export function pickCoursesToTrack(input: { candidates: Iterable<string>; priority: Iterable<string>; lastRead: Map<string, string>; now: Date; limit: number }) {
  const priority = new Set(input.priority);
  const all = new Set([...input.candidates, ...priority]);
  const due: Array<{ id: string; urgent: boolean; last: number }> = [];
  for (const id of all) {
    const urgent = priority.has(id);
    const lastText = input.lastRead.get(id);
    const last = lastText ? Date.parse(lastText) : 0;
    const minutes = urgent ? PRIORITY_READING_MINUTES : READING_MINUTES;
    // A couple of minutes' slack, so a run that starts a little early does not skip a course for a whole cycle.
    if (last && input.now.getTime() - last < (minutes - 2) * 60_000) continue;
    due.push({ id, urgent, last });
  }
  due.sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.last - b.last || a.id.localeCompare(b.id));
  return due.slice(0, input.limit).map((item) => item.id);
}

export type FillState = { baseTaken: number; totalSeats: number; startedAt: string | null; filledAt: string | null; lastAt: string };
export type SeatReading = { totalSeats: number; openSeats: number; at: string };

// Updates a course's row with a new reading. A course already full at its first reading never gets a
// start time (it filled before TerpPlan watched it), so it is never ranked as "fastest".
export function nextFill(state: FillState | null, reading: SeatReading): FillState {
  const taken = Math.max(0, reading.totalSeats - reading.openSeats);
  const full = reading.totalSeats > 0 && isFull(reading.totalSeats, reading.openSeats);
  if (!state) return { baseTaken: taken, totalSeats: reading.totalSeats, startedAt: null, filledAt: full ? reading.at : null, lastAt: reading.at };
  const startedAt = state.startedAt ?? (!state.filledAt && taken > state.baseTaken ? reading.at : null);
  const filledAt = state.filledAt ?? (full ? reading.at : null);
  return { baseTaken: state.baseTaken, totalSeats: reading.totalSeats, startedAt, filledAt, lastAt: reading.at };
}

// Hours from the first seats taken to full; null unless both are known.
export function hoursToFill(state: Pick<FillState, "startedAt" | "filledAt">) {
  if (!state.startedAt || !state.filledAt) return null;
  return Math.max(0, (Date.parse(state.filledAt) - Date.parse(state.startedAt)) / 3_600_000);
}

// Seats taken over a window, per course, from readings in that window (oldest to newest per course):
// newest taken minus oldest taken. Courses with one reading or none taken are left out.
export function seatsTakenInWindow(rows: Array<{ courseId: string; checkedAt: string; totalSeats: number; openSeats: number }>) {
  const byCourse = new Map<string, typeof rows>();
  for (const row of rows) byCourse.set(row.courseId, [...(byCourse.get(row.courseId) ?? []), row]);
  const result: Array<{ courseId: string; taken: number; totalSeats: number; openSeats: number }> = [];
  for (const [courseId, list] of byCourse) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));
    const first = list[0]!, last = list[list.length - 1]!;
    const taken = (last.totalSeats - last.openSeats) - (first.totalSeats - first.openSeats);
    if (taken > 0) result.push({ courseId, taken, totalSeats: last.totalSeats, openSeats: last.openSeats });
  }
  return result.sort((a, b) => b.taken - a.taken || a.courseId.localeCompare(b.courseId));
}
