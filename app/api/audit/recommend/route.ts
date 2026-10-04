import { compareAuditCandidates, historicalAverageGpa, summarizeAuditCandidate } from "@/lib/audit-recommendations";
import { getGenEdCourses, isGenEdCode } from "@/lib/gened";
import { courseIdIsValid, getCourse } from "@/lib/umd";

import { readJsonObject, sameOriginMutation } from "@/lib/request-security";

export async function POST(request: Request) {
  const denied = sameOriginMutation(request);
  if (denied) return denied;
  const parsed = await readJsonObject(request, 32768);
  if (parsed.error) return parsed.error;
  const body = parsed.value;
  const term = typeof body.term === "string" ? body.term : "";
  const genEdCode = typeof body.genEdCode === "string" ? body.genEdCode.toUpperCase() : "";
  const validGenEdCode = isGenEdCode(genEdCode) ? genEdCode : null;
  const courseIds = Array.isArray(body.courseIds)
    ? [...new Set(body.courseIds.filter((value): value is string => typeof value === "string").map((value) => value.trim().toUpperCase()))]
    : [];
  if (!/^\d{4}(01|05|08|12)$/.test(term) || (genEdCode && !validGenEdCode)
    || courseIds.length > 30 || courseIds.some((id) => !courseIdIsValid(id))
    || (!genEdCode && !courseIds.length)) return Response.json({ error: "Choose a valid term and requirement." }, { status: 400 });

  try {
    let candidates;
    if (validGenEdCode) {
      candidates = (await getGenEdCourses(term, validGenEdCode)).courses.map((course) => summarizeAuditCandidate(course.course_id, course.name, course.credits, course.sections));
    } else {
      const loaded: Array<ReturnType<typeof summarizeAuditCandidate> | null> = new Array(courseIds.length).fill(null);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(4, courseIds.length) }, async () => {
        while (next < courseIds.length) {
          const index = next++;
          const id = courseIds[index];
          try {
            const detail = await getCourse(id, term);
            if (!detail) continue;
            const course = detail.course as Record<string, unknown>;
            loaded[index] = summarizeAuditCandidate(id, String(course.name ?? course.title ?? id), course.credits, detail.sections);
          } catch { /* Keep other candidates when one course source fails. */ }
        }
      }));
      candidates = loaded.filter((candidate) => candidate !== null);
    }

    // For broad Gen Ed groups, show courses with a listed section first. Keep the
    // request bounded before asking PlanetTerp for historical averages.
    // Return enough options for the browser to remove courses already completed
    // without sending the student's completed-course list to this endpoint.
    const visible = candidates.sort(compareAuditCandidates).slice(0, validGenEdCode ? 60 : 30);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(3, visible.length, 12) }, async () => {
      while (cursor < Math.min(visible.length, 12)) {
        const item = visible[cursor++];
        item.averageGpa = await historicalAverageGpa(item.courseId);
      }
    }));
    return Response.json({ term, candidates: visible, totalCandidates: candidates.length });
  } catch {
    return Response.json({ error: "Course recommendations are temporarily unavailable." }, { status: 503 });
  }
}
