import assert from "node:assert/strict";
import test from "node:test";
import { hoursToFill, nextFill, pickCoursesToTrack, seatsTakenInWindow } from "../lib/seat-race.ts";

const now = new Date("2026-11-10T15:00:00Z");
const ago = (minutes) => new Date(now.getTime() - minutes * 60_000).toISOString();

test("priority courses are read every half hour, the rest every two hours, never-read first", () => {
  const lastRead = new Map([["HOT1", ago(35)], ["HOT2", ago(10)], ["COLD1", ago(60)], ["COLD2", ago(130)], ["COLD3", ago(200)]]);
  const ids = pickCoursesToTrack({ candidates: ["COLD1", "COLD2", "COLD3", "NEW1"], priority: ["HOT1", "HOT2", "HOT3"], lastRead, now, limit: 10 });
  assert.deepEqual(ids, ["HOT3", "HOT1", "NEW1", "COLD3", "COLD2"]);
  assert.deepEqual(pickCoursesToTrack({ candidates: ["COLD1", "COLD2", "COLD3", "NEW1"], priority: ["HOT1", "HOT2", "HOT3"], lastRead, now, limit: 3 }), ["HOT3", "HOT1", "NEW1"]);
  // A run that starts a minute early still reads a half-hourly course.
  assert.deepEqual(pickCoursesToTrack({ candidates: [], priority: ["HOT1"], lastRead: new Map([["HOT1", ago(29)]]), now, limit: 5 }), ["HOT1"]);
});

test("a course's fill row: start when more seats are taken, full at most 2% left, first fill kept", () => {
  let state = nextFill(null, { totalSeats: 100, openSeats: 60, at: ago(300) });
  assert.deepEqual(state, { baseTaken: 40, totalSeats: 100, startedAt: null, filledAt: null, lastAt: ago(300) });
  state = nextFill(state, { totalSeats: 100, openSeats: 60, at: ago(270) });
  assert.equal(state.startedAt, null, "nothing taken yet");
  state = nextFill(state, { totalSeats: 100, openSeats: 30, at: ago(240) });
  state = nextFill(state, { totalSeats: 100, openSeats: 2, at: ago(120) });
  assert.equal(state.startedAt, ago(240));
  assert.equal(state.filledAt, ago(120));
  assert.equal(hoursToFill(state), 2);
  state = nextFill(state, { totalSeats: 100, openSeats: 9, at: ago(60) });
  assert.equal(state.filledAt, ago(120), "seats freeing up later does not move the fill time");
  // Full at its first reading: filled before TerpPlan watched it, so no start and no hours.
  const already = nextFill(nextFill(null, { totalSeats: 50, openSeats: 0, at: ago(30) }), { totalSeats: 50, openSeats: 0, at: ago(0) });
  assert.equal(already.startedAt, null);
  assert.equal(hoursToFill(already), null);
  // No sections yet (0 seats) is never "full".
  assert.equal(nextFill(null, { totalSeats: 0, openSeats: 0, at: ago(0) }).filledAt, null);
});

test("seats taken over the window, most first", () => {
  const rows = [
    { courseId: "A", checkedAt: ago(1400), totalSeats: 100, openSeats: 80 },
    { courseId: "A", checkedAt: ago(10), totalSeats: 100, openSeats: 20 },
    { courseId: "B", checkedAt: ago(10), totalSeats: 50, openSeats: 5 },
    { courseId: "B", checkedAt: ago(700), totalSeats: 50, openSeats: 25 },
    { courseId: "C", checkedAt: ago(10), totalSeats: 50, openSeats: 5 },
    { courseId: "D", checkedAt: ago(700), totalSeats: 50, openSeats: 5 },
    { courseId: "D", checkedAt: ago(10), totalSeats: 50, openSeats: 10 },
  ];
  assert.deepEqual(seatsTakenInWindow(rows), [{ courseId: "A", taken: 60, totalSeats: 100, openSeats: 20 }, { courseId: "B", taken: 20, totalSeats: 50, openSeats: 5 }]);
});
