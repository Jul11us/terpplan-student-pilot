// A four-year plan against a major's catalog requirements (data/umd-programs.json), with the minor page's
// matching (lib/programs.ts): requirements the catalog lists courses for are checked automatically; rules it writes
// only as text are shown as written, with the plan's courses in the subject and level they name, for the student to
// check and tick. Shared by the page and the tests, so it imports nothing from the server.

import { defaultBlocks, evaluateProgram, withBaseCourses, type CourseFact, type CourseStatus, type Program } from "@/lib/programs";

// A course in the plan: its term (null: before the plan) and its credits when known.
export type PlanCourse = { id: string; term: string | null; credits: number | null };

export type MajorLine = {
  // Position in program.items.
  index: number;
  // What a ticked rule is saved by (requirementKeys).
  key: string;
  // The catalog table (program.blocks) it comes from.
  block: number;
  section: string;
  // The catalog's words: a course ("ECON200 Principles of Microeconomics") or a rule ("Select one of the following:").
  label: string;
  kind: "course" | "choose";
  credits: number | null;
  // The courses the catalog lists for it (each option a bundle taken together).
  listed: string[][];
  // Written only as text: the student checks it.
  open: boolean;
  ok: boolean;
  have: number;
  need: number;
  // The plan's courses counted for it.
  courses: PlanCourse[];
  // What would still fill it, easiest first; each option is a bundle taken together.
  options: string[][];
  // For a rule written as text: plan courses in the subject and level it names, which may count, and how much of
  // it they would cover (courses, or credits when the rule gives only credits).
  maybe: PlanCourse[];
  maybeHave: number;
  maybeNeed: number;
  maybeUnit: "courses" | "credits";
};

export type MajorCheck = {
  lines: MajorLine[];
  done: number;
  // Rules written as text that the student has not ticked.
  open: number;
  // The catalog's stated total has credits its tables do not list.
  unlistedCredits: number;
};

// A catalog note that the import read as a requirement ("Note: Students who take MATH241 must also take another
// statistics course"); it names a course but asks for nothing by itself.
const isNote = (label: string) => /^\s*note\b/i.test(label);
// Courses a rule names as the ones that do not count: "Any 400-level STAT course other than STAT464".
function excludedIn(label: string) {
  const rest = /\b(?:other than|except|excluding|not including)\b([\s\S]*)/i.exec(label)?.[1] ?? "";
  return new Set((rest.match(/\b[A-Z]{4}\s?\d{3}[A-Z]?\b/g) ?? []).map((code) => code.replace(/\s/g, "")));
}
const DEFAULT_CREDITS = 3;
const baseCode = (id: string) => /^([A-Z]{4}\d{3})[A-Z]+$/.exec(id)?.[1] ?? id;

// A short, stable name for each requirement, from its heading and words (FNV-1a), with a count for a repeat of the
// same words: a tick stays on its rule when a rebuilt catalog snapshot moves the rules around, and is dropped, not
// moved to another rule, when the catalog rewords it.
export function requirementKeys(program: Pick<Program, "items">) {
  const seen = new Map<string, number>();
  return program.items.map((item) => {
    const text = `${item.section}|${item.label}`;
    const repeat = seen.get(text) ?? 0;
    seen.set(text, repeat + 1);
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
    return `${(hash >>> 0).toString(36)}${repeat ? `-${repeat}` : ""}`;
  });
}

// The plan as the requirements see it: courses before the plan and in past terms are done, this term's are in
// progress, later ones planned. Honors and topic versions also count as the base course.
export function planStatuses(courses: PlanCourse[], now: string) {
  const map = new Map<string, CourseStatus>();
  for (const course of courses) map.set(course.id, course.term === null || course.term < now ? "done" : course.term === now ? "inProgress" : "planned");
  return withBaseCourses(map);
}

// The subjects and levels a rule written as text names: "Select two 300 or 400 level ECON courses", "GVPT Courses
// of Choice 300-400 level", "CMSC3XX or CMSC4XX", "any upper-level PSYC course", and the courses it leaves out.
// Subjects are the plan's own (the only courses it could match); levels are null for any level. Null when the rule
// names none of the plan's subjects.
export function textRule(label: string, subjects: Set<string>) {
  const named = new Set((label.match(/\b[A-Z]{4}\b/g) ?? []).filter((code) => subjects.has(code)));
  const levels = new Set<number>();
  for (const match of label.matchAll(/\b([A-Z]{4})\s?([1-4])(?:XX|xx|\*\*)/g)) {
    if (subjects.has(match[1])) { named.add(match[1]); levels.add(Number(match[2])); }
  }
  if (!named.size) return null;
  for (const match of label.matchAll(/\b([1-4])00(?:\s*(?:-|–|to|or|and)\s*([1-4])00)?[\s-]*level/gi)) {
    const from = Number(match[1]);
    // "300-level PSYC course or above" runs to the 400s.
    const to = /^[^.;]{0,30}?\b(?:or|and)\s+(?:above|higher)\b/i.test(label.slice(match.index + match[0].length)) ? 4 : Number(match[2] ?? match[1]);
    for (let level = Math.min(from, to); level <= Math.max(from, to); level++) levels.add(level);
  }
  if (/upper[\s-]*(?:level|division)/i.test(label)) { levels.add(3); levels.add(4); }
  return { subjects: [...named], levels: levels.size ? [...levels].sort() : null, excluded: [...excludedIn(label)] };
}

export function checkCatalogMajor(raw: Program, facts: Record<string, CourseFact>, courses: PlanCourse[], now: string, { blocks, ticked = [] }: { blocks?: number[]; ticked?: string[] } = {}): MajorCheck {
  const keys = requirementKeys(raw);
  const tickedKeys = new Set(ticked);
  // Notes stay out of the check (a block no one selects); a rule whose only listed courses are the ones it leaves
  // out is a rule written as text.
  const program = { ...raw, items: raw.items.map((item) => {
    if (isNote(item.label)) return { ...item, block: -1 };
    const excluded = excludedIn(item.label);
    return item.options.length && item.options.flat().every((code) => excluded.has(code)) ? { ...item, options: [] } : item;
  }) };
  const chosen = blocks ? new Set(blocks.filter((index) => index >= 0 && index < program.blocks.length)) : defaultBlocks(program);
  const manualDone = new Set(keys.flatMap((key, index) => tickedKeys.has(key) ? [index] : []));
  const progress = evaluateProgram(program, facts, planStatuses(courses, now), { blocks: chosen, manualDone, overlapCap: null });
  // Each code the requirements may name, with the plan course behind it (an honors version stands for its base).
  const byCode = new Map<string, PlanCourse>();
  for (const course of courses) {
    if (!byCode.has(course.id)) byCode.set(course.id, course);
    if (!byCode.has(baseCode(course.id))) byCode.set(baseCode(course.id), course);
  }
  const counted = new Set(progress.items.flatMap((result) => result.met.flatMap((entry) => entry.option.map((code) => byCode.get(code)?.id ?? code))));

  // Rules written as text: the plan's other courses in the subjects and levels they name, each course for one rule,
  // the narrower rules (fewer levels) first, earlier courses first.
  const subjects = new Set(courses.map((course) => course.id.slice(0, 4)));
  const free = courses.filter((course) => !counted.has(course.id)).sort((a, b) => (a.term ?? "") < (b.term ?? "") ? -1 : (a.term ?? "") > (b.term ?? "") ? 1 : 0);
  const maybe = new Map<number, { courses: PlanCourse[]; have: number; need: number; unit: "courses" | "credits" }>();
  const rules = progress.items.filter((result) => result.open)
    .map((result) => ({ result, rule: textRule(result.item.label, subjects) }))
    .filter((entry): entry is { result: typeof entry.result; rule: NonNullable<typeof entry.rule> } => entry.rule !== null)
    .sort((a, b) => (a.rule.levels?.length ?? 5) - (b.rule.levels?.length ?? 5) || a.result.index - b.result.index);
  const taken = new Set<string>();
  for (const { result, rule } of rules) {
    const unit = result.item.count ? "courses" : result.item.credits ? "credits" : "courses";
    const need = unit === "credits" ? result.item.credits! : result.item.count ?? 1;
    const found: PlanCourse[] = [];
    let have = 0;
    for (const course of free) {
      if (have >= need) break;
      const level = Number(course.id.charAt(4));
      if (taken.has(course.id) || rule.excluded.includes(baseCode(course.id)) || !rule.subjects.includes(course.id.slice(0, 4)) || (rule.levels && !rule.levels.includes(level))) continue;
      found.push(course);
      taken.add(course.id);
      have += unit === "credits" ? course.credits ?? facts[course.id]?.c ?? DEFAULT_CREDITS : 1;
    }
    maybe.set(result.index, { courses: found, have, need, unit });
  }

  const lines = progress.items.map((result): MajorLine => {
    const guess = maybe.get(result.index);
    return {
      index: result.index, key: keys[result.index]!, block: result.item.block, section: result.item.section, label: result.item.label, kind: result.item.kind, credits: result.item.credits, listed: result.item.options,
      open: result.open, ok: result.complete,
      have: result.open ? Number(result.complete) : Math.min(result.met.length, result.needed), need: result.open ? 1 : result.needed,
      courses: result.met.flatMap((entry) => entry.option.map((code) => byCode.get(code) ?? { id: code, term: null, credits: facts[code]?.c ?? null })),
      options: result.complete ? [] : result.suggestions,
      maybe: guess?.courses ?? [], maybeHave: guess?.have ?? 0, maybeNeed: guess?.need ?? 0, maybeUnit: guess?.unit ?? "courses",
    };
  });
  return { lines, done: lines.filter((line) => line.ok).length, open: lines.filter((line) => line.open && !line.ok).length, unlistedCredits: progress.unlistedCredits };
}
