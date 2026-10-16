// The term shown to a first-time visitor, so the tool explains itself before anything is connected.
//
// It lives here rather than beside the page so the tests can run it through the real engines: a
// sample that produced a broken screen would be the worst possible first impression, and this is
// the only way to notice.
import type { CanvasAssignment, CanvasGroup, ManualItem, Scheme } from "@/lib/grades/grading";

export type SampleCourse = {
  id: string;
  code: string;
  title: string;
  credits: number;
  source: "sample";
  canvasCurrentScore: number;
  canvasCurrentGrade: string;
  scheme: Scheme;
  canvas: { groups: CanvasGroup[]; items: CanvasAssignment[] };
  manualItems: ManualItem[];
  overrides: { letter?: string | null; excludedFromGpa?: boolean; dropLower?: boolean };
};

export function sampleTerm(): SampleCourse[] {
  return [
    {
      id: "sample-cmsc132", code: "CMSC132", title: "Object-Oriented Programming II", credits: 4, source: "sample",
      canvasCurrentScore: 88.4, canvasCurrentGrade: "B+",
      scheme: {
        source: "syllabus", confirmed: true, scaleSource: "syllabus",
        categories: [
          { id: "p", name: "Projects", weight: 30, canvasGroupId: 4101 },
          { id: "h", name: "Homework", weight: 15, dropLowest: 1, canvasGroupId: 4102 },
          { id: "m1", name: "Midterm Exam 1", weight: 15, canvasGroupId: 4103 },
          { id: "m2", name: "Midterm Exam 2", weight: 15, canvasGroupId: 4103 },
          { id: "f", name: "Final Exam", weight: 25, canvasGroupId: 4104 },
        ],
      },
      canvas: {
        groups: [
          { id: 4101, name: "Projects", weight: 30, position: 1 },
          { id: 4102, name: "Homework", weight: 15, position: 2 },
          { id: 4103, name: "Midterms", weight: 30, position: 3 },
          { id: 4104, name: "Final", weight: 25, position: 4 },
        ],
        items: [
          { id: 1, name: "Project 1", assignment_group_id: 4101, points_possible: 100, score: 92, missing: false, due_at: null, html_url: null },
          { id: 2, name: "Project 2", assignment_group_id: 4101, points_possible: 100, score: 85, missing: false, due_at: null, html_url: null },
          { id: 3, name: "Homework 1", assignment_group_id: 4102, points_possible: 20, score: 18, missing: false, due_at: null, html_url: null },
          { id: 4, name: "Homework 2", assignment_group_id: 4102, points_possible: 20, score: 12, missing: false, due_at: null, html_url: null },
          { id: 5, name: "Midterm Exam 1", assignment_group_id: 4103, points_possible: 100, score: 88, missing: false, due_at: null, html_url: null },
          { id: 6, name: "Midterm Exam 2", assignment_group_id: 4103, points_possible: 100, score: 81, missing: false, due_at: null, html_url: null },
          { id: 7, name: "Final Exam", assignment_group_id: 4104, points_possible: 200, score: null, missing: false, due_at: null, html_url: null },
        ],
      },
      manualItems: [], overrides: {},
    },
    {
      id: "sample-math141", code: "MATH141", title: "Calculus II", credits: 4, source: "sample",
      canvasCurrentScore: 79.1, canvasCurrentGrade: "C+",
      scheme: {
        source: "syllabus", confirmed: true, scaleSource: "syllabus",
        categories: [
          { id: "w", name: "WebAssign Homework", weight: 40, canvasGroupId: 4201 },
          { id: "q", name: "Quizzes", weight: 20, dropLowest: 1, canvasGroupId: 4202 },
          { id: "f", name: "Final Exam", weight: 40, canvasGroupId: 4203 },
        ],
      },
      canvas: {
        groups: [
          { id: 4201, name: "WebAssign", weight: 40, position: 1 },
          { id: 4202, name: "Quizzes", weight: 20, position: 2 },
          { id: 4203, name: "Final Exam", weight: 40, position: 3 },
        ],
        items: [
          { id: 21, name: "WebAssign 1", assignment_group_id: 4201, points_possible: 10, score: 10, missing: false, due_at: null, html_url: null },
          { id: 22, name: "WebAssign 2", assignment_group_id: 4201, points_possible: 10, score: 7, missing: false, due_at: null, html_url: null },
          { id: 23, name: "Quiz 1", assignment_group_id: 4202, points_possible: 20, score: 14, missing: false, due_at: null, html_url: null },
          { id: 24, name: "Quiz 2", assignment_group_id: 4202, points_possible: 20, score: 17, missing: false, due_at: null, html_url: null },
          { id: 25, name: "Final Exam", assignment_group_id: 4203, points_possible: 200, score: null, missing: false, due_at: null, html_url: null },
        ],
      },
      manualItems: [], overrides: {},
    },
  ];
}
