// Course search over a bundled catalog, for the planner's search box and the four-year plan.

type Matchable = { course_id: string; name: string; department?: string };

// Course codes beat titles: "MATH" should list MATH courses before AMSC "Mathematical Modeling".
// Rank: exact code, code prefix, code contains, a title word starting with the query, anything else.
export function matchCourses<T extends Matchable>(courses: T[], query: string, limit: number): T[] {
  const text = query.trim().toLowerCase();
  const compact = text.replace(/\s+/g, "");
  if (text.length < 2) return [];
  const rank = (course: T) => {
    const id = course.course_id.toLowerCase().replace(/\s+/g, "");
    if (id === compact) return 0;
    if (id.startsWith(compact)) return 1;
    if (id.includes(compact)) return 2;
    if (course.name.toLowerCase().split(/[^a-z0-9]+/).some((word) => word.startsWith(text))) return 3;
    return 4;
  };
  return courses
    .filter((course) => `${course.course_id} ${course.name} ${course.department ?? ""}`.toLowerCase().includes(text) || course.course_id.toLowerCase().replace(/\s+/g, "").includes(compact))
    .map((course) => ({ course, rank: rank(course) }))
    .sort((a, b) => a.rank - b.rank || a.course.course_id.localeCompare(b.course.course_id, "en", { numeric: true }))
    .slice(0, limit)
    .map(({ course }) => course);
}
