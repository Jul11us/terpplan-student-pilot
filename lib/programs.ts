// Compares a student's courses with a minor's or major's catalog requirements (data/umd-programs.json).
// Everything here is an estimate: the catalog also has rules written only as prose.

export type ProgramItem = {
  kind: "course" | "choose";
  section: string;
  label: string;
  credits: number | null;
  count?: number | null;
  // Each option is a bundle that must be taken together, usually a single course.
  options: string[][];
  // Index of the catalog table (block) the item came from.
  block: number;
};

// One catalog table and the heading above it. "always" tables apply to everyone; "choice" tables are
// alternatives (a track, B.A. vs B.S.) the student picks; "default" marks the first when all are choices.
export type ProgramBlock = { title: string; role: "always" | "choice" | "default"; total: number | null };

export type Program = {
  slug: string;
  name: string;
  kind: "minor" | "major";
  url: string;
  intro: string | null;
  apply: string | null;
  // The page the catalog points to for how to apply, when it gives one.
  applyUrl?: string | null;
  blocks: ProgramBlock[];
  items: ProgramItem[];
};

export const defaultBlocks = (program: Program) => new Set(program.blocks.flatMap((block, index) => block.role === "choice" ? [] : [index]));

// n: title, c: credits, p: prerequisite text, pg: prerequisites as AND of OR-groups.
export type CourseFact = { n: string; c: number; p?: string; pg?: string[][] };
export type CourseStatus = "done" | "inProgress" | "planned";

// The audit page hands its course lists to the minor page through sessionStorage (this tab only).
export const AUDIT_HANDOFF_KEY = "terpplan:audit-courses";

// UMD minor rules (catalog, "Degree Information"): at most 6 credits or two courses shared with the major.
export const MINOR_MAJOR_OVERLAP_COURSES = 2;
const DEFAULT_CREDITS = 3;
const STATUS_RANK: Record<CourseStatus, number> = { done: 0, inProgress: 1, planned: 2 };

export type ItemProgress = {
  item: ProgramItem;
  // Position in program.items, stable while blocks are switched on and off.
  index: number;
  // No course list in the catalog: the student has to check this one against the catalog text.
  open: boolean;
  // Options the student already has (or plans), with their weakest status.
  met: Array<{ option: string[]; status: CourseStatus }>;
  needed: number;
  complete: boolean;
  remainingCredits: number;
  // Suggested options to finish the item, easiest first; filled for unfinished items.
  suggestions: string[][];
};

export type ProgramProgress = {
  items: ItemProgress[];
  listedCredits: number;
  remainingCredits: number;
  remainingCourses: number;
  creditsByStatus: Record<CourseStatus, number>;
  // Courses counted for this program that also appear in the other program's requirement lists.
  overlap: string[];
  overlapExcess: number;
  // Credits of the courses still to take that the other program also lists.
  sharedRemainingCredits: number;
  // Credits the catalog's stated total has beyond what its tables list (rules written only as text);
  // already included in remainingCredits.
  unlistedCredits: number;
  // Credits (counted or still to take) that the other program does not list.
  uniqueCredits: number;
  // Catalog lists fewer credits in tables than the stated total: some rules are prose only.
  partial: boolean;
  // Prerequisites the plan needs that do not count toward the minor.
  hiddenPrerequisites: string[];
  hiddenPrerequisiteCredits: number;
  minSemesters: number;
  depth: Record<string, number>;
};

const creditsOf = (facts: Record<string, CourseFact>, codes: string[]) => codes.reduce((sum, code) => sum + (facts[code]?.c ?? DEFAULT_CREDITS), 0);

function optionStatus(option: string[], student: Map<string, CourseStatus>, used: Set<string>): CourseStatus | null {
  let worst: CourseStatus | null = "done";
  for (const code of option) {
    const status = student.get(code);
    if (!status || used.has(code)) return null;
    if (STATUS_RANK[status] > STATUS_RANK[worst!]) worst = status;
  }
  return worst;
}

// Semesters until a course can be finished: 0 when done or in progress, 1 when its prerequisites are met.
function makeDepth(facts: Record<string, CourseFact>, student: Map<string, CourseStatus>) {
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (code: string): number => {
    const status = student.get(code);
    if (status === "done" || status === "inProgress") return 0;
    const cached = memo.get(code);
    if (cached !== undefined) return cached;
    // Catalog prerequisites can loop (CMSC412 and CMSC435 each accept the other); a loop is never the easy path.
    if (visiting.has(code)) return Number.POSITIVE_INFINITY;
    visiting.add(code);
    let before = 0;
    for (const group of facts[code]?.pg ?? []) {
      if (group.some((alt) => student.get(alt) === "done" || student.get(alt) === "inProgress")) continue;
      // An alternative without catalog facts would look deceptively easy, so known ones decide.
      const known = group.filter((alt) => facts[alt]);
      const shallowest = Math.min(...(known.length ? known : group).map(depth));
      if (Number.isFinite(shallowest)) before = Math.max(before, shallowest);
    }
    visiting.delete(code);
    const value = before + 1;
    memo.set(code, value);
    return value;
  };
  return depth;
}

// Prerequisites (taking the shallowest alternative) that a course still needs, recursively.
// Alternatives the student already plans for, or that count toward the program, are picked first;
// then courses whose own prerequisites are known, since an unknown course would look deceptively easy.
function missingPrerequisites(code: string, facts: Record<string, CourseFact>, student: Map<string, CourseStatus>, depth: (code: string) => number, preferred: Set<string>, into: Set<string>, seen = new Set<string>()) {
  if (seen.has(code)) return;
  seen.add(code);
  for (const group of facts[code]?.pg ?? []) {
    if (group.some((alt) => student.has(alt))) continue;
    // Ties keep the catalog's order, which usually lists the standard course first.
    const pick = [...group].sort((a, b) => Number(preferred.has(b)) - Number(preferred.has(a)) || Number(Boolean(facts[b])) - Number(Boolean(facts[a])) || depth(a) - depth(b))[0];
    if (!pick) continue;
    into.add(pick);
    missingPrerequisites(pick, facts, student, depth, preferred, into, seen);
  }
}

type EvaluateOptions = {
  // Course codes the student's (first) major lists, to find overlap.
  majorCodes?: Set<string>;
  // Indexes of open items (no course list) the student marked as finished.
  manualDone?: Set<number>;
  // Catalog tables that apply; defaults to the program's default blocks.
  blocks?: Set<number>;
  // Most courses that may count for both programs (2 for a minor); null for no limit.
  overlapCap?: number | null;
};

export function evaluateProgram(program: Program, facts: Record<string, CourseFact>, student: Map<string, CourseStatus>, { majorCodes = new Set<string>(), manualDone = new Set<number>(), blocks = defaultBlocks(program), overlapCap = MINOR_MAJOR_OVERLAP_COURSES }: EvaluateOptions = {}): ProgramProgress {
  const depth = makeDepth(facts, student);
  const optionDepth = (option: string[]) => Math.max(...option.map(depth));
  const included = program.items.map((item, index) => ({ item, index })).filter(({ item }) => blocks.has(item.block));
  const programList = new Set(included.flatMap(({ item }) => item.options.flat()));
  const listed = new Set([...programList, ...majorCodes]);
  // Courses an option would add that neither the minor nor the major lists.
  const extraCourses = (option: string[]) => {
    const needed = new Set<string>();
    option.forEach((code) => missingPrerequisites(code, facts, student, depth, listed, needed));
    return [...needed].filter((code) => !listed.has(code)).length;
  };
  const used = new Set<string>();
  // Required courses claim the student's courses first, then lists with fewer choices.
  const order = [...included]
    .sort((a, b) => Number(a.item.kind === "choose") - Number(b.item.kind === "choose") || a.item.options.length - b.item.options.length || a.index - b.index);
  const byIndex = new Map<number, ItemProgress>();
  const creditsByStatus: Record<CourseStatus, number> = { done: 0, inProgress: 0, planned: 0 };

  for (const { item, index } of order) {
    if (!item.options.length) {
      const done = manualDone.has(index);
      const credits = item.credits ?? DEFAULT_CREDITS;
      if (done) creditsByStatus.done += credits;
      byIndex.set(index, { item, index, open: true, met: [], needed: item.count ?? Math.max(1, Math.round(credits / DEFAULT_CREDITS)), complete: done, remainingCredits: done ? 0 : credits, suggestions: [] });
      continue;
    }
    const optionCredits = item.options.map((option) => creditsOf(facts, option));
    const average = optionCredits.length ? optionCredits.reduce((sum, value) => sum + value, 0) / optionCredits.length : DEFAULT_CREDITS;
    const byCredits = item.kind === "choose" && !item.count && item.credits !== null;
    const needed = item.kind === "course" ? 1 : item.count ?? (byCredits ? Math.max(1, Math.round(item.credits! / average)) : 1);
    const target = item.kind === "course" ? item.credits ?? optionCredits[0] ?? DEFAULT_CREDITS : item.credits ?? needed * average;
    const met: ItemProgress["met"] = [];
    let metCredits = 0;
    // Prefer finished courses over planned ones when several options match.
    const matches = item.options
      .map((option, optionIndex) => ({ option, optionIndex, status: optionStatus(option, student, used) }))
      .filter((match): match is { option: string[]; optionIndex: number; status: CourseStatus } => match.status !== null)
      .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
    for (const match of matches) {
      const enough = byCredits ? metCredits >= target : met.length >= needed;
      if (enough) break;
      met.push({ option: match.option, status: match.status });
      match.option.forEach((code) => used.add(code));
      const credits = optionCredits[match.optionIndex];
      metCredits += credits;
      creditsByStatus[match.status] += credits;
    }
    const complete = byCredits ? metCredits >= target : met.length >= needed;
    const remainingCredits = complete ? 0 : byCredits ? target - metCredits : item.kind === "course" ? target : (target / needed) * (needed - met.length);
    const suggestions = complete ? [] : item.options
      .filter((option) => option.every((code) => !used.has(code)) && !met.some((entry) => entry.option === option))
      .map((option) => ({ option, extra: extraCourses(option), steps: optionDepth(option) }))
      .sort((a, b) => a.extra - b.extra || a.steps - b.steps || Number(a.option.some((code) => majorCodes.has(code))) - Number(b.option.some((code) => majorCodes.has(code))) || creditsOf(facts, a.option) - creditsOf(facts, b.option))
      .map((entry) => entry.option);
    byIndex.set(index, { item, index, open: false, met, needed, complete, remainingCredits, suggestions });
  }
  const results = included.map(({ index }) => byIndex.get(index)!);

  // The plan used for workload: every unfinished item filled with its easiest options.
  const planned = new Set<string>();
  let remainingCourses = 0;
  for (const result of results) {
    if (result.complete) continue;
    const take = result.item.kind === "course" ? 1 : Math.max(1, result.needed - result.met.length);
    remainingCourses += take;
    if (result.open) continue;
    result.suggestions.slice(0, take).forEach((option) => option.forEach((code) => planned.add(code)));
  }
  const plannedAll = new Set([...planned, ...results.flatMap((result) => result.met.filter((entry) => entry.status === "planned").flatMap((entry) => entry.option))]);
  const hidden = new Set<string>();
  const preferred = new Set([...plannedAll, ...programList, ...majorCodes]);
  plannedAll.forEach((code) => missingPrerequisites(code, facts, student, depth, preferred, hidden));
  const counted = new Set(results.flatMap((result) => result.met.flatMap((entry) => entry.option)));
  const hiddenPrerequisites = [...hidden].filter((code) => !plannedAll.has(code) && !counted.has(code) && !programList.has(code)).sort();
  const depthMap: Record<string, number> = {};
  for (const code of new Set([...plannedAll, ...hidden, ...programList])) depthMap[code] = depth(code);

  const overlap = [...counted].filter((code) => majorCodes.has(code)).sort();
  const overlapExcess = overlapCap === null ? 0 : Math.max(0, overlap.length - overlapCap);
  const sharedRemainingCredits = creditsOf(facts, [...planned].filter((code) => majorCodes.has(code)));
  const uniqueCredits = creditsOf(facts, [...new Set([...counted, ...planned])].filter((code) => !majorCodes.has(code)))
    + results.reduce((sum, result) => sum + (result.open ? result.item.credits ?? DEFAULT_CREDITS : 0), 0);
  const selectedTotals = program.blocks.filter((_block, index) => blocks.has(index)).map((block) => block.total);
  const statedTotal = selectedTotals.length && selectedTotals.every((total) => total !== null) ? selectedTotals.reduce((sum, total) => sum! + total!, 0) : null;
  const listedCredits = results.reduce((sum, result) => sum + (result.item.kind === "course" ? result.item.credits ?? creditsOf(facts, result.item.options[0] ?? []) : result.item.credits ?? result.needed * DEFAULT_CREDITS), 0);
  const unlistedCredits = statedTotal !== null && listedCredits < statedTotal - 2 ? statedTotal - listedCredits : 0;
  const remainingCredits = Math.round(results.reduce((sum, result) => sum + result.remainingCredits, 0) + overlapExcess * DEFAULT_CREDITS + unlistedCredits);

  return {
    items: results,
    listedCredits,
    remainingCredits,
    remainingCourses: remainingCourses + overlapExcess,
    creditsByStatus,
    overlap,
    overlapExcess,
    sharedRemainingCredits,
    uniqueCredits,
    unlistedCredits,
    partial: !results.length || results.some((result) => result.open) || (statedTotal !== null && listedCredits < statedTotal - 2),
    hiddenPrerequisites,
    hiddenPrerequisiteCredits: creditsOf(facts, hiddenPrerequisites),
    minSemesters: Math.max(0, ...[...plannedAll].map(depth)),
    depth: depthMap,
  };
}

export function programCodes(program: Program) {
  return [...new Set(program.items.flatMap((item) => item.options.flat()))];
}
