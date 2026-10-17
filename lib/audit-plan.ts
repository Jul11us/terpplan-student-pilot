// What a degree audit says is still unfinished, kept in this browser only (never synced to the account), and how
// the courses a four-year plan adds after the audit would fill it. Kept: each unfinished requirement's name, what it
// needs and the courses or Gen Ed category it names, and the course codes the audit already lists (finished or in
// progress), which the plan cannot count again. Nothing else from the audit is stored.

import type { AuditResult } from "@/lib/degree-audit";
import { storageKey } from "@/lib/demo";
import { GEN_ED_CATEGORIES } from "@/lib/gened-categories";
import { DIVERSITY, fillOptions } from "@/lib/gened-plan";
import type { PlanCourse } from "@/lib/major-check";

export const AUDIT_NEEDS_KEY = "terpplan:audit-needs";

export type AuditNeed = { title: string; need: string; courseIds: string[]; genEdCode: string | null };
export type SavedAuditNeeds = { requirements: AuditNeed[]; known: string[]; savedAt: string };

const CODE = /^[A-Z]{2,6}\d{3}[A-Z]{0,2}$/;
const GEN_ED_CODES = new Set<string>(GEN_ED_CATEGORIES.map((item) => item.code));
const MAX_REQUIREMENTS = 150;
const MAX_LISTED = 150;
const MAX_KNOWN = 300;
const DEFAULT_CREDITS = 3;
const baseCode = (id: string) => /^([A-Z]{4}\d{3})[A-Z]+$/.exec(id)?.[1] ?? id;

// Checks a stored value; null when it holds no requirement and no course.
export function parseAuditNeeds(raw: unknown): SavedAuditNeeds | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const codes = (list: unknown, max: number) => Array.isArray(list) ? [...new Set(list.filter((item): item is string => typeof item === "string" && CODE.test(item)))].slice(0, max) : [];
  const requirements = (Array.isArray(value.requirements) ? value.requirements : []).flatMap((item): AuditNeed[] => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    if (typeof entry.title !== "string" || typeof entry.need !== "string") return [];
    const genEdCode = typeof entry.genEdCode === "string" && GEN_ED_CODES.has(entry.genEdCode) ? entry.genEdCode : null;
    return [{ title: entry.title.slice(0, 200), need: entry.need.slice(0, 120), courseIds: codes(entry.courseIds, MAX_LISTED), genEdCode }];
  }).slice(0, MAX_REQUIREMENTS);
  const known = codes(value.known, MAX_KNOWN);
  if (!requirements.length && !known.length) return null;
  return { requirements, known, savedAt: typeof value.savedAt === "string" ? value.savedAt.slice(0, 40) : "" };
}

// Only what the check needs, from a freshly read audit.
export function auditNeedsFrom(audit: AuditResult, now = new Date()): SavedAuditNeeds | null {
  return parseAuditNeeds({
    requirements: audit.requirements.map(({ title, need, courseIds, genEdCode }) => ({ title, need, courseIds, genEdCode })),
    known: [...audit.completedCourseIds, ...audit.inProgressCourseIds],
    savedAt: now.toISOString(),
  });
}

export function readAuditNeeds(): SavedAuditNeeds | null {
  try { return parseAuditNeeds(JSON.parse(window.localStorage.getItem(storageKey(AUDIT_NEEDS_KEY)) ?? "null")); } catch { return null; }
}

export function writeAuditNeeds(value: SavedAuditNeeds | null) {
  try {
    if (value) window.localStorage.setItem(storageKey(AUDIT_NEEDS_KEY), JSON.stringify(value));
    else window.localStorage.removeItem(storageKey(AUDIT_NEEDS_KEY));
  } catch { /* storage blocked: the check lasts until the page closes */ }
}

export type AuditLine = {
  title: string;
  need: string;
  genEdCode: string | null;
  // courses: the audit lists courses for it; genEd: a Gen Ed category; other: totals, GPA, residency and the like.
  kind: "courses" | "genEd" | "other";
  // true: the plan fills it; false: not yet; null: the student checks it (the audit asks for something else).
  ok: boolean | null;
  have: number;
  // From the NEEDS line: courses or credits; null when it says something else ("1 SUB-GROUP").
  target: number | null;
  unit: "courses" | "credits";
  // The plan's courses after the audit that fill it.
  courses: PlanCourse[];
  // Courses the audit lists for it that the plan does not have.
  options: string[];
};

export type AuditCheck = {
  lines: AuditLine[];
  done: number;
  open: number;
  // The plan's courses the audit does not list yet, and their credits (those at the 300 level or above too).
  later: PlanCourse[];
  laterCredits: number;
  upperCredits: number;
};

// How much a NEEDS line asks for: "2 COURSES", "6 CREDITS" (or "3.00 CREDITS"); null for anything else.
export function auditAmount(need: string): { target: number | null; unit: "courses" | "credits" } {
  const courses = /(\d+(?:\.\d+)?)\s*COURSES?\b/i.exec(need);
  if (courses) return { target: Math.max(1, Math.round(Number(courses[1]))), unit: "courses" };
  const credits = /(\d+(?:\.\d+)?)\s*CREDITS?\b/i.exec(need);
  return credits ? { target: Number(credits[1]), unit: "credits" } : { target: null, unit: "courses" };
}

// The plan's courses the audit does not know about, in time order, against each unfinished requirement: a course
// counts for one course-list requirement, and for Gen Ed categories as the Gen Ed rules allow (lib/gened-plan.ts);
// a course may count for both kinds, as at UMD. Lists with fewer courses claim the plan's courses first.
export function checkAuditNeeds(saved: SavedAuditNeeds, courses: PlanCourse[], genEds: Record<string, string[][] | undefined>): AuditCheck {
  const known = new Set(saved.known);
  const later = courses.filter((course) => !known.has(course.id) && !known.has(baseCode(course.id)))
    .sort((a, b) => (a.term ?? "") < (b.term ?? "") ? -1 : (a.term ?? "") > (b.term ?? "") ? 1 : 0);
  const planned = new Set(courses.flatMap((course) => [course.id, baseCode(course.id)]));
  const creditsOf = (course: PlanCourse) => course.credits ?? DEFAULT_CREDITS;
  const lines: AuditLine[] = saved.requirements.map((requirement) => ({
    title: requirement.title, need: requirement.need, genEdCode: requirement.genEdCode,
    kind: requirement.courseIds.length ? "courses" : requirement.genEdCode ? "genEd" : "other",
    ok: null, have: 0, ...auditAmount(requirement.need), courses: [], options: [],
  }));
  const take = (line: AuditLine, fits: (course: PlanCourse) => boolean, after: (course: PlanCourse) => void) => {
    // Without an amount, one course is enough to show; the student checks the rest.
    const goal = line.target ?? 1;
    for (const course of later) {
      if (line.have >= goal) break;
      if (!fits(course)) continue;
      line.courses.push(course);
      line.have += line.unit === "credits" ? creditsOf(course) : 1;
      after(course);
    }
  };

  // Major course lists: each plan course once, shorter lists first. A Gen Ed requirement with a course list
  // belongs to the category pass below, so its courses may still count for a major requirement.
  const used = new Set<string>();
  const byList = saved.requirements.map((requirement, index) => ({ requirement, index })).filter(({ requirement }) => requirement.courseIds.length && !requirement.genEdCode)
    .sort((a, b) => a.requirement.courseIds.length - b.requirement.courseIds.length || a.index - b.index);
  for (const { requirement, index } of byList) {
    const listed = new Set(requirement.courseIds);
    take(lines[index]!, (course) => !used.has(course.id) && (listed.has(course.id) || listed.has(baseCode(course.id))), (course) => used.add(course.id));
  }
  saved.requirements.forEach((requirement, index) => { lines[index]!.options = requirement.courseIds.filter((id) => !planned.has(id)); });

  // Gen Ed categories: a course counts for several only in ways the Gen Ed rules allow. The audit's second
  // Diversity course ("Cultural Competence (DVCC) or 2nd Understanding Plural Society (DVUP) course") takes either.
  const counts = new Map<string, string[]>();
  const categoryGroups = new Map<string, string[][]>();
  saved.requirements.forEach((requirement, index) => {
    if (!requirement.genEdCode) return;
    const key = requirement.genEdCode === "DVCC" && /DVUP/.test(requirement.title) ? DIVERSITY : requirement.genEdCode;
    const listed = new Set(requirement.courseIds);
    const line = lines[index]!;
    if (line.target === null && !requirement.courseIds.length) line.target = 1;
    take(line, (course) => {
      const explicitlyListed = listed.has(course.id) || listed.has(baseCode(course.id));
      if (listed.size && !explicitlyListed) return false;
      const before = counts.get(course.id) ?? [];
      if (before.includes(key)) return false;
      const keys = [...before, key];
      let groups = categoryGroups.get(course.id) ?? genEds[course.id] ?? [];
      // The audit may explicitly list a course whose current catalog metadata is unavailable or changed. Trust
      // that listing for this category, while retaining any known either/or groups for the other categories.
      if (explicitlyListed && !fillOptions(groups, [key]).length) groups = [...groups, [key]];
      const fits = fillOptions(groups, keys).some((option) => keys.every((needed) => option.includes(needed)));
      if (fits) categoryGroups.set(course.id, groups);
      return fits;
    }, (course) => counts.set(course.id, [...(counts.get(course.id) ?? []), key]));
  });

  for (const line of lines) line.ok = line.kind === "other" || line.target === null ? null : line.have >= line.target;
  const laterCredits = later.reduce((sum, course) => sum + creditsOf(course), 0);
  const upperCredits = later.filter((course) => Number(course.id.charAt(4)) >= 3).reduce((sum, course) => sum + creditsOf(course), 0);
  return { lines, done: lines.filter((line) => line.ok === true).length, open: lines.filter((line) => line.ok === null).length, later, laterCredits, upperCredits };
}
