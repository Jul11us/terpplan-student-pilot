// Final exam times worked out from a schedule, by the Registrar's rules:
// https://registrar.umd.edu/registration/register-classes/final-exams (fall and spring pages, checked 2026-10-19).
// - Common exams: every section of the course sits the exam at one time (CMSC131, MATH140, ...).
// - Standard exams: by the days and start time of the class (MWF/MW/M/W/F or TuTh/Tu/Th).
// - Classes starting at 6pm or later: the exam is at class time, on the exam-week day matching the first day it meets.
// The Registrar posts the exact day, time and room in the Schedule of Classes six weeks before the term ends; this is
// only a guide until then. A term whose table is not posted yet is estimated from the latest one of the same season
// (the current term's dates, slots and list of common exams may differ).
// Each term: add its table here once the Registrar posts it (npm run check:term says when a new term appears).

import { isAsyncOnline, meetingDays, meetingMinutes, type MeetingTime } from "@/lib/meeting-time";
import type { MyWeek } from "@/lib/my-week";
import { termEnded } from "@/lib/term-calendar";

// Exam days in order. Both posted terms run Monday to Friday, then the next Monday.
export const EXAM_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Mon"] as const;

export type ExamTime = { day: number; start: number; end: number };

type ExamTable = {
  // Calendar date of each exam day, in the order of EXAM_WEEKDAYS.
  dates: string[];
  common: Record<string, ExamTime>;
};

const h = (clock: string) => { const [hour, minute] = clock.split(":").map(Number); return hour * 60 + minute; };
const slot = (day: number, start: string, end: string): ExamTime => ({ day, start: h(start), end: h(end) });

// Standard slots by class start time (first to last start minute, inclusive), the same in fall and spring.
const MWF_SLOTS: Array<[number, number, ExamTime]> = [
  [h("8:00"), h("8:45"), slot(0, "13:30", "15:30")],
  [h("9:00"), h("9:45"), slot(3, "13:30", "15:30")],
  [h("10:00"), h("10:45"), slot(5, "10:30", "12:30")],
  [h("11:00"), h("11:45"), slot(2, "10:30", "12:30")],
  [h("12:00"), h("12:45"), slot(4, "10:30", "12:30")],
  [h("13:00"), h("13:45"), slot(1, "16:00", "18:00")],
  [h("14:00"), h("14:45"), slot(3, "16:00", "18:00")],
  [h("15:00"), h("15:45"), slot(2, "16:00", "18:00")],
  [h("16:00"), h("16:45"), slot(5, "16:00", "18:00")],
  [h("17:00"), h("17:45"), slot(3, "18:30", "20:30")],
];
const TUTH_SLOTS: Array<[number, number, ExamTime]> = [
  [h("8:00"), h("9:15"), slot(4, "13:30", "15:30")],
  [h("9:30"), h("10:45"), slot(1, "10:30", "12:30")],
  [h("11:00"), h("12:15"), slot(0, "10:30", "12:30")],
  [h("12:30"), h("13:45"), slot(4, "16:00", "18:00")],
  [h("14:00"), h("15:15"), slot(3, "10:30", "12:30")],
  [h("15:30"), h("16:45"), slot(5, "13:30", "15:30")],
  [h("17:00"), h("17:45"), slot(4, "18:30", "20:30")],
];
const EVENING_FROM = h("18:00");

const LANGUAGE_COURSES = ["FREN103", "FREN203", "FREN204", "GERS103", "GERS203", "ITAL103", "ITAL203", "JAPN101", "JAPN102", "JAPN201", "JAPN202", "KORA101", "KORA102", "KORA201", "KORA202", "RUSS101", "RUSS102", "RUSS201", "RUSS202"];
const MATH_COURSES = ["003", "107", "113", "115", "120", "121", "135", "136", "140", "140H", "141", "141H", "212", "213", "214", "240", "241", "241H", "243", "246", "246H"].map((number) => "MATH" + number);

function common(groups: Array<[string[], ExamTime]>) {
  const table: Record<string, ExamTime> = {};
  for (const [courses, time] of groups) for (const course of courses) table[course] = time;
  return table;
}

export const EXAM_TABLES: Record<string, ExamTable> = {
  // Spring 2026.
  "202601": {
    dates: ["2026-05-11", "2026-05-12", "2026-05-13", "2026-05-14", "2026-05-15", "2026-05-18"],
    common: common([
      [["BIOM301", "ENCE305", "ENMA300", "ENME382", "QMMS451"], slot(0, "13:30", "15:30")],
      [["BMGT230"], slot(0, "19:00", "21:00")],
      [["PHYS131", "PHYS132"], slot(0, "18:30", "20:30")],
      [[...MATH_COURSES, "STAT100", "DATA100"], slot(0, "16:00", "18:00")],
      [["BCHM463", "CHEM131", "CHEM231", "CHEM241", "CHEM271", "CMSC422", "INST314"], slot(1, "13:30", "15:30")],
      [["BMGT221", "CMSC132", "CMSC216", "CMSC330", "CMSC434", "CMSC470", "ENES221"], slot(1, "18:30", "20:30")],
      [["BMGT220", "NFSC100", "PHYS161", "PHYS260", ...LANGUAGE_COURSES], slot(2, "13:30", "15:30")],
      [["CMSC131", "CMSC133", "CMSC250", "CMSC351", "CMSC421", "ENES102", "ENES220"], slot(2, "18:30", "20:30")],
      [["ENES232", "PHYS270", "PSYC200", "PSYC300"], slot(3, "18:30", "20:30")],
      [["ECON200", "ENCE302"], slot(4, "18:30", "20:30")],
    ]),
  },
  // Fall 2026.
  "202608": {
    dates: ["2026-12-14", "2026-12-15", "2026-12-16", "2026-12-17", "2026-12-18", "2026-12-21"],
    common: common([
      [["BIOM301", "ENCE305", "ENMA300", "ENME382", "QMMS451"], slot(0, "13:30", "15:30")],
      [["BMGT230"], slot(0, "19:00", "21:00")],
      [["CHEM277"], slot(0, "18:30", "20:30")],
      [[...MATH_COURSES, "STAT100", "DATA100"], slot(0, "16:00", "18:00")],
      [["BCHM463", "CHEM131", "CHEM134", "CHEM231", "CHEM241", "CHEM271", "INST314"], slot(1, "13:30", "15:30")],
      [["BMGT221", "CMSC132", "CMSC216", "CMSC330", "CMSC434", "ENES221"], slot(1, "18:30", "20:30")],
      [["PHYS131", "PHYS132", "PHYS270"], slot(2, "8:00", "10:00")],
      [["BMGT220", "NFSC100", "PHYS161", "PHYS260", ...LANGUAGE_COURSES], slot(2, "13:30", "15:30")],
      [["CMSC131", "CMSC133", "CMSC250", "CMSC351", "ENES102", "ENES220"], slot(2, "18:30", "20:30")],
      [["ENES232", "PSYC200", "PSYC300"], slot(3, "18:30", "20:30")],
      [["NEUR200"], slot(4, "13:30", "15:30")],
      [["ENCE302"], slot(4, "18:30", "20:30")],
    ]),
  },
};

// The table for a term: its own once posted, else the latest posted term of the same season (spring or fall).
// Winter and summer exams are set by each class, so they have none.
export function examTableFor(term: string): { table: ExamTable; from: string; official: boolean } | null {
  if (EXAM_TABLES[term]) return { table: EXAM_TABLES[term], from: term, official: true };
  const season = term.slice(4);
  if (season !== "01" && season !== "08") return null;
  const from = Object.keys(EXAM_TABLES).filter((code) => code.endsWith(season) && code < term).sort().at(-1);
  return from ? { table: EXAM_TABLES[from], from, official: false } : null;
}

// Whether a term's exams are over by a date: after its last exam day when posted, else once its classes have ended.
export function examsOver(term: string, date: Date) {
  const last = EXAM_TABLES[term]?.dates.at(-1);
  if (!last) return termEnded(term, date);
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return day > last;
}

export type ExamMeeting = { days: string[]; start: number | null; end: number | null; kind: string | null; online: boolean };
export type ExamCourse = { courseId: string; meetings: ExamMeeting[] };

export type CourseExam =
  | { courseId: string; kind: "common" | "standard" | "evening"; time: ExamTime }
  // online: no meeting time, so no exam slot (the instructor arranges it); unknown: the class pattern fits no rule.
  | { courseId: string; kind: "online" | "unknown" };

// Only the weekday patterns explicitly covered by the Registrar's standard tables.
const MWF_PATTERNS = new Set(["Mon,Wed,Fri", "Mon,Wed", "Mon", "Wed", "Fri"]);
const TUTH_PATTERNS = new Set(["Tue,Thu", "Tue", "Thu"]);
const CLASS_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function examFor(course: ExamCourse, table: ExamTable): CourseExam {
  const courseId = course.courseId.toUpperCase();
  if (table.common[courseId]) return { courseId, kind: "common", time: table.common[courseId] };
  // The exam follows the class itself, not its discussion or lab.
  const timed = course.meetings.filter((meeting) => !meeting.online && meeting.days.length && meeting.start !== null);
  const lectures = timed.filter((meeting) => !/discussion|lab/i.test(meeting.kind ?? ""));
  if (!timed.length) return { courseId, kind: course.meetings.some((meeting) => meeting.online) ? "online" : "unknown" };
  if (!lectures.length) return { courseId, kind: "unknown" };
  const start = lectures[0].start!;
  if (lectures.some((meeting) => meeting.start !== start)) return { courseId, kind: "unknown" };
  const days = [...new Set(lectures.flatMap((meeting) => meeting.days))];
  if (start >= EVENING_FROM) {
    const first = ["Mon", "Tue", "Wed", "Thu", "Fri"].find((day) => days.includes(day));
    if (!first || days.some((day) => day === "Sat" || day === "Sun")) return { courseId, kind: "unknown" };
    const end = Math.max(...lectures.map((meeting) => meeting.end ?? start + 120));
    return { courseId, kind: "evening", time: { day: EXAM_WEEKDAYS.indexOf(first as (typeof EXAM_WEEKDAYS)[number]), start, end: Math.max(end, start + 60) } };
  }
  const pattern = [...days].sort((a, b) => CLASS_WEEKDAYS.indexOf(a) - CLASS_WEEKDAYS.indexOf(b)).join(",");
  const slots = MWF_PATTERNS.has(pattern) ? MWF_SLOTS : TUTH_PATTERNS.has(pattern) ? TUTH_SLOTS : null;
  const found = slots?.find(([from, to]) => from <= start && start <= to);
  return found ? { courseId, kind: "standard", time: found[2] } : { courseId, kind: "unknown" };
}

export type ExamPlan = {
  term: string;
  // The term whose posted table was used, and whether that is this term's own.
  from: string;
  official: boolean;
  dates: string[];
  exams: CourseExam[];
  // Pairs of courses whose exams overlap.
  clashes: Array<[string, string]>;
  // Exam days with three or more exams (four or more can be moved, at the student's request).
  busyDays: Array<{ day: number; courseIds: string[] }>;
};

export function examPlan(term: string, courses: ExamCourse[]): ExamPlan | null {
  const found = examTableFor(term);
  if (!found || !courses.length) return null;
  const seen = new Set<string>();
  const exams = courses.filter((course) => !seen.has(course.courseId) && seen.add(course.courseId)).map((course) => examFor(course, found.table));
  const timed = exams.filter((exam): exam is Extract<CourseExam, { time: ExamTime }> => "time" in exam)
    .sort((a, b) => a.time.day - b.time.day || a.time.start - b.time.start);
  const clashes: Array<[string, string]> = [];
  for (let i = 0; i < timed.length; i += 1) for (let j = i + 1; j < timed.length; j += 1) {
    const a = timed[i].time, b = timed[j].time;
    if (a.day === b.day && a.start < b.end && b.start < a.end) clashes.push([timed[i].courseId, timed[j].courseId]);
  }
  const busyDays = EXAM_WEEKDAYS.map((_, day) => ({ day, courseIds: timed.filter((exam) => exam.time.day === day).map((exam) => exam.courseId) }))
    .filter((entry) => entry.courseIds.length >= 3);
  return { term, from: found.from, official: found.official, dates: found.table.dates, exams: [...timed, ...exams.filter((exam) => !("time" in exam))], clashes, busyDays };
}

type SectionLike = { course_id: string; meetings?: (MeetingTime & { classtype?: string | null })[] | null };

export function examCoursesFromSections(sections: SectionLike[]): ExamCourse[] {
  return sections.map((section) => ({
    courseId: section.course_id,
    meetings: (section.meetings ?? []).map((meeting) => ({ days: meetingDays(meeting.days), start: meetingMinutes(meeting.start_time), end: meetingMinutes(meeting.end_time), kind: meeting.classtype?.trim() || null, online: isAsyncOnline(meeting) })),
  }));
}

// My week keeps only timed meetings; a section listed as unscheduled is online or still to be announced.
export function examCoursesFromWeek(week: MyWeek): ExamCourse[] {
  const courses = new Map<string, ExamCourse>();
  for (const item of week.classes) {
    const course = courses.get(item.courseId) ?? { courseId: item.courseId, meetings: [] };
    course.meetings.push({ days: item.days, start: item.start, end: item.end, kind: item.kind, online: false });
    courses.set(item.courseId, course);
  }
  for (const sectionId of week.unscheduled) {
    const courseId = sectionId.split("-")[0];
    if (!courses.has(courseId)) courses.set(courseId, { courseId, meetings: [{ days: [], start: null, end: null, kind: null, online: true }] });
  }
  return [...courses.values()];
}
