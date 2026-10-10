import assert from "node:assert/strict";
import test from "node:test";
import { parsePastedSchedule, pastedTerm } from "../lib/testudo-import.ts";

// Copied from a Testudo "Student Schedule" page (name and UID removed).
const page = `Skip to Main Content
Student ScheduleMain Menu Toggle Dropdown
Testudo
Fall 2026 Term Toggle Dropdown
UID: 000000000
 Book List
 Print Schedule
8AM
9
M
LING 200 (0101)
LEC - CSI 2117
CMSC 131 (0302)
LEC - IRB 0324
UMEI 005 (0201)
LEC - SQH 1125

MATH 141 (0411)
LEC - ESJ 0224
Tu
CMSC 131 (0302)
DIS - CSI 2118
Registered Courses

 CMSC 131 (0302)
This section is face-to-face
Lec
MWF 11:00am - 11:50am EST
IRB 0324
Final
TBA
© 2015 University of Maryland`;

test("course and section from the schedule page, once each, with its term", () => {
  const { sections, term } = parsePastedSchedule(page);
  assert.deepEqual(sections, [
    { courseId: "LING200", section: "0101" },
    { courseId: "CMSC131", section: "0302" },
    { courseId: "UMEI005", section: "0201" },
    { courseId: "MATH141", section: "0411" },
  ]);
  assert.equal(term, "202608");
});

test("typed lists and other spellings", () => {
  assert.deepEqual(parsePastedSchedule("cmsc131 0302, math141-0411; ENGL101 (FC01)").sections.map((item) => `${item.courseId}-${item.section}`), ["CMSC131-0302", "MATH141-0411", "ENGL101-FC01"]);
  assert.deepEqual(parsePastedSchedule("MATH141 LECT, IRB 0324, CSI 2117").sections, [], "rooms and words are not sections");
  assert.equal(parsePastedSchedule("CMSC131 0302").term, null);
});

test("term names", () => {
  assert.equal(pastedTerm("Spring 2027 Term"), "202701");
  assert.equal(pastedTerm("summer 2027"), "202705");
  assert.equal(pastedTerm("Winter 2027"), "202612");
  assert.equal(pastedTerm("© 2015 University of Maryland"), null);
});
