import assert from "node:assert/strict";
import test from "node:test";
import { groupSections, ownMeetings } from "../lib/section-groups.ts";

const lecture = (days, start, end, building = "IRB", room = "0324") => ({ days, start_time: start, end_time: end, building, room });

test("sections with the same instructor and lecture form one group; the lecture is shared", () => {
  const sections = [
    { section_id: "A-0101", instructors: ["Nora"], meetings: [lecture("MWF", "1:00pm", "1:50pm"), lecture("TuTh", "9:30am", "10:20am", "CSI", "2118")] },
    { section_id: "A-0102", instructors: ["Nora"], meetings: [lecture("MWF", "1:00pm", "1:50pm"), lecture("TuTh", "12:30pm", "1:20pm", "CSI", "2107")] },
    { section_id: "A-0201", instructors: ["Elias"], meetings: [lecture("MW", "2:00pm", "3:15pm", "CSI", "1115"), lecture("TuTh", "2:00pm", "2:50pm")] },
    { section_id: "A-0301", instructors: ["Nora"], meetings: [lecture("MWF", "3:00pm", "3:50pm")] },
  ];
  const groups = groupSections(sections);
  assert.deepEqual(groups.map((group) => group.sections.map((section) => section.section_id)), [["A-0101", "A-0102"], ["A-0201"], ["A-0301"]]);
  assert.deepEqual(groups[0].shared.map((meeting) => meeting.start_time), ["1:00pm"]);
  assert.deepEqual(groups[1].shared, []);
  assert.deepEqual(ownMeetings(sections[1], groups[0].shared).map((meeting) => meeting.start_time), ["12:30pm"]);
});

test("sections without a set time or an instructor are never grouped", () => {
  const groups = groupSections([
    { instructors: ["Nora"], meetings: [{ days: null, start_time: null }] },
    { instructors: ["Nora"], meetings: [{ days: null, start_time: null }] },
    { instructors: [], meetings: [lecture("MWF", "1:00pm", "1:50pm")] },
    { instructors: [], meetings: [lecture("MWF", "1:00pm", "1:50pm")] },
  ]);
  assert.equal(groups.length, 4);
});
