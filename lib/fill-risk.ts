// How hard a course has been to get in past terms, so the planner can say "register for this one first".
// Two kinds of evidence, both from before the term being planned: how fast it filled once registration
// opened (course_fill, see lib/seat-race.ts), and how full it was when an earlier term was last read
// (course_offerings and the bundled hard-courses snapshot). Pure on purpose: the caller gathers the rows
// (lib/history-db.ts) and the tests cover the thresholds.

import { hoursToFill } from "@/lib/seat-race";
import { isFull, MIN_SEATS } from "@/lib/hard-courses";

// "hours" filled within about six hours of seats starting to go, "day" within a day, "days" within three;
// "full" only says the course was (nearly) full when read, with no timing seen.
export type FillRiskLevel = "hours" | "day" | "days" | "full";
export type FillRisk = { level: FillRiskLevel; hours: number | null; term: string };

// One course_fill row per earlier term; the dates are ISO strings, null when that moment was not seen.
export type RaceRow = { term: string; startedAt: string | null; filledAt: string | null; totalSeats: number };
// One end-of-term reading per earlier term the course ran in.
export type EndingRow = { term: string; sectionCount: number; totalSeats: number; openSeats: number | null; fullSections: number | null };

const FAST_HOURS = 6, DAY_HOURS = 24, DAYS_HOURS = 72;

// Small courses are left out, as the hard-courses list is: a few students fill a 20-seat seminar without
// saying anything about registration morning.
const worthJudging = (seats: number) => seats >= MIN_SEATS;
const fullWhenRead = (ending: EndingRow) =>
  worthJudging(ending.totalSeats) &&
  ((ending.openSeats !== null && isFull(ending.totalSeats, ending.openSeats)) ||
    (ending.fullSections !== null && ending.sectionCount > 0 && ending.fullSections >= ending.sectionCount));

// The strongest answer: null when neither kind of evidence says the course was ever hard to get. A race
// slower than three days is not urgent, so it defers to how full the endings were.
export function courseFillRisk(races: RaceRow[], endings: EndingRow[]): FillRisk | null {
  const raced = races
    .filter((race) => worthJudging(race.totalSeats))
    .map((race) => ({ term: race.term, hours: hoursToFill(race) }))
    .filter((race): race is { term: string; hours: number } => race.hours !== null)
    .sort((a, b) => a.hours - b.hours);
  if (raced.length && raced[0]!.hours <= DAYS_HOURS) {
    const fastest = raced[0]!;
    return { level: fastest.hours <= FAST_HOURS ? "hours" : fastest.hours <= DAY_HOURS ? "day" : "days", hours: fastest.hours, term: fastest.term };
  }
  // Full before TerpPlan watched counts as full when read: it did fill, only the timing was not seen.
  const lastFull = [
    ...endings.filter(fullWhenRead).map((ending) => ending.term),
    ...races.filter((race) => worthJudging(race.totalSeats) && race.filledAt && !race.startedAt).map((race) => race.term),
  ].sort().at(-1);
  return lastFull ? { level: "full", hours: null, term: lastFull } : null;
}
