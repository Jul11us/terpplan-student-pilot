// Identifies a plan's inputs (courses, instructor picks, required/excluded sections, term).
// Generated options and the Gen Ed conflict reference are only valid for the key they were made with.
export type PlanKeyCourse = { courseId: string; instructors?: string[]; pinnedSectionId?: string; excludedSectionIds?: string[] };

export function planKey(courses: PlanKeyCourse[], term: string) {
  return courses.map((course) => [course.courseId, course.instructors?.join("+"), course.pinnedSectionId, course.excludedSectionIds?.join("+")].join(":")).join("|") + "@" + term;
}
