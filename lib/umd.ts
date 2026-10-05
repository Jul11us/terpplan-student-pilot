const UMDIO = "https://api.umd.io/v1";
const TESTUDO = "https://app.testudo.umd.edu/soc";
const TESTUDO_TERM = "202701";
const TESTUDO_TERMS = [TESTUDO_TERM];
const DEFAULT_TERM = TESTUDO_TERM;

// Terms read from Testudo pages; other terms come from umd.io.
export function isTestudoTerm(term: string) {
  return TESTUDO_TERMS.includes(term);
}

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
  // Testudo hold file: students waiting for a seat in a restricted or controlled section.
  holdfile?: string | number | null;
  instructors?: string[];
  meetings?: UmdMeeting[];
};

export type CatalogItem = {
  course_id: string;
  name: string;
  department?: string;
  // "3", or a range such as "1–3"; only in the bundled Spring 2027 catalog (scripts/add-catalog-details.mjs).
  credits?: string;
  // Prerequisite rule as a logic tree (see lib/prereq-check.ts); same catalog, same script.
  pr?: unknown;
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
  return [...new Set([...payload.map(String).filter((term) => /^\d{6}$/.test(term)), ...TESTUDO_TERMS])].sort().reverse();
}

export function htmlText(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

export function classTexts(source: string, className: string, tag: "span" | "div" = "span") {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const classAttribute = `\\bclass=["'](?:[^"']*\\s)?${escaped}(?:\\s[^"']*)?["']`;
  const matcher = new RegExp(`<${tag}\\b(?=[^>]*${classAttribute})[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return Array.from(source.matchAll(matcher), (match) => htmlText(match[1] ?? "")).filter(Boolean);
}

export function firstClassText(source: string, className: string, tag: "span" | "div" = "span") {
  return classTexts(source, className, tag)[0] ?? "";
}

function holdfileCount(source: string) {
  const match = /Holdfile:\s*<\/span>\s*<span class=["']waitlist-count["']>\s*(\d+)\s*</i.exec(source);
  return match ? Number(match[1]) : null;
}

function numberClassText(source: string, className: string) {
  const value = firstClassText(source, className);
  return value && /^\d+$/.test(value) ? Number(value) : null;
}

export async function testudoHtml(path: string) {
  const response = await fetch(`${TESTUDO}${path}`, {
    headers: { accept: "text/html" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Testudo returned ${response.status}.`);
  return response.text();
}

// Prerequisites, restrictions and similar notes, normalized from either data source.
export type CourseRequirementKind = "prerequisite" | "corequisite" | "restriction" | "creditOnlyFor" | "recommended" | "crossListed" | "formerly" | "additionalInfo" | "other";
export type CourseRequirement = { kind: CourseRequirementKind; label: string; text: string };

const REQUIREMENT_LABELS: Array<[RegExp, CourseRequirementKind]> = [
  [/^prerequisite/i, "prerequisite"],
  [/^corequisite/i, "corequisite"],
  [/^restriction/i, "restriction"],
  [/^credit only granted for/i, "creditOnlyFor"],
  [/^recommended/i, "recommended"],
  [/^(cross-listed|also offered as)/i, "crossListed"],
  [/^formerly/i, "formerly"],
  [/^additional information/i, "additionalInfo"],
];

function requirementKind(label: string): CourseRequirementKind {
  return REQUIREMENT_LABELS.find(([pattern]) => pattern.test(label))?.[1] ?? "other";
}

// Testudo writes each requirement as "<strong>Prerequisite:</strong> text" inside the course text block;
// the description is the approved text without a label, and extra notes sit in "course-text".
function parseTestudoRequirements(html: string) {
  const start = html.search(/class=["']approved-course-texts-container["']/i);
  const end = html.search(/class=["']toggle-sections-link-container["']/i);
  const region = start >= 0 ? html.slice(start, end > start ? end : undefined) : "";
  const requirements: CourseRequirement[] = Array.from(region.matchAll(/<strong>([\s\S]*?)<\/strong>([\s\S]*?)<\/div>/gi), (match) => {
    const label = htmlText(match[1] ?? "").replace(/:\s*$/, "");
    return { kind: requirementKind(label), label, text: htmlText(match[2] ?? "") };
  }).filter((item) => item.label && item.text);
  const description = classTexts(region, "approved-course-text", "div")
    .filter((text) => !REQUIREMENT_LABELS.some(([pattern]) => pattern.test(text)) && !/^[A-Z][A-Za-z -]+:/.test(text))
    .join(" ");
  for (const note of classTexts(region, "course-text", "div")) requirements.push({ kind: "other", label: "Note", text: note });
  return { requirements, description: description || null };
}

// umd.io keeps the same information under course.relationships.
const UMDIO_RELATIONSHIPS: Array<[string, CourseRequirementKind, string]> = [
  ["prereqs", "prerequisite", "Prerequisite"],
  ["coreqs", "corequisite", "Corequisite"],
  ["restrictions", "restriction", "Restriction"],
  ["credit_granted_for", "creditOnlyFor", "Credit only granted for"],
  ["also_offered_as", "crossListed", "Also offered as"],
  ["formerly", "formerly", "Formerly"],
  ["additional_info", "additionalInfo", "Additional information"],
];

function umdioRequirements(course: Record<string, unknown>): CourseRequirement[] {
  const relationships = course.relationships && typeof course.relationships === "object" ? course.relationships as Record<string, unknown> : {};
  return UMDIO_RELATIONSHIPS.flatMap(([key, kind, label]) => {
    const value = relationships[key];
    const text = typeof value === "string" ? htmlText(value) : "";
    return text ? [{ kind, label, text }] : [];
  });
}

// Section blocks share one markup on course pages and on the multi-course sections page.
export function parseTestudoSections(html: string, courseId: string): UmdSection[] {
  const sectionStarts = Array.from(html.matchAll(/<div\s+class=["']section(?:\s+[^"']*)?["'][^>]*>/gi));
  return sectionStarts.flatMap((start, index): UmdSection[] => {
    const sectionHtml = html.slice(start.index ?? 0, sectionStarts[index + 1]?.index ?? html.length);
    const number = /<input\b[^>]*\bname=["']sectionId["'][^>]*\bvalue=["']([^"']+)["']/i.exec(sectionHtml)?.[1]
      ?? firstClassText(sectionHtml, "section-id");
    if (!number) return [];

    const meetingStarts = Array.from(sectionHtml.matchAll(/<div\s+class=["']section-day-time-group[^"']*["'][^>]*>/gi));
    const meetings: UmdMeeting[] = meetingStarts.map((meeting, meetingIndex) => {
      const meetingHtml = sectionHtml.slice(meeting.index ?? 0, meetingStarts[meetingIndex + 1]?.index ?? sectionHtml.length);
      return {
        days: firstClassText(meetingHtml, "section-days") || null,
        start_time: firstClassText(meetingHtml, "class-start-time") || null,
        end_time: firstClassText(meetingHtml, "class-end-time") || null,
        classtype: firstClassText(meetingHtml, "class-type") || null,
        building: firstClassText(meetingHtml, "class-building") || null,
        room: firstClassText(meetingHtml, "class-room") || null,
      };
    });

    return [{
      section_id: `${courseId}-${number}`,
      number,
      instructors: classTexts(sectionHtml, "section-instructor"),
      seats: numberClassText(sectionHtml, "total-seats-count"),
      open_seats: numberClassText(sectionHtml, "open-seats-count"),
      waitlist: numberClassText(sectionHtml, "waitlist-count"),
      // The hold file count is a second "waitlist-count" right after a "Holdfile:" label.
      holdfile: holdfileCount(sectionHtml),
      meetings,
    }];
  });
}

function parseTestudoCourse(html: string, courseId: string) {
  // A Testudo course-code URL can return several prefix matches, such as
  // BMGT220 and BMGT220L. Parse only the exact course's block.
  const starts = Array.from(html.matchAll(/<div\b[^>]*\bid=["']([A-Z]{4}\d{3}[A-Z0-9]*)["'][^>]*\bclass=["']course["'][^>]*>/gi));
  const index = starts.findIndex((start) => start[1].toUpperCase() === courseId.toUpperCase());
  if (index < 0) return null;
  const courseHtml = html.slice(starts[index].index, starts[index + 1]?.index ?? html.length);

  const name = firstClassText(courseHtml, "course-title");
  if (!name) return null;
  const department = firstClassText(courseHtml, "course-prefix-name") || courseId.slice(0, 4);
  const creditsText = firstClassText(courseHtml, "course-min-credits");
  const credits = creditsText && Number.isFinite(Number(creditsText)) ? Number(creditsText) : null;
  // Variable-credit courses (e.g. 1-3) also list a maximum; fixed-credit courses leave it out.
  const maxCreditsText = firstClassText(courseHtml, "course-max-credits");
  const maxCredits = maxCreditsText && Number.isFinite(Number(maxCreditsText)) && Number(maxCreditsText) > (credits ?? 0) ? Number(maxCreditsText) : null;
  const sections = parseTestudoSections(courseHtml, courseId);

  return {
    course: { course_id: courseId, name, department, credits, max_credits: maxCredits, ...parseTestudoRequirements(courseHtml) },
    sections,
  };
}

// A course's sections in any Testudo term (past ones too), for offering history: [] when the term has no such
// course. A page that is neither a result nor Testudo's "No courses matched" message is an error, so a layout
// change is not stored as "not offered".
export async function getTestudoTermSections(courseId: string, term: string): Promise<UmdSection[]> {
  const html = await testudoHtml(`/${encodeURIComponent(term)}/${encodeURIComponent(courseId.slice(0, 4))}/${encodeURIComponent(courseId)}`);
  const detail = parseTestudoCourse(html, courseId);
  if (detail) return detail.sections;
  if (/No courses matched/i.test(html) || /\bclass=["']course["']/i.test(html)) return [];
  throw new Error("Testudo returned an unexpected page.");
}

type TestudoCourseDetail = NonNullable<ReturnType<typeof parseTestudoCourse>>;
const testudoCourseCache = new Map<string, { expiresAt: number; detail: TestudoCourseDetail & { seatCheckedAt: string } }>();

async function getTestudoCourse(courseId: string, term: string) {
  const key = `${term}|${courseId}`;
  const cached = testudoCourseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.detail;

  const html = await testudoHtml(`/${encodeURIComponent(term)}/${encodeURIComponent(courseId.slice(0, 4))}/${encodeURIComponent(courseId)}`);
  const detail = parseTestudoCourse(html, courseId);
  if (detail) {
    if (testudoCourseCache.size >= 100) {
      const oldest = testudoCourseCache.keys().next().value;
      if (oldest) testudoCourseCache.delete(oldest);
    }
    const snapshot = { ...detail, seatCheckedAt: new Date().toISOString() };
    testudoCourseCache.set(key, { expiresAt: Date.now() + 30_000, detail: snapshot });
    return snapshot;
  }
  return detail;
}

export async function getCourseSectionsSnapshot(courseId: string, term: string) {
  if (term === TESTUDO_TERM) {
    const detail = await getTestudoCourse(courseId, term);
    return { sections: detail?.sections ?? [], seatCheckedAt: detail?.seatCheckedAt ?? null };
  }
  const sections = await umdJson<UmdSection[]>(`/courses/${encodeURIComponent(courseId)}/sections?semester=${encodeURIComponent(term)}`);
  return { sections, seatCheckedAt: new Date().toISOString() };
}

export async function getCourseSections(courseId: string, term: string) {
  return (await getCourseSectionsSnapshot(courseId, term)).sections;
}

export async function getCourse(courseId: string, term: string) {
  if (term === TESTUDO_TERM) return getTestudoCourse(courseId, term);
  const [coursePayload, sectionSnapshot] = await Promise.all([
    umdJson<unknown>(`/courses/${encodeURIComponent(courseId)}?semester=${encodeURIComponent(term)}`),
    getCourseSectionsSnapshot(courseId, term),
  ]);
  const course = Array.isArray(coursePayload) ? coursePayload[0] : coursePayload;
  if (!course || typeof course !== "object") return null;
  const record = course as Record<string, unknown>;
  return {
    course: {
      ...record,
      requirements: umdioRequirements(record),
      description: typeof record.description === "string" && record.description.trim() ? htmlText(record.description) : null,
    } as Record<string, unknown> & { requirements: CourseRequirement[]; description: string | null },
    sections: Array.isArray(sectionSnapshot.sections) ? sectionSnapshot.sections : [],
    seatCheckedAt: sectionSnapshot.seatCheckedAt,
  };
}

export function sectionId(section: UmdSection, courseId: string): string | null {
  const id = String(section.section_id || (section.number ? `${courseId}-${section.number}` : "")).trim();
  // Section numbers are usually four digits (0101) but online/special sections use letters (FC01, ESG1).
  return /^[A-Z]{4}\d{3}[A-Z0-9]*-[A-Z0-9]{4}$/.test(id.toUpperCase()) ? id.toUpperCase() : null;
}

export function courseIdIsValid(value: string): boolean {
  return value.length <= 12 && /^[A-Z]{4}\d{3}[A-Z0-9]*$/.test(value);
}

export { DEFAULT_TERM };

// Sections of several courses on the Testudo term, 25 courses per request, by course id. A course with no
// sections block is offered without sections this term (an empty list).
export async function getTestudoSectionsBatch(term: string, courseIds: string[]) {
  const result = new Map<string, UmdSection[]>();
  for (let start = 0; start < courseIds.length; start += 25) {
    const ids = courseIds.slice(start, start + 25);
    const html = await testudoHtml(`/${encodeURIComponent(term)}/sections?courseIds=${ids.join(",")}`);
    const parts = new Map(html.split(/<div id="(?=[A-Z]{4}\d{3}[A-Z]?" class="course-sections")/).slice(1)
      .map((part) => [part.slice(0, part.indexOf('"')), part] as const));
    for (const id of ids) {
      const part = parts.get(id);
      result.set(id, part ? parseTestudoSections(part, id) : []);
    }
  }
  return result;
}
