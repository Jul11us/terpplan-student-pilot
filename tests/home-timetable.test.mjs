import assert from "node:assert/strict";
import test from "node:test";
import { COURSE_POOL, FIRST_DEMO_WEEK, PERSONAL_COMMITMENTS, PREFERENCES, meetingsOverlap, nextDemoWeek, planDemoWeek, weekBlocks, weekExplanation, weekSignature } from "../lib/home-timetable.ts";

function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function checkWeek(week) {
  assert.equal(week.courses.length, 5);
  assert.equal(new Set(week.courses).size, 5);
  const blocks = weekBlocks(week, "en");
  for (const block of blocks) {
    assert.ok(block.meeting.start >= 8 && block.meeting.end <= 18);
    if (!block.personal) {
      if (week.preference === "noFriday") assert.notEqual(block.meeting.day, 4);
      if (week.preference === "lateStart") assert.ok(block.meeting.start >= 10);
      if (week.preference === "earlyEnd") assert.ok(block.meeting.end <= 15);
    }
  }
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) assert.equal(meetingsOverlap(blocks[i].meeting, blocks[j].meeting), false, `${blocks[i].label} overlaps ${blocks[j].label}`);
  }
}

test("the same five sample courses fit every personal commitment and time preference", () => {
  for (let own = 0; own < PERSONAL_COMMITMENTS.length; own++) {
    for (const preference of Object.keys(PREFERENCES)) {
      for (let seed = 1; seed <= 12; seed++) {
        const week = planDemoWeek({ ...FIRST_DEMO_WEEK, own, preference }, random(seed));
        assert.ok(week);
        assert.deepEqual(week.courses, FIRST_DEMO_WEEK.courses, "replanning must preserve all requested courses");
        checkWeek(week);
      }
    }
  }
});

test("extended playback produces distinct valid schedules and uses the whole course pool", () => {
  const rng = random(1234);
  let week = FIRST_DEMO_WEEK;
  let recent = [weekSignature(week)];
  const seen = new Set(recent);
  const courses = new Set(week.courses);
  for (let step = 0; step < 600; step++) {
    const next = nextDemoWeek(week, step, recent, rng);
    const signature = weekSignature(next);
    assert.notEqual(signature, weekSignature(week), `step ${step} must visibly change`);
    assert.ok(!recent.includes(signature), "do not immediately repeat a schedule");
    checkWeek(next);
    assert.ok(weekExplanation(week, next, "en"));
    assert.ok(weekExplanation(week, next, "zh"));
    if (step % 6 === 0 || step % 6 === 4) assert.deepEqual(next.courses, week.courses, "section swaps must preserve courses");
    next.courses.forEach((id) => courses.add(id));
    seen.add(signature);
    recent = [...recent.slice(-11), signature];
    week = next;
  }
  assert.ok(seen.size > 550);
  assert.equal(courses.size, COURSE_POOL.length);
});

test("impossible candidates are rejected, and explanations match the visible change", () => {
  assert.equal(planDemoWeek({ ...FIRST_DEMO_WEEK, courses: ["UNKNOWN"] }), null);
  const moved = { ...FIRST_DEMO_WEEK, own: 1 };
  assert.equal(weekExplanation(FIRST_DEMO_WEEK, moved, "zh"), PERSONAL_COMMITMENTS[1].explanation.zh);
  const friday = { ...FIRST_DEMO_WEEK, preference: "noFriday" };
  assert.match(weekExplanation(FIRST_DEMO_WEEK, friday, "zh"), /已避开周五/);
  const replacement = { ...FIRST_DEMO_WEEK, courses: ["SOCY100", ...FIRST_DEMO_WEEK.courses.slice(1)] };
  assert.match(weekExplanation(FIRST_DEMO_WEEK, replacement, "zh"), /MATH141 换为 SOCY100/);
});
