import { generateOptions, replacementOptions, type PlanCourse, type PlanPreferences, type PlanWarning } from "@/lib/planner";
import { anonymousBusyBlocks, validBusyBlocks, validBuffer } from "@/lib/personal-schedule";
import { getProfessorGpa, getProfessorSummaries, normalizeProfessorName } from "@/lib/planetterp";

// GPA lookups (one or two PlanetTerp requests each) for the "prefer higher GPA" preference.
const MAX_GPA_LOOKUPS = 40;
import { courseIdIsValid, DEFAULT_TERM, getCourse, sectionId as normalizedSectionId } from "@/lib/umd";

function creditsValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request: Request) {
  let body: { courseIds?: unknown; term?: unknown; preferences?: unknown; instructorFilters?: unknown; sectionFilters?: unknown; mode?: unknown; selectedSectionIds?: unknown; replaceCourseId?: unknown };
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request");
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
  if (rawPreferences.busyBlocks !== undefined && !validBusyBlocks(rawPreferences.busyBlocks)) return Response.json({ error: "Invalid personal schedule.", code: "invalidBusyBlocks" }, { status: 400 });
  if (rawPreferences.bufferMinutes !== undefined && !validBuffer(rawPreferences.bufferMinutes)) return Response.json({ error: "Choose a whole-number buffer between 0 and 120 minutes.", code: "invalidBuffer" }, { status: 400 });
  const preferences: PlanPreferences = {
    earliestStart: typeof rawPreferences.earliestStart === "string" ? rawPreferences.earliestStart : null,
    excludedDays: Array.isArray(rawPreferences.excludedDays) ? rawPreferences.excludedDays.filter((day): day is string => typeof day === "string") : [],
    windowStart: typeof rawPreferences.windowStart === "string" ? rawPreferences.windowStart : null,
    windowEnd: typeof rawPreferences.windowEnd === "string" ? rawPreferences.windowEnd : null,
    strictTime: rawPreferences.strictTime === true,
    openSeatsOnly: rawPreferences.openSeatsOnly === true,
    includeFreshmanConnection: rawPreferences.includeFreshmanConnection === true,
    busyBlocks: anonymousBusyBlocks(rawPreferences.busyBlocks ?? []),
    bufferMinutes: rawPreferences.bufferMinutes as number | undefined,
    preferGpa: rawPreferences.preferGpa === true,
  };
  if (body.mode !== undefined && body.mode !== "alternatives") return Response.json({ error: "Invalid schedule operation." }, { status: 400 });
  if (body.mode === "alternatives" && (typeof body.replaceCourseId !== "string" || !courseIds.includes(body.replaceCourseId)
    || !Array.isArray(body.selectedSectionIds) || body.selectedSectionIds.length !== courseIds.length
    || body.selectedSectionIds.some((id) => typeof id !== "string" || id.length > 40))) return Response.json({ error: "Provide every selected section and a course to replace." }, { status: 400 });

  // Per-course instructor picks from the page; a course without an entry keeps every instructor.
  const instructorFilters = new Map<string, Set<string>>();
  if (body.instructorFilters && typeof body.instructorFilters === "object") {
    for (const [courseId, names] of Object.entries(body.instructorFilters as Record<string, unknown>)) {
      if (!Array.isArray(names)) continue;
      const kept = names.filter((name): name is string => typeof name === "string").map(normalizeProfessorName).filter(Boolean);
      if (kept.length) instructorFilters.set(courseId.trim().toUpperCase(), new Set(kept));
    }
  }

  const sectionFilters = new Map<string, { pinnedSectionId: string | null; excludedSectionIds: Set<string> }>();
  if (body.sectionFilters && typeof body.sectionFilters === "object" && !Array.isArray(body.sectionFilters)) {
    for (const [rawCourseId, value] of Object.entries(body.sectionFilters as Record<string, unknown>)) {
      const courseId = rawCourseId.trim().toUpperCase();
      if (!courseIds.includes(courseId) || !value || typeof value !== "object" || Array.isArray(value)) continue;
      const filter = value as Record<string, unknown>;
      const validId = (id: unknown): id is string => typeof id === "string" && id.startsWith(courseId + "-") && id.length <= 40;
      sectionFilters.set(courseId, {
        pinnedSectionId: validId(filter.pinnedSectionId) ? filter.pinnedSectionId : null,
        excludedSectionIds: new Set(Array.isArray(filter.excludedSectionIds) ? filter.excludedSectionIds.filter(validId).slice(0, 500) : []),
      });
    }
  }

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
      const validSections = detail.sections.flatMap((section) => {
        const id = normalizedSectionId(section, courseId);
        return id ? [{ ...section, section_id: id }] : [];
      });
      const sectionFilter = sectionFilters.get(courseId);
      const pinnedSectionId = sectionFilter?.pinnedSectionId;
      if (pinnedSectionId && !validSections.some((section) => section.section_id === pinnedSectionId)) {
        warnings.push({ code: "pinnedSectionUnavailable", courseId, sectionId: pinnedSectionId });
      }
      const selectedSections = pinnedSectionId
        ? validSections.filter((section) => section.section_id === pinnedSectionId)
        : validSections.filter((section) => !sectionFilter?.excludedSectionIds.has(section.section_id));
      if (!selectedSections.length && validSections.length) {
        warnings.push({ code: "allSectionsExcluded", courseId });
      }
      const keptInstructors = instructorFilters.get(courseId);
      const sections = keptInstructors && !pinnedSectionId
        ? selectedSections.filter((section) => (section.instructors ?? []).some((name) => keptInstructors.has(normalizeProfessorName(name))))
        : selectedSections;
      if (validSections.length < detail.sections.length) {
        warnings.push({ code: "sectionsSkipped", courseId, count: detail.sections.length - validSections.length });
      }
      if (!validSections.length) {
        warnings.push({ code: "noValidSections", courseId });
        return null;
      }
      if (!sections.length) {
        warnings.push({ code: "noSelectedInstructors", courseId });
      }
      return {
        course_id: courseId,
        title: String(rawCourse.name ?? rawCourse.title ?? courseId),
        credits: creditsValue(rawCourse.credits),
        sections: validSections,
        seatCheckedAt: detail.seatCheckedAt ?? undefined,
        pinnedSectionId: pinnedSectionId ?? undefined,
        excludedSectionIds: [...(sectionFilter?.excludedSectionIds ?? [])],
        instructors: keptInstructors ? [...keptInstructors] : undefined,
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
  if (preferences.preferGpa) {
    // Each instructor's average GPA in that course (or across their courses), for instructors PlanetTerp knows.
    const pairs = courses.flatMap((course) => [...new Set(course.sections.flatMap((section) => section.instructors ?? []))]
      .flatMap((name) => { const rating = professorRatings[normalizeProfessorName(name)]; return rating?.matched ? [{ course, key: normalizeProfessorName(name), name: rating.name }] : []; }))
      .slice(0, MAX_GPA_LOOKUPS);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(6, pairs.length) }, async () => {
      while (next < pairs.length) {
        const pair = pairs[next++];
        const gpa = await getProfessorGpa(pair.name, pair.course.course_id);
        if (gpa) pair.course.instructorGpa = { ...pair.course.instructorGpa, [pair.key]: gpa.gpa };
      }
    }));
  }
  const limitedRatings = Object.values(professorRatings).filter((rating) => rating.status === "limited").length;
  if (limitedRatings) warnings.push({ code: "ratingsLimited", count: limitedRatings });
  if (body.mode === "alternatives") {
    if (courses.length !== courseIds.length) return Response.json({ error: "Some courses could not be refreshed. Generate the schedule again.", code: "scheduleChanged" }, { status: 409 });
    try {
      return Response.json({ term, ...replacementOptions(courses, professorRatings, preferences, body.selectedSectionIds as string[], body.replaceCourseId as string) });
    } catch {
      return Response.json({ error: "The selected schedule changed or a section is no longer available. Generate it again.", code: "scheduleChanged" }, { status: 409 });
    }
  }
  const result = generateOptions(courses, professorRatings, preferences);
  return Response.json({
    term,
    options: result.options,
    warnings: [...warnings, ...result.warnings],
    truncated: result.truncated,
    diagnostics: result.diagnostics,
    // A repair is confirmed only when every requested course was available to the search.
    repairs: courses.length === courseIds.length ? result.repairs : [],
    professorRatingLookups: Object.keys(professorRatings).length,
  });
}
