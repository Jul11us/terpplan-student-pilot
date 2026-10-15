// "Fewest courses for the Gen Ed requirements I still need": from one term's courses, the smallest set that
// covers every needed category, then the best such sets by score (open, fitting sections and a good average
// GPA, as the finder scores them). Shared by the browser and the tests, so it must not import server code.
//
// What one course can count for follows Testudo's groups ("DSHU or DSSP, DVUP": DSHU or DSSP, and DVUP), as in
// genEdCoverage. UMD lets a Diversity or I-Series course also count for a Distributive Studies area, which is
// what those listings say. A lab science course (DSNL) is also one natural-science course, so it can fill a
// DSNS need instead of the lab one, never both. Courses already in the plan are counted first.

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
export type GenEdPick = { id: string; covers: string[] };
export type GenEdPlan = { picks: GenEdPick[]; score: number };
export type GenEdPlanResult = {
  // Plan courses that already count, before anything is added.
  fromPlan: GenEdPick[];
  // Best sets with the fewest courses (up to `maxPlans`), each covering everything that can be covered.
  plans: GenEdPlan[];
  // Needs nothing this term can cover (a code repeated once per course still missing).
  uncovered: string[];
};

const MAX_COMBOS = 60;
const NODE_BUDGET = 200_000;
const COURSES_TRIED_PER_PICK = 4;

// The ways one course can count: at most one code from each group, no code twice, only codes still needed;
// only the largest ways are kept ({DSHU, DVUP}, not {DSHU} as well).
export function fillOptions(groups: string[][], needed: string[]): string[][] {
  const expanded = groups.map((group) => group.includes("DSNL") && !group.includes("DSNS") ? [...group, "DSNS"] : group);
  const found = new Map<string, string[]>();
  const walk = (index: number, picked: string[]) => {
    if (index === expanded.length) {
      if (picked.length) { const sorted = [...picked].sort(); found.set(sorted.join(","), sorted); }
      return;
    }
    walk(index + 1, picked);
    for (const code of expanded[index]!) if (needed.includes(code) && !picked.includes(code)) walk(index + 1, [...picked, code]);
  };
  walk(0, []);
  const options = [...found.values()];
  return options.filter((option) => !options.some((other) => other.length > option.length && option.every((code) => other.includes(code))));
}

// The codes an option still fills, given what is left to cover.
const fills = (option: string[], left: GenEdNeeds) => option.filter((code) => (left[code] ?? 0) > 0);
const take = (left: GenEdNeeds, codes: string[]) => { const next = { ...left }; for (const code of codes) next[code] = (next[code] ?? 0) - 1; return next; };
const total = (left: GenEdNeeds) => Object.values(left).reduce((sum, count) => sum + Math.max(0, count), 0);

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
  let left: GenEdNeeds = Object.fromEntries(Object.entries(needs).filter(([, count]) => count > 0));

  // Plan courses count first, each in its fullest way.
  const fromPlan: GenEdPick[] = [];
  for (const course of candidates.filter((item) => item.inPlan)) {
    const best = fillOptions(course.groups, Object.keys(left)).map((option) => fills(option, left)).sort((a, b) => b.length - a.length)[0];
    if (best?.length) { fromPlan.push({ id: course.id, covers: best }); left = take(left, best); }
  }

  // A need can be covered only as many times as there are courses that can fill it.
  const pool = candidates.filter((item) => !item.inPlan);
  const uncovered: string[] = [];
  for (const [code, count] of Object.entries(left)) {
    const able = pool.filter((course) => fillOptions(course.groups, [code]).length).length;
    for (let index = able; index < count; index += 1) uncovered.push(code);
    if (able < count) left[code] = able;
  }
  left = Object.fromEntries(Object.entries(left).filter(([, count]) => count > 0));
  if (!total(left)) return { fromPlan, plans: [], uncovered };

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
  for (let k = Math.ceil(total(left) / widest); k <= total(left) && !plans.length && nodes <= NODE_BUDGET; k += 1) {
    const combos: Step[][] = [];
    const search = (at: number, used: Map<number, number>, steps: Step[], rest: GenEdNeeds) => {
      if (combos.length >= MAX_COMBOS || ++nodes > NODE_BUDGET) return;
      const remaining = total(rest);
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
          plans.push({ picks: chosen.map((course, at) => ({ id: course.id, covers: steps[at]!.covers })), score: chosen.reduce((sum, course) => sum + course.score, 0) });
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
  plans.sort((a, b) => b.score - a.score || a.picks.map((pick) => pick.id).join().localeCompare(b.picks.map((pick) => pick.id).join()));
  return { fromPlan, plans: plans.slice(0, maxPlans), uncovered };
}
