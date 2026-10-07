import assert from "node:assert/strict";
import test from "node:test";
import { countdown, easternMoment, formatCountdown, registrationCourses } from "../lib/registration-day.ts";

test("a registration time is read as Eastern time, in and out of daylight saving", () => {
  assert.equal(easternMoment("2026-11-02", "08:30").toISOString(), "2026-11-02T13:30:00.000Z", "EST, after the clocks go back");
  assert.equal(easternMoment("2026-10-20", "08:30").toISOString(), "2026-10-20T12:30:00.000Z", "EDT");
  assert.equal(easternMoment("2027-03-14", "12:00").toISOString(), "2027-03-14T16:00:00.000Z", "the day the clocks go forward");
  assert.equal(easternMoment("2026-11-02", ""), null);
  assert.equal(easternMoment("Nov 2", "08:30"), null);
});

test("the countdown runs to the time, says it is open for six hours, then that it has passed", () => {
  const target = new Date("2026-11-02T13:30:00Z");
  const left = countdown(target, new Date("2026-10-30T10:00:00Z"));
  assert.deepEqual(left, { state: "upcoming", days: 3, hours: 3, minutes: 30, seconds: 0 });
  assert.equal(formatCountdown(left, "zh"), "3 天 3 小时");
  assert.equal(formatCountdown(countdown(target, new Date("2026-11-02T11:00:00Z")), "en"), "2h 30m");
  assert.equal(formatCountdown(countdown(target, new Date("2026-11-02T13:20:15Z")), "zh"), "9 分 45 秒");
  assert.deepEqual(countdown(target, new Date("2026-11-02T15:00:00Z")), { state: "open" });
  assert.deepEqual(countdown(target, new Date("2026-11-03T13:30:00Z")), { state: "past" });
});

test("each chosen course lists the other options' sections of that course as its backups", () => {
  const section = (course, number, open = 3) => ({ course_id: course, course_title: course + " title", section_id: `${course}-${number}`, open_seats: open });
  const chosen = [section("MATH141", "0131"), section("COMM107", "2201", 0)];
  const others = [[section("MATH141", "0211"), section("COMM107", "2201", 0)], [section("MATH141", "0211"), section("MATH141", "0311", 0), section("PSYC100", "0101")]];
  assert.deepEqual(registrationCourses(chosen, others), [
    { courseId: "MATH141", title: "MATH141 title", section: "0131", full: false, backups: [{ section: "0211", full: false }, { section: "0311", full: true }] },
    { courseId: "COMM107", title: "COMM107 title", section: "2201", full: true, backups: [] },
  ]);
});
