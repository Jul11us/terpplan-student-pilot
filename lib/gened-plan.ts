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
// A set never holds one class twice under two listings (cross-listed, AAAS234 and ENGL234) or two courses Testudo
// credits only once together, and two sets that differ only by the listing are offered once.

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
  // The class this listing belongs to when it is cross-listed (one key for AAAS234 and ENGL234; see
  // crossListGroups).
  sameAs?: string;
  // Courses Testudo gives credit for only once together with this one ("Credit only granted for").
  notWith?: string[];
};
// `needs`: the needs this course fills (DIV for "a Diversity course"); `covers`: the same as the course's own
// Gen Ed codes, for showing (a lab course filling the science need shows DSNL). `section`: the section (an index
// into the course's `sections`) the set was checked with; plan courses have none.
export type GenEdPick = { id: string; needs: string[]; covers: string[]; section?: number };
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

// One section for each course (an index into its `sections`) with no two of them meeting at the same time,
// trying each course's sections in order; null when there is none.
export function fitSections(courses: PlanCandidate[]): number[] | null {
  const sectionsOf = (course: PlanCandidate) => course.sections.length ? course.sections : [[]];
  const choose = (index: number, chosen: number[]): number[] | null => {
    if (index === courses.length) return chosen;
    const sections = sectionsOf(courses[index]!);
    for (let at = 0; at < sections.length; at += 1) {
      if (chosen.some((other, before) => meetingsConflict(sections[at]!, sectionsOf(courses[before]!)[other]!))) continue;
      const found = choose(index + 1, [...chosen, at]);
      if (found) return found;
    }
    return null;
  };
  return choose(0, []);
}

// Whether every course can be taken in one of its sections without two of them meeting at the same time.
export const sectionsFit = (courses: PlanCandidate[]) => fitSections(courses) !== null;

// The class a listing belongs to, and whether two courses can go in one set: not one class under two listings,
// and not two courses Testudo credits only once together.
const classKey = (course: PlanCandidate) => course.sameAs ?? course.id;
const apart = (a: PlanCandidate, b: PlanCandidate) => a.id !== b.id && classKey(a) !== classKey(b) && !a.notWith?.includes(b.id) && !b.notWith?.includes(a.id);

type Listing = { course_id: string; name: string; crossListed?: string[]; sections: { meetings?: MeetingTime[] }[] };
// Which listings are one class: the ones Testudo says are cross-listed, and the ones with the same title whose
// sections meet at the same times in the same rooms. Maps each course to its class's key (the group's first id).
export function crossListGroups(courses: Listing[]): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const up = parent.get(id);
    if (!up || up === id) return id;
    const root = find(up);
    parent.set(id, root);
    return root;
  };
  const join = (a: string, b: string) => {
    const x = find(a), y = find(b);
    if (x !== y) parent.set(x < y ? y : x, x < y ? x : y);
  };
  for (const course of courses) for (const other of course.crossListed ?? []) join(course.course_id, other);
  // Only sections with a set time say anything: two "Independent Study" listings to be arranged are not one class.
  const bySchedule = new Map<string, string>();
  for (const course of courses) {
    if (!course.sections.some((section) => (section.meetings ?? []).some((meeting) => meeting.start_time))) continue;
    const times = course.sections.map((section) => (section.meetings ?? []).map((meeting) => [meeting.days, meeting.start_time, meeting.end_time, meeting.building, meeting.room].join(" ")).join("+")).sort().join(";");
    const key = `${course.name.trim().toLowerCase()}|${times}`;
    const first = bySchedule.get(key);
    if (first) join(first, course.course_id);
    else bySchedule.set(key, course.course_id);
  }
  return new Map(courses.map((course) => [course.course_id, find(course.course_id)]));
}

// Courses that can take one pick's place in a set ("swap this course"): they fill every need that pick fills,
// are none of the set's other classes (nor credited only once with one), and fit alongside the rest of the set.
// One listing per class, best score first, each with the section it would be taken in.
export function replacementsFor(plan: GenEdPlan, index: number, candidates: PlanCandidate[]) {
  const target = plan.picks[index];
  const byId = new Map(candidates.map((course) => [course.id, course]));
  const rest = plan.picks.filter((_, at) => at !== index).map((pick) => byId.get(pick.id));
  if (!target || rest.some((course) => !course)) return [];
  const others = rest as PlanCandidate[];
  // The pick's own class (under any of its numbers) is not a replacement for it.
  const current = byId.get(target.id);
  const found = new Map<string, { course: PlanCandidate; section: number }>();
  for (const course of [...candidates].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))) {
    if (course.inPlan || course.id === target.id || (current && classKey(course) === classKey(current)) || found.has(classKey(course))) continue;
    if (!fillOptions(course.groups, target.needs).some((option) => option.length === target.needs.length)) continue;
    if (!others.every((other) => apart(other, course))) continue;
    const sections = fitSections([...others, course]);
    if (sections) found.set(classKey(course), { course, section: sections[sections.length - 1]! });
  }
  return [...found.values()];
}

// The set with one pick replaced by a course from replacementsFor: the same needs (shown as the new course's
// own codes), every section checked again, and the need lines pointing at the new course.
export function replacePick(plan: GenEdPlan, index: number, course: PlanCandidate, candidates: PlanCandidate[]): GenEdPlan {
  const byId = new Map(candidates.map((item) => [item.id, item]));
  const old = plan.picks[index]!;
  const chosen = plan.picks.map((pick, at) => at === index ? course : byId.get(pick.id)!);
  const sections = fitSections(chosen);
  const picks = plan.picks.map((pick, at) => {
    const next: GenEdPick = at === index ? { id: course.id, needs: old.needs, covers: old.needs.map((need) => shownCode(need, course.groups)) } : { id: pick.id, needs: pick.needs, covers: pick.covers };
    return sections ? { ...next, section: sections[at] } : next;
  });
  return {
    picks,
    score: chosen.reduce((total, item) => total + item.score, 0),
    lines: plan.lines.map((line) => line.id === old.id && !line.fromPlan ? { ...line, id: course.id } : line),
  };
}

// Restore all of a student's swaps together. A later swap can rely on an earlier one having moved out of
// its time slot, so checking each swap against the original set can reject a valid final set.
// Null means the saved set no longer fits the current filters, categories or available sections.
export function applyPickSwaps(plan: GenEdPlan, swaps: Record<number, string>, candidates: PlanCandidate[]): GenEdPlan | null {
  if (!Object.keys(swaps).length) return plan;
  const byId = new Map(candidates.map((course) => [course.id, course]));
  const chosen: PlanCandidate[] = [];
  for (const [at, pick] of plan.picks.entries()) {
    const course = byId.get(swaps[at] ?? pick.id);
    if (!course || course.inPlan || !fillOptions(course.groups, pick.needs).some((option) => option.length === pick.needs.length)
      || !chosen.every((other) => apart(other, course))) return null;
    chosen.push(course);
  }
  const sections = fitSections(chosen);
  if (!sections) return null;
  const replacements = new Map(plan.picks.map((pick, at) => [pick.id, chosen[at]!.id]));
  return {
    picks: plan.picks.map((pick, at) => ({ id: chosen[at]!.id, needs: pick.needs, covers: pick.needs.map((need) => shownCode(need, chosen[at]!.groups)), section: sections[at] })),
    score: chosen.reduce((total, course) => total + course.score, 0),
    lines: plan.lines.map((line) => !line.fromPlan && line.id ? { ...line, id: replacements.get(line.id) ?? line.id } : line),
  };
}

export function planGenEds(needs: GenEdNeeds, candidates: PlanCandidate[], maxPlans = 3): GenEdPlanResult {
  const slots = needSlots(needs);
  const order = Object.keys(slots);
  const pick = (course: PlanCandidate, keys: string[], section?: number): GenEdPick => ({ id: course.id, needs: keys, covers: keys.map((key) => shownCode(key, course.groups)), ...(section === undefined ? {} : { section }) });
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

  // A need can be covered only as many times as there are classes that can fill it.
  const pool = candidates.filter((item) => !item.inPlan);
  const uncovered: string[] = [];
  for (const [key, count] of Object.entries(left)) {
    if (count <= 0) continue;
    const able = new Set(pool.filter((course) => fillOptions(course.groups, [key]).length).map(classKey)).size;
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
  const kindList = [...kinds.values()].map((kind) => ({ ...kind, courses: [...kind.courses].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)), classes: new Set(kind.courses.map(classKey)).size }))
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
        if ((used.get(index) ?? 0) >= kind.classes) continue;
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
          // The same classes under other listings make the same set.
          const key = chosen.map(classKey).sort().join(",");
          if (seen.has(key)) return;
          seen.add(key);
          const sections = fitSections(chosen)!;
          const picks = chosen.map((course, at) => pick(course, steps[at]!.covers, sections[at]));
          plans.push({ picks, score: chosen.reduce((total, course) => total + course.score, 0), lines: linesFor(fromPlan, picks, uncovered) });
          return;
        }
        // The best few classes of this kind. Try every listing of those classes: each listing can have
        // different usable sections (open seats, for example), so one may fit where another does not.
        // Completed sets are still deduplicated by class above.
        const tried = new Set<string>();
        for (const course of kindList[steps[index]!.kind]!.courses) {
          if (!chosen.every((other) => apart(other, course))) continue;
          const key = classKey(course);
          if (!tried.has(key)) {
            if (tried.size >= COURSES_TRIED_PER_PICK) continue;
            tried.add(key);
          }
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
    const next = pool.filter((course) => chosen.every((other) => apart(other, course)) && sectionsFit([...chosen, course]))
      .map((course) => ({ course, keys: fillOptions(course.groups, Object.keys(rest)).map((option) => fills(option, rest)).sort(fuller)[0] ?? [] }))
      .filter((item) => item.keys.length)
      .sort((x, y) => y.keys.length - x.keys.length || y.course.score - x.course.score)[0];
    if (!next) { for (const [key, count] of Object.entries(rest)) for (let index = 0; index < count; index += 1) uncovered.push(key); break; }
    chosen.push(next.course); picks.push(pick(next.course, next.keys)); rest = take(rest, next.keys);
  }
  if (!picks.length) return done([]);
  const sections = fitSections(chosen);
  const placed = picks.map((item, at) => sections ? { ...item, section: sections[at] } : item);
  return { ...done([{ picks: placed, score: chosen.reduce((total, course) => total + course.score, 0), lines: linesFor(fromPlan, placed, uncovered) }]), lines: linesFor(fromPlan, [], uncovered) };
}
