const UMDIO = "https://api.umd.io/v1";
const DEFAULT_TERM = "202608";

export type UmdMeeting = {
  days?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  classtype?: string | null;
  building?: string | null;
  room?: string | null;
};

export type UmdSection = {
  section_id?: string;
  course?: string;
  semester?: string | number;
  number?: string;
  seats?: string | number | null;
  open_seats?: string | number | null;
  waitlist?: string | number | null;
  instructors?: string[];
  meetings?: UmdMeeting[];
};

export type CatalogItem = {
  course_id: string;
  name: string;
  department?: string;
};

export function parseCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return null;
}

export async function umdJson<T>(path: string): Promise<T> {
  const response = await fetch(`${UMDIO}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Course data service returned ${response.status}.`);
  return (await response.json()) as T;
}

export async function availableTerms(): Promise<string[]> {
  const payload = await umdJson<unknown>("/courses/semesters");
  if (!Array.isArray(payload)) throw new Error("Course data service returned an invalid term list.");
  return payload.map(String).filter((term) => /^\d{6}$/.test(term)).sort().reverse();
}

export async function getCourse(courseId: string, term: string) {
  const [coursePayload, sectionPayload] = await Promise.all([
    umdJson<unknown>(`/courses/${encodeURIComponent(courseId)}?semester=${encodeURIComponent(term)}`),
    umdJson<unknown>(`/courses/${encodeURIComponent(courseId)}/sections?semester=${encodeURIComponent(term)}`),
  ]);
  const course = Array.isArray(coursePayload) ? coursePayload[0] : coursePayload;
  if (!course || typeof course !== "object") return null;
  return {
    course,
    sections: Array.isArray(sectionPayload) ? (sectionPayload as UmdSection[]) : [],
  };
}

export function sectionId(section: UmdSection, courseId: string): string | null {
  const id = String(section.section_id || (section.number ? `${courseId}-${section.number}` : "")).trim();
  // Section numbers are usually four digits (0101) but online/special sections use letters (FC01, ESG1).
  return /^[A-Z]{4}\d{3}[A-Z0-9]*-[A-Z0-9]{4}$/.test(id.toUpperCase()) ? id.toUpperCase() : null;
}

export function courseIdIsValid(value: string): boolean {
  return /^[A-Z]{4}\d{3}[A-Z0-9]*$/.test(value);
}

export { DEFAULT_TERM };
