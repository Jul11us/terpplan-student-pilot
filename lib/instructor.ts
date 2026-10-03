// One instructor's sections this term, for the instructor page. PlanetTerp lists the courses they have
// taught; this term's sections of those courses are read from the Schedule of Classes and kept when the
// instructor is listed on them. A course they have never taught before is not found this way.

import spring2027Catalog from "@/data/202701-catalog.json";
import { getProfessorOverallGpa, getProfessorProfile, normalizeProfessorName } from "@/lib/planetterp";
import { courseIdIsValid, getCourseSectionsSnapshot, getTestudoSectionsBatch, isTestudoTerm, parseCount, sectionId, type CatalogItem, type UmdSection } from "@/lib/umd";

const titles = new Map((spring2027Catalog as CatalogItem[]).map((course) => [course.course_id, course.name]));
// PlanetTerp's course history can be long; the rest are older courses that are rarely offered again.
const MAX_COURSES = 50;
// Terms read from umd.io take one request per course.
const MAX_UMDIO_COURSES = 15;

export type InstructorSection = { sectionId: string; meetings: UmdSection["meetings"]; seats: number | null; openSeats: number | null; waitlist: number | null; instructors: string[] };
export type InstructorCourse = { courseId: string; title: string | null; sections: InstructorSection[] };

export function sectionsTaughtBy(courseId: string, sections: UmdSection[], names: string[]): InstructorSection[] {
  const wanted = new Set(names.map(normalizeProfessorName));
  return sections.filter((section) => (section.instructors ?? []).some((name) => wanted.has(normalizeProfessorName(name))))
    .map((section) => ({ sectionId: sectionId(section, courseId) ?? courseId, meetings: section.meetings ?? [], seats: parseCount(section.seats), openSeats: parseCount(section.open_seats), waitlist: parseCount(section.waitlist), instructors: section.instructors ?? [] }))
    .sort((a, b) => a.sectionId.localeCompare(b.sectionId, "en", { numeric: true }));
}

// alsoCourses: courses to check even if PlanetTerp does not list them yet (the course the student came from).
export async function instructorTerm(name: string, term: string, alsoCourses: string[] = []) {
  const profile = await getProfessorProfile(name);
  if (!profile) return { status: "unmatched" as const, name: name.trim() };
  const names = [...new Set([name, profile.name])];
  const courseIds = [...new Set([...alsoCourses, ...profile.courses])].filter(courseIdIsValid).slice(0, MAX_COURSES);
  const sectionsByCourse = isTestudoTerm(term)
    ? await getTestudoSectionsBatch(term, courseIds)
    : new Map(await Promise.all(courseIds.slice(0, MAX_UMDIO_COURSES).map(async (id) => [id, (await getCourseSectionsSnapshot(id, term).catch(() => ({ sections: [] as UmdSection[] }))).sections ?? []] as const)));
  const courses: InstructorCourse[] = [...sectionsByCourse].map(([courseId, sections]) => ({ courseId, title: titles.get(courseId) ?? null, sections: sectionsTaughtBy(courseId, sections, names) }))
    .filter((course) => course.sections.length)
    .sort((a, b) => a.courseId.localeCompare(b.courseId, "en", { numeric: true }));
  const overallGpa = await getProfessorOverallGpa(profile.name);
  return {
    status: "ok" as const,
    name: profile.name,
    averageRating: profile.averageRating,
    reviewCount: profile.reviewCount,
    sourceUrl: profile.sourceUrl,
    // Across all their courses; the course pages show the GPA for one course.
    overallGpa,
    pastCourses: profile.courses.length,
    courses,
  };
}
