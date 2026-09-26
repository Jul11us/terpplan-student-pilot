// missingCourseIds: courses the sender planned but could not place, so the viewer knows the schedule is incomplete.
export type SharedSchedule = { term: string; sectionIds: string[]; missingCourseIds: string[]; language: "en" | "zh" };

const SECTION_ID = /^[A-Z]{4}\d{3}[A-Z0-9]*-[A-Z0-9]{4}$/;
const COURSE_ID = /^[A-Z]{4}\d{3}[A-Z0-9]*$/;

export function sharePath(term: string, sectionIds: string[], language: "en" | "zh", missingCourseIds: string[] = []) {
  const query = new URLSearchParams({ term, sections: sectionIds.join(","), lang: language });
  if (missingCourseIds.length) query.set("missing", missingCourseIds.join(","));
  return `/share?${query.toString()}`;
}

export function parseSharedSchedule(query: URLSearchParams): SharedSchedule | null {
  const term = query.get("term") ?? "";
  const sectionIds = (query.get("sections") ?? "").split(",");
  if (!/^\d{4}(01|05|08|12)$/.test(term) || sectionIds.length < 1 || sectionIds.length > 10) return null;
  if (sectionIds.some((id) => !SECTION_ID.test(id))) return null;
  if (new Set(sectionIds.map((id) => id.split("-")[0])).size !== sectionIds.length) return null;
  // Invalid entries in the optional list are ignored rather than rejecting the whole link.
  const missingCourseIds = [...new Set((query.get("missing") ?? "").split(",").filter((id) => COURSE_ID.test(id)))].slice(0, 10);
  return { term, sectionIds, missingCourseIds, language: query.get("lang") === "zh" ? "zh" : "en" };
}
