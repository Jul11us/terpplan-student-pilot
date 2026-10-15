// "Fewest courses for the Gen Ed requirements I still need": from one term's courses, the smallest set that
// covers every needed category, then the best such sets by score (open, fitting sections and a good average
// GPA, as the finder scores them). Shared by the browser and the tests, so it must not import server code.
//
// What one course can count for follows Testudo's groups ("DSHU or DSSP, DVUP": DSHU or DSSP, and DVUP), as in
// genEdCoverage. UMD lets a Diversity or Big Question (I-Series) course also count for a Distributive Studies
// area, which is what those listings say. Two requirements are "one or the other" (gened.umd.edu):
// - Diversity is two Understanding Plural Societies courses, or one of them and one Cultural Competence
//   course. So the first DVUP need takes a DVUP course, and any further Diversity need (a second DVUP, or
//   DVCC) takes either kind ("DIV" below).
// - A lab science course (DSNL) is also one natural-science course, so it can fill a DSNS need instead of the
//   lab one.
// One course fills at most one need in each of those two requirements. Courses already in the plan count first.

import { meetingsConflict, type MeetingTime } from "@/lib/meeting-time";

export type GenEdNeeds = Record<string, number>;
export type PlanCandidate = {
  id: string;
  groups: string[][];
  // Higher is better.
  score: number;
  // Each usable section's meetings; an empty list is a section with no set time, which fits anything.
  sections: MeetingTime[][];
  inPlan?: boolean;
};
// `needs`: the needs this course fills (DIV for "a Diversity course"); `covers`: the same as the course's own
// Gen Ed codes, for showing (a lab course filling the science need shows DSNL).
export type GenEdPick = { id: string; needs: string[]; covers: string[] };
// One line per need, in the order the student listed them: which course fills it (null: nothing this term).
export type NeedLine = { need: string; id: string | null; fromPlan: boolean };
export type GenEdPlan = { picks: GenEdPick[]; score: number; lines: NeedLine[] };
export type GenEdPlanResult = {
  // How many needs there are in all (a code needed twice counts twice).
  total: number;
  // Plan courses that already count, before anything is added.
  fromPlan: GenEdPick[];
  // Best sets with the fewest courses (up to `maxPlans`), each covering everything that can be covered.
  plans: GenEdPlan[];
  // Needs nothing this term can cover (repeated once per course still missing).
  uncovered: string[];
  // Every need with the plan course that fills it, or null (for when no set is needed or none was found).
  lines: NeedLine[];
};

// A Diversity need that a DVUP or a DVCC course can fill.
export const DIVERSITY = "DIV";
const ALSO_FILLS: Record<string, string[]> = { DSNL: ["DSNS"], DVUP: [DIVERSITY], DVCC: [DIVERSITY] };
// Needs one course never fills both of.
const SAME_REQUIREMENT = [["DSNL", "DSNS"], ["DVUP", DIVERSITY]];

// What a student has taken toward Diversity, which decides what is left: nothing (one DVUP and one of either),
// one DVUP (one of either) or one DVCC (one DVUP).
export type DiversityTaken = "none" | "DVUP" | "DVCC";
// The case the selected codes most likely mean, as a degree audit lists the two: "Understanding Plural Societies
// (DVUP)" for the first course and "Cultural Competence (DVCC) or 2nd ... (DVUP)" for the second. Null: neither.
export function diversityDefault(codes: string[]): DiversityTaken | null {
  const plural = codes.includes("DVUP");
  const cultural = codes.includes("DVCC");
  return plural && cultural ? "none" : cultural ? "DVUP" : plural ? "DVCC" : null;
}
export function diversityNeeds(taken: DiversityTaken): GenEdNeeds {
  return taken === "none" ? { DVUP: 2 } : taken === "DVUP" ? { DVCC: 1 } : { DVUP: 1 };
}

const MAX_COMBOS = 60;
const NODE_BUDGET = 200_000;
const COURSES_TRIED_PER_PICK = 4;

// The student's needs (code -> courses) as needs courses fill: DVUP x2 is one DVUP and one Diversity course;
// DVCC is a Diversity course.
export function needSlots(needs: GenEdNeeds): GenEdNeeds {
  const slots: GenEdNeeds = {};
  const add = (key: string, count: number) => { if (count > 0) slots[key] = (slots[key] ?? 0) + count; };
  for (const [code, count] of Object.entries(needs)) {
    if (code === "DVUP") { add("DVUP", Math.min(count, 1)); add(DIVERSITY, count - 1); }
    else if (code === "DVCC") add(DIVERSITY, count);
    else add(code, count);
  }
  return slots;
}

// The ways one course can count: at most one need from each group, no need twice, only needs still open,
// never both needs of one requirement; only the largest ways are kept ({DSHU, DVUP}, not {DSHU} as well).
export function fillOptions(groups: string[][], needed: string[]): string[][] {
  const expanded = groups.map((group) => [...new Set(group.flatMap((code) => [code, ...(ALSO_FILLS[code] ?? [])]))]);
  const found = new Map<string, string[]>();
  const walk = (index: number, picked: string[]) => {
    if (index === expanded.length) {
      if (picked.length && !SAME_REQUIREMENT.some((pair) => pair.every((key) => picked.includes(key)))) {
        const sorted = [...picked].sort();
        found.set(sorted.join(","), sorted);
      }
      return;
    }
    walk(index + 1, picked);
    for (const key of expanded[index]!) if (needed.includes(key) && !picked.includes(key)) walk(index + 1, [...picked, key]);
  };
  walk(0, []);
  const options = [...found.values()];
  return options.filter((option) => !options.some((other) => other.length > option.length && option.every((key) => other.includes(key))));
}

// The course's own code behind a need it fills: DIV shows as DVUP or DVCC, DSNS from a lab course as DSNL.
export function shownCode(need: string, groups: string[][]) {
  const codes = groups.flat();
  if (codes.includes(need)) return need;
  return codes.find((code) => ALSO_FILLS[code]?.includes(need)) ?? need;
}

// Needs more than one kind of course can fill; a course that could fill either fills the strict one first.
const FLEXIBLE = new Set([DIVERSITY, "DSNS"]);
const fuller = (a: string[], b: string[]) => b.length - a.length || a.filter((key) => FLEXIBLE.has(key)).length - b.filter((key) => FLEXIBLE.has(key)).length;

// The needs an option still fills, given what is left to cover.
const fills = (option: string[], left: GenEdNeeds) => option.filter((key) => (left[key] ?? 0) > 0);
const take = (left: GenEdNeeds, keys: string[]) => { const next = { ...left }; for (const key of keys) next[key] = (next[key] ?? 0) - 1; return next; };
const sum = (left: GenEdNeeds) => Object.values(left).reduce((total, count) => total + Math.max(0, count), 0);

// Whether every course can be taken in one of its sections without two of them meeting at the same time.
export function sectionsFit(courses: PlanCandidate[]) {
  const choose = (index: number, chosen: MeetingTime[][]): boolean => {
    if (index === courses.length) return true;
    const sections = courses[index]!.sections.length ? courses[index]!.sections : [[]];
    return sections.some((meetings) => !chosen.some((other) => meetingsConflict(meetings, other)) && choose(index + 1, [...chosen, meetings]));
  };
  return choose(0, []);
}

export function planGenEds(needs: GenEdNeeds, candidates: PlanCandidate[], maxPlans = 3): GenEdPlanResult {
  const slots = needSlots(needs);
  const order = Object.keys(slots);
  const pick = (course: PlanCandidate, keys: string[]): GenEdPick => ({ id: course.id, needs: keys, covers: keys.map((key) => shownCode(key, course.groups)) });
  // Need lines in the student's order: plan courses, then the set's courses, then what is left uncovered.
  const linesFor = (planPicks: GenEdPick[], added: GenEdPick[], missing: string[]): NeedLine[] => [
    ...planPicks.flatMap((item) => item.needs.map((need) => ({ need, id: item.id, fromPlan: true }))),
    ...added.flatMap((item) => item.needs.map((need) => ({ need, id: item.id, fromPlan: false }))),
    ...missing.map((need) => ({ need, id: null, fromPlan: false })),
  ].sort((a, b) => order.indexOf(a.need) - order.indexOf(b.need));

  let left: GenEdNeeds = { ...slots };
  // Plan courses count first, each in its fullest way.
  const fromPlan: GenEdPick[] = [];
  for (const course of candidates.filter((item) => item.inPlan)) {
    const best = fillOptions(course.groups, Object.keys(left)).map((option) => fills(option, left)).sort(fuller)[0];
    if (best?.length) { fromPlan.push(pick(course, best)); left = take(left, best); }
  }

  // A need can be covered only as many times as there are courses that can fill it.
  const pool = candidates.filter((item) => !item.inPlan);
  const uncovered: string[] = [];
  for (const [key, count] of Object.entries(left)) {
    if (count <= 0) continue;
    const able = pool.filter((course) => fillOptions(course.groups, [key]).length).length;
    for (let index = able; index < count; index += 1) uncovered.push(key);
    if (able < count) left[key] = able;
  }
  left = Object.fromEntries(Object.entries(left).filter(([, count]) => count > 0));
  const done = (plans: GenEdPlan[]): GenEdPlanResult => ({ total: sum(slots), fromPlan, plans, uncovered, lines: linesFor(fromPlan, [], uncovered) });
  if (!sum(left)) return done([]);

  // Courses that can count the same ways are interchangeable for the count; they are searched as one kind,
  // best score first, and the courses are chosen afterwards.
  const kinds = new Map<string, { options: string[][]; courses: PlanCandidate[] }>();
  for (const course of pool) {
    const options = fillOptions(course.groups, Object.keys(left));
    if (!options.length) continue;
    const key = options.map((option) => option.join("+")).sort().join("|");
    const kind = kinds.get(key) ?? { options, courses: [] };
    kind.courses.push(course);
    kinds.set(key, kind);
  }
  const kindList = [...kinds.values()].map((kind) => ({ ...kind, courses: [...kind.courses].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)) }))
    .sort((a, b) => Math.max(...b.options.map((o) => o.length)) - Math.max(...a.options.map((o) => o.length)) || b.courses[0]!.score - a.courses[0]!.score);
  const widest = Math.max(...kindList.flatMap((kind) => kind.options.map((option) => option.length)));

  // Fewest courses first: every set of kinds (with the way each counts) that covers all needs in k courses,
  // then real courses for each set: the best-scoring ones whose sections fit together. When no set of k
  // courses can be taken together, k + 1 is tried.
  type Step = { kind: number; covers: string[] };
  let nodes = 0;
  const plans: GenEdPlan[] = [];
  const seen = new Set<string>();
  for (let k = Math.ceil(sum(left) / widest); k <= sum(left) && !plans.length && nodes <= NODE_BUDGET; k += 1) {
    const combos: Step[][] = [];
    const search = (at: number, used: Map<number, number>, steps: Step[], rest: GenEdNeeds) => {
      if (combos.length >= MAX_COMBOS || ++nodes > NODE_BUDGET) return;
      const remaining = sum(rest);
      if (!remaining) { combos.push(steps); return; }
      if (steps.length + Math.ceil(remaining / widest) > k) return;
      for (let index = at; index < kindList.length; index += 1) {
        const kind = kindList[index]!;
        if ((used.get(index) ?? 0) >= kind.courses.length) continue;
        for (const option of kind.options) {
          const covers = fills(option, rest);
          if (!covers.length) continue;
          search(index, new Map(used).set(index, (used.get(index) ?? 0) + 1), [...steps, { kind: index, covers }], take(rest, covers));
        }
      }
    };
    search(0, new Map(), [], left);
    for (const steps of combos) {
      const realize = (index: number, chosen: PlanCandidate[]) => {
        if (plans.length >= MAX_COMBOS) return;
        if (index === steps.length) {
          const key = chosen.map((course) => course.id).sort().join(",");
          if (seen.has(key)) return;
          seen.add(key);
          const picks = chosen.map((course, at) => pick(course, steps[at]!.covers));
          plans.push({ picks, score: chosen.reduce((total, course) => total + course.score, 0), lines: linesFor(fromPlan, picks, uncovered) });
          return;
        }
        let tried = 0;
        for (const course of kindList[steps[index]!.kind]!.courses) {
          if (tried >= COURSES_TRIED_PER_PICK) break;
          if (chosen.includes(course)) continue;
          tried += 1;
          if (sectionsFit([...chosen, course])) realize(index + 1, [...chosen, course]);
        }
      };
      realize(0, []);
    }
  }
  plans.sort((a, b) => b.score - a.score || a.picks.map((item) => item.id).join().localeCompare(b.picks.map((item) => item.id).join()));
  if (plans.length) return done(plans.slice(0, maxPlans));

  // Nothing covers every need at once (two needs only one course could fill, say): add the course that fills
  // the most until none helps, and report the rest as uncovered.
  const chosen: PlanCandidate[] = [];
  const picks: GenEdPick[] = [];
  for (let rest = left; sum(rest);) {
    const next = pool.filter((course) => !chosen.includes(course) && sectionsFit([...chosen, course]))
      .map((course) => ({ course, keys: fillOptions(course.groups, Object.keys(rest)).map((option) => fills(option, rest)).sort(fuller)[0] ?? [] }))
      .filter((item) => item.keys.length)
      .sort((x, y) => y.keys.length - x.keys.length || y.course.score - x.course.score)[0];
    if (!next) { for (const [key, count] of Object.entries(rest)) for (let index = 0; index < count; index += 1) uncovered.push(key); break; }
    chosen.push(next.course); picks.push(pick(next.course, next.keys)); rest = take(rest, next.keys);
  }
  if (!picks.length) return done([]);
  return { ...done([{ picks, score: chosen.reduce((total, course) => total + course.score, 0), lines: linesFor(fromPlan, picks, uncovered) }]), lines: linesFor(fromPlan, [], uncovered) };
}
