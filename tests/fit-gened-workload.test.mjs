import assert from "node:assert/strict";
import test from "node:test";
import { filterResults, NO_FILTERS, scheduleFit } from "../lib/result-filters.ts";
import { sectionSlots } from "../lib/seat-summary.ts";
import { genEdCoverage, parseGenEdGroups } from "../lib/gened-categories.ts";
import { courseDifficulty, semesterWorkload } from "../lib/workload.ts";

const slot = (days, start, end, open = 5) => ({ open, meetings: [{ days, start_time: start, end_time: end }] });

test("a section fits when none of its meetings clash with the schedule or personal commitments", () => {
  const schedule = [{ days: "MWF", start_time: "10:00am", end_time: "10:50am" }, { days: "Tu", start_time: "12:00", end_time: "13:00" }];
  const slots = [slot("MWF", "10:00am", "10:50am"), slot("TuTh", "12:30pm", "1:45pm"), slot("TuTh", "2:00pm", "3:15pm"), slot("MW", "11:00am", "11:50am", 0), { open: 3, meetings: [] }];
  assert.deepEqual(scheduleFit(slots, schedule), { fit: 2, tba: 1 });
  assert.deepEqual(scheduleFit(slots, schedule, true), { fit: 1, tba: 1 }, "with open seats only, the full 11am section does not count");
  // Online work with no set time fits anything.
  assert.deepEqual(scheduleFit([{ open: 5, meetings: [{ days: null, start_time: null, end_time: null, building: "ONLINE", room: null }] }], schedule), { fit: 1, tba: 0 });
});

test("the fits filter drops only courses known to clash everywhere", () => {
  const courses = [{ course_id: "AAAA100" }, { course_id: "BBBB100" }, { course_id: "CCCC100" }, { course_id: "DDDD100" }];
  const fits = { AAAA100: { fit: 2, tba: 0 }, BBBB100: { fit: 0, tba: 0 }, CCCC100: { fit: 0, tba: 1 } };
  const kept = filterResults(courses, { ...NO_FILTERS, fitsSchedule: true }, () => undefined, () => null, (id) => fits[id]);
  assert.deepEqual(kept.map((course) => course.course_id), ["AAAA100", "CCCC100", "DDDD100"], "still-loading courses stay");
  assert.equal(filterResults(courses, NO_FILTERS, () => undefined, () => null, (id) => fits[id]).length, 4);
});

test("seat summaries carry each section's times, without Freshman Connection sections", () => {
  const slots = sectionSlots([
    { section_id: "ENGL101-0101", number: "0101", open_seats: 3, meetings: [{ days: "TuTh", start_time: "9:30am", end_time: "10:45am", building: "TWS", room: "0201", classtype: null }] },
    { section_id: "ENGL101-FC01", number: "FC01", open_seats: 9, meetings: [] },
  ]);
  assert.deepEqual(slots, [{ open: 3, meetings: [{ days: "TuTh", start_time: "9:30am", end_time: "10:45am", building: "TWS", room: "0201" }] }]);
});

test("Gen Ed groups keep \"or\" choices together, so one course is not counted twice for them", () => {
  assert.deepEqual(parseGenEdGroups("GenEd : DSHU or DSSP , DVUP"), [["DSHU", "DSSP"], ["DVUP"]]);
  assert.deepEqual(parseGenEdGroups("GenEd: DSHS, DVUP, SCIS"), [["DSHS"], ["DVUP"], ["SCIS"]]);
  assert.deepEqual(parseGenEdGroups("GenEd : "), []);
  assert.equal(genEdCoverage([["DSHU", "DSSP"]], ["DSHU", "DSSP"]), 1);
  assert.equal(genEdCoverage([["DSHU", "DSSP"], ["DVUP"]], ["DSHU", "DSSP", "DVUP"]), 2);
  assert.equal(genEdCoverage([["DSHS"], ["DVUP"]], ["DSHS", "DVUP"]), 2);
  // The strict group gets its code first: [DSHU] and [DSHU or DSSP] can still cover both.
  assert.equal(genEdCoverage([["DSHU", "DSSP"], ["DSHU"]], ["DSHU", "DSSP"]), 2);
  assert.equal(genEdCoverage([["DSHS"]], ["DVUP"]), 0);
});

test("semester workload weighs credits by how hard each course has been", () => {
  assert.equal(courseDifficulty(2.6), "hard");
  assert.equal(courseDifficulty(2.9), "moderate");
  assert.equal(courseDifficulty(3.4), "light");
  assert.equal(courseDifficulty(null), "unknown");
  const heavy = semesterWorkload([
    { courseId: "CMSC216", credits: 4, averageGpa: 2.6 }, { courseId: "MATH240", credits: 4, averageGpa: 2.7 },
    { courseId: "STAT400", credits: 3, averageGpa: 2.9 }, { courseId: "ENGL101", credits: 3, averageGpa: 3.4 },
  ]);
  assert.equal(heavy.level, "heavy", "14 credits with two hard courses weighs 18");
  assert.equal(semesterWorkload([...["CMSC216", "MATH240", "PHYS260"].map((courseId) => ({ courseId, credits: 4, averageGpa: 2.6 })), { courseId: "ENGL101", credits: 3, averageGpa: 3.4 }]).level, "veryHeavy");
  assert.deepEqual(heavy.hard.map((item) => item.courseId), ["CMSC216", "MATH240"]);
  assert.equal(semesterWorkload([{ courseId: "ENGL101", credits: 3, averageGpa: 3.4 }, { courseId: "ARTH200", credits: 3, averageGpa: 3.5 }]).level, "light");
  // Two hard courses make even a small term heavy.
  assert.equal(semesterWorkload([{ courseId: "PHYS260", credits: 3, averageGpa: 2.5 }, { courseId: "MATH241", credits: 4, averageGpa: 2.6 }]).level, "heavy");
  assert.equal(semesterWorkload([{ courseId: "XXXX100", credits: null, averageGpa: undefined }]).credits, 3, "unknown credits count as 3");
});
