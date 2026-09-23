import { generateOptions, type PlanCourse, type PlanPreferences, type PlanWarning } from "@/lib/planner";
import { getProfessorSummaries } from "@/lib/planetterp";
import { courseIdIsValid, DEFAULT_TERM, getCourse, sectionId as normalizedSectionId } from "@/lib/umd";

function creditsValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request: Request) {
  let body: { courseIds?: unknown; term?: unknown; preferences?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Provide a valid schedule request." }, { status: 400 });
  }
  const courseIds = Array.isArray(body.courseIds)
    ? [...new Set(body.courseIds.filter((item): item is string => typeof item === "string").map((item) => item.trim().toUpperCase()).filter(Boolean))]
    : [];
  const term = typeof body.term === "string" ? body.term : DEFAULT_TERM;
  if (!courseIds.length || courseIds.length > 10 || courseIds.some((id) => !courseIdIsValid(id))) {
    return Response.json({ error: "Choose between 1 and 10 valid course codes." }, { status: 400 });
  }
  if (!/^\d{6}$/.test(term)) return Response.json({ error: "Choose a valid term." }, { status: 400 });
  const rawPreferences = body.preferences && typeof body.preferences === "object"
    ? body.preferences as Record<string, unknown>
    : {};
  const preferences: PlanPreferences = {
    earliestStart: typeof rawPreferences.earliestStart === "string" ? rawPreferences.earliestStart : null,
    excludedDays: Array.isArray(rawPreferences.excludedDays) ? rawPreferences.excludedDays.filter((day): day is string => typeof day === "string") : [],
    windowStart: typeof rawPreferences.windowStart === "string" ? rawPreferences.windowStart : null,
    windowEnd: typeof rawPreferences.windowEnd === "string" ? rawPreferences.windowEnd : null,
    strictTime: rawPreferences.strictTime === true,
    openSeatsOnly: rawPreferences.openSeatsOnly === true,
    includeFreshmanConnection: rawPreferences.includeFreshmanConnection === true,
  };

  const warnings: PlanWarning[] = [];
  const loaded = await Promise.all(courseIds.map(async (courseId) => {
    try {
      const detail = await getCourse(courseId, term);
      if (!detail) {
        warnings.push({ code: "courseNotFound", courseId });
        return null;
      }
      if (!detail.sections.length) {
        warnings.push({ code: "noSectionsListed", courseId });
        return null;
      }
      const rawCourse = detail.course as Record<string, unknown>;
      const sections = detail.sections.flatMap((section) => {
        const id = normalizedSectionId(section, courseId);
        return id ? [{ ...section, section_id: id }] : [];
      });
      if (sections.length < detail.sections.length) {
        warnings.push({ code: "sectionsSkipped", courseId, count: detail.sections.length - sections.length });
      }
      if (!sections.length) {
        warnings.push({ code: "noValidSections", courseId });
        return null;
      }
      return {
        course_id: courseId,
        title: String(rawCourse.name ?? rawCourse.title ?? courseId),
        credits: creditsValue(rawCourse.credits),
        sections,
      } satisfies PlanCourse;
    } catch {
      warnings.push({ code: "courseLoadFailed", courseId });
      return null;
    }
  }));
  const courses: PlanCourse[] = loaded.filter((course) => course !== null);
  if (!courses.length) return Response.json({ term, options: [], warnings, truncated: false });
  const names = [...new Set(courses.flatMap((course) => course.sections.flatMap((section) => section.instructors ?? [])))];
  const professorRatings = await getProfessorSummaries(names);
  const limitedRatings = Object.values(professorRatings).filter((rating) => rating.status === "limited").length;
  if (limitedRatings) warnings.push({ code: "ratingsLimited", count: limitedRatings });
  const result = generateOptions(courses, professorRatings, preferences);
  return Response.json({
    term,
    options: result.options,
    warnings: [...warnings, ...result.warnings],
    truncated: result.truncated,
    professorRatingLookups: Object.keys(professorRatings).length,
  });
}
