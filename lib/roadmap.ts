// The four-year plan: courses by term, and the checks that hold for every major: credits each term and in all,
// prerequisites taken in an earlier term, courses that run only in fall or only in spring, and the university's
// Gen Ed requirements as the department graduation plan form lists them. A major's own requirements are not
// checked here. Shared by the page and the tests, so it imports nothing from the server.

import { CS_TRACKS, type CsTrack } from "@/lib/cs-major";
import { DIVERSITY, fillOptions } from "@/lib/gened-plan";
import { courseSet, unmetRequirements } from "@/lib/prereq-check";
import type { PrereqNode } from "@/lib/programs";
import type { SavedPlanCourse } from "@/lib/saved-state";

export type SavedRoadmap = {
  // The fall that begins year 1 ("202608").
  start: string;
  years: number;
  // Course codes by term: fall YYYY08, winter YYYY12 (the January after that fall), spring YYYY01, summer YYYY05.
  terms: Record<string, string[]>;
  // Courses from before the plan: AP and transfer credit, and terms before year 1.
  earlier: string[];
  // Credits the student set for a course the catalog gives a range for, or nothing.
  credits?: Record<string, number>;
  // The major whose requirements are checked: Computer Science in full (lib/cs-major.ts), or a major from the catalog
  // snapshot (lib/major-check.ts) with the catalog tables that apply (its defaults when unset) and the rules written
  // only as text that the student ticked (lib/major-check.ts requirementKeys).
  major?: { id: "CS"; track: CsTrack } | CatalogMajorChoice;
  // A minor checked beside the major, from the catalog snapshot like a catalog major.
  minor?: CatalogChoice;
};

// A program from the catalog snapshot: its slug, the catalog tables that apply (its defaults when unset), and the
// rules written only as text that the student ticked.
export type CatalogChoice = { slug: string; blocks?: number[]; ticked?: string[] };
export type CatalogMajorChoice = { id: "catalog" } & CatalogChoice;

export type TermSeason = "fall" | "spring" | "winter" | "summer";
// A course as the bundled catalogs list it (app/api/catalog); null when neither term lists it.
export type CourseInfo = { name: string; credits: string | null; ge: string[][]; pr: PrereqNode | null; terms: string[] };

export const MIN_YEARS = 4;
export const MAX_YEARS = 6;
export const MAX_PER_TERM = 12;
export const MAX_EARLIER = 60;
// University rules (catalog, Registration): the most an undergraduate may take without their advising college's
// approval, with both summer sessions (8 credits each) in one summer; 12 credits is full time. A bachelor's degree
// takes at least 120 credits (many take more).
export const CREDIT_LIMITS: Record<TermSeason, number> = { fall: 20, spring: 20, winter: 4, summer: 16 };
export const FULL_TIME = 12;
export const DEGREE_CREDITS = 120;

const COURSE = /^[A-Z]{4}\d{3}[A-Z]?$/;

export function termSeason(term: string): TermSeason {
  const code = term.slice(4);
  return code === "08" ? "fall" : code === "01" ? "spring" : code === "12" ? "winter" : "summer";
}

// The year a term goes by: a winter term (YYYY12) is the January after that fall.
export function termYear(term: string) {
  return Number(term.slice(0, 4)) + (term.endsWith("12") ? 1 : 0);
}

// Year `index` (0 is year 1), in the graduation plan form's order: fall, spring, then January and summer.
export function yearTerms(start: string, index: number) {
  const fall = Number(start.slice(0, 4)) + index;
  return { fall: `${fall}08`, spring: `${fall + 1}01`, winter: `${fall}12`, summer: `${fall + 1}05` };
}

// Every term of the plan in time order (term codes sort that way: 08, then 12, then the next year's 01 and 05).
export function roadmapTerms(roadmap: Pick<SavedRoadmap, "start" | "years">) {
  return Array.from({ length: roadmap.years }, (_, index) => Object.values(yearTerms(roadmap.start, index))).flat().sort();
}

// The term in progress on a date, by month (lib/term-calendar.ts).
export { termAt } from "@/lib/term-calendar";

// The fall that begins the academic year a term belongs to.
export function fallOf(term: string) {
  const year = Number(term.slice(0, 4));
  return term.endsWith("08") || term.endsWith("12") ? `${year}08` : `${year - 1}08`;
}

export function emptyRoadmap(start: string): SavedRoadmap {
  return { start, years: MIN_YEARS, terms: {}, earlier: [] };
}

export const roadmapHasCourses = (roadmap: SavedRoadmap | undefined) => Boolean(roadmap && (roadmap.earlier.length || Object.values(roadmap.terms).some((list) => list.length)));

// Checks a stored (or synced) plan; anything unusable is dropped. Null when it is not a plan at all.
export function parseRoadmap(value: unknown): SavedRoadmap | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.start !== "string" || !/^\d{4}08$/.test(record.start)) return undefined;
  const years = typeof record.years === "number" && Number.isInteger(record.years) && record.years >= MIN_YEARS && record.years <= MAX_YEARS ? record.years : MIN_YEARS;
  const codes = (raw: unknown, max: number) => [...new Set(Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string" && COURSE.test(item)) : [])].slice(0, max);
  const allowed = new Set(roadmapTerms({ start: record.start, years }));
  const terms: Record<string, string[]> = {};
  if (record.terms && typeof record.terms === "object") {
    for (const [term, list] of Object.entries(record.terms as Record<string, unknown>)) {
      const courses = allowed.has(term) ? codes(list, MAX_PER_TERM) : [];
      if (courses.length) terms[term] = courses;
    }
  }
  const credits: Record<string, number> = {};
  if (record.credits && typeof record.credits === "object") {
    for (const [id, amount] of Object.entries(record.credits as Record<string, unknown>)) {
      if (COURSE.test(id) && typeof amount === "number" && amount >= 0 && amount <= 20) credits[id] = Math.round(amount * 2) / 2;
    }
  }
  const minor = catalogChoice(record.minor);
  return { start: record.start, years, terms, earlier: codes(record.earlier, MAX_EARLIER), ...(Object.keys(credits).length ? { credits } : {}), ...parseMajor(record.major), ...(minor ? { minor } : {}) };
}

const indexes = (raw: unknown) => Array.isArray(raw) ? [...new Set(raw.filter((item): item is number => Number.isInteger(item) && item >= 0 && item < 1000))].slice(0, 200) : null;

function catalogChoice(raw: unknown): CatalogChoice | null {
  const choice = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  if (typeof choice?.slug !== "string" || !/^[a-z0-9-]{3,160}$/.test(choice.slug)) return null;
  // An empty list of tables is a choice too (every table switched off); an empty list of ticks is not kept.
  const blocks = indexes(choice.blocks);
  const ticked = Array.isArray(choice.ticked) ? [...new Set(choice.ticked.filter((item): item is string => typeof item === "string" && /^[a-z0-9]{1,8}(?:-\d{1,3})?$/.test(item)))].slice(0, 200) : null;
  return { slug: choice.slug, ...(blocks ? { blocks } : {}), ...(ticked?.length ? { ticked } : {}) };
}

function parseMajor(raw: unknown): { major?: SavedRoadmap["major"] } {
  const major = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
  if (major?.id === "CS" && CS_TRACKS.includes(major.track as CsTrack)) return { major: { id: "CS", track: major.track as CsTrack } };
  const choice = major?.id === "catalog" ? catalogChoice(major) : null;
  return choice ? { major: { id: "catalog", ...choice } } : {};
}

// Where a course sits in the plan: a term, "earlier", or nowhere.
export function placeOf(roadmap: SavedRoadmap, id: string) {
  if (roadmap.earlier.includes(id)) return "earlier";
  return Object.entries(roadmap.terms).find(([, list]) => list.includes(id))?.[0] ?? null;
}

// Moves a course to a term ("earlier" for before the plan), taking it out of wherever it was.
export function moveCourse(roadmap: SavedRoadmap, id: string, to: string): SavedRoadmap {
  const terms = Object.fromEntries(Object.entries(roadmap.terms).map(([term, list]) => [term, list.filter((item) => item !== id)]).filter(([, list]) => list.length));
  const earlier = roadmap.earlier.filter((item) => item !== id);
  if (to === "earlier") return { ...roadmap, terms, earlier: [...earlier, id].slice(0, MAX_EARLIER) };
  return { ...roadmap, terms: { ...terms, [to]: [...(terms[to] ?? []), id].slice(0, MAX_PER_TERM) }, earlier };
}

export function removeCourse(roadmap: SavedRoadmap, id: string): SavedRoadmap {
  const terms = Object.fromEntries(Object.entries(roadmap.terms).map(([term, list]) => [term, list.filter((item) => item !== id)]).filter(([, list]) => list.length));
  const credits = { ...roadmap.credits };
  delete credits[id];
  return { ...roadmap, terms, earlier: roadmap.earlier.filter((item) => item !== id), ...(Object.keys(credits).length ? { credits } : { credits: undefined }) };
}

// Courses added where nothing holds them yet: each goes to its term, or to "earlier"; a course already somewhere
// in the plan stays where the student put it. Terms outside the plan go to "earlier" when they come before it.
export function addCourses(roadmap: SavedRoadmap, entries: Array<{ id: string; term: string | null }>): SavedRoadmap {
  const terms = roadmapTerms(roadmap);
  let next = roadmap;
  for (const { id, term } of entries) {
    if (!COURSE.test(id) || placeOf(next, id)) continue;
    const to = term && terms.includes(term) ? term : !term || term < terms[0]! ? "earlier" : null;
    if (to) next = moveCourse(next, id, to);
  }
  return next;
}

// A term's courses sent to the planner's plan for that term (app/plan): the courses the plan already has stay as
// they are, with their chosen sections; the term's others follow while the plan has room (it holds 10).
export function termIntoPlan(plan: SavedPlanCourse[], ids: string[], titles: Record<string, string | undefined>, limit = 10) {
  const fresh = ids.filter((id) => !plan.some((course) => course.courseId === id));
  const fits = fresh.slice(0, Math.max(0, limit - plan.length));
  return { plan: [...plan, ...fits.map((id) => ({ courseId: id, courseTitle: titles[id] ?? id }))], added: fits.length, left: fresh.length - fits.length };
}

// A course's credits for the totals: the student's own number, else the catalog's (the lower end of a range such
// as "1–3"); null when neither says.
export function courseCredits(id: string, info: CourseInfo | null | undefined, roadmap: Pick<SavedRoadmap, "credits">) {
  const own = roadmap.credits?.[id];
  if (own !== undefined) return own;
  const match = info?.credits ? /^(\d+(?:\.\d+)?)/.exec(info.credits) : null;
  return match ? Number(match[1]) : null;
}

export const variableCredits = (info: CourseInfo | null | undefined) => Boolean(info?.credits && /\d\s*[–-]\s*\d/.test(info.credits));

// The terms from `now` on that a course could be added to: whether the term is full, and which of its prerequisites
// would not be planned before it (or in it, where the catalog allows the same term).
export type TermChoice = { term: string; full: boolean; missing: PrereqNode[] };
export function termChoices(roadmap: SavedRoadmap, info: CourseInfo | null | undefined, now: string): TermChoice[] {
  const before = new Set(roadmap.earlier);
  const choices: TermChoice[] = [];
  for (const term of roadmapTerms(roadmap)) {
    const list = roadmap.terms[term] ?? [];
    if (term >= now) choices.push({ term, full: list.length >= MAX_PER_TERM, missing: unmetRequirements(info?.pr, courseSet(before), courseSet(list)) });
    for (const id of list) before.add(id);
  }
  return choices;
}

export type CourseIssue =
  // Prerequisites not taken in an earlier term (top-level requirements, as lib/prereq-check describes them).
  | { kind: "prereq"; missing: PrereqNode[] }
  // Lately the course has run only in the other regular semester.
  | { kind: "season"; only: "fall" | "spring" }
  // Also in an earlier term, or among the earlier courses.
  | { kind: "repeat" };
export type TermSummary = { credits: number; unknown: string[]; limit: number; over: boolean; partTime: boolean };
export type RoadmapCheck = {
  // By `${term}|${id}`.
  issues: Record<string, CourseIssue[]>;
  terms: Record<string, TermSummary>;
  earlierCredits: number;
  earlierUnknown: string[];
  total: number;
};

// Checks every term after `now` (terms already taken or under way are what they are): prerequisites must come
// in an earlier term (or the same term, where the catalog allows it), a fall-only course in a fall, a spring-only
// one in a spring, and a fall-only or spring-only course in a winter (January) term, where the page words it
// as unusual rather than impossible. Credits are totalled for every term.
export function checkRoadmap(roadmap: SavedRoadmap, info: Record<string, CourseInfo | null | undefined>, seasons: Record<string, "fall" | "spring" | null | undefined>, now: string): RoadmapCheck {
  const issues: Record<string, CourseIssue[]> = {};
  const terms: Record<string, TermSummary> = {};
  const before = new Set(roadmap.earlier);
  let total = 0;
  const earlierUnknown: string[] = [];
  let earlierCredits = 0;
  for (const id of roadmap.earlier) {
    const amount = courseCredits(id, info[id], roadmap);
    if (amount === null) earlierUnknown.push(id); else earlierCredits += amount;
  }
  total += earlierCredits;
  for (const term of roadmapTerms(roadmap)) {
    const list = roadmap.terms[term] ?? [];
    const season = termSeason(term);
    const ahead = term > now;
    let credits = 0;
    const unknown: string[] = [];
    for (const id of list) {
      const found: CourseIssue[] = [];
      const course = info[id];
      if (ahead && course?.pr) {
        const missing = unmetRequirements(course.pr, courseSet(before), courseSet(list.filter((other) => other !== id)));
        if (missing.length) found.push({ kind: "prereq", missing });
      }
      const only = seasons[id];
      // In the other regular semester the course cannot run. In a winter term it almost never does, so winter
      // placements of a seasonal course are flagged for checking too; summer is left alone, since many courses
      // that skip one regular semester still run in the summer.
      if (ahead && only) {
        if ((season === "fall" || season === "spring") && only !== season) found.push({ kind: "season", only });
        else if (season === "winter") found.push({ kind: "season", only });
      }
      if (before.has(id)) found.push({ kind: "repeat" });
      if (found.length) issues[`${term}|${id}`] = found;
      const amount = courseCredits(id, course, roadmap);
      if (amount === null) unknown.push(id); else credits += amount;
    }
    for (const id of list) before.add(id);
    const limit = CREDIT_LIMITS[season];
    terms[term] = { credits, unknown, limit, over: credits > limit, partTime: (season === "fall" || season === "spring") && list.length > 0 && credits < FULL_TIME };
    total += credits;
  }
  return { issues, terms, earlierCredits, earlierUnknown, total };
}

// The university Gen Ed requirements as the graduation plan form lists them, one row per course needed. DSNS
// takes a natural science course with or without a lab; DIV is the second Diversity course, Understanding
// Plural Societies or Cultural Competence (see lib/gened-plan.ts).
export const GEN_ED_ROWS = ["FSAW", "FSPW", "FSMA", "FSOC", "FSAR", "DSNL", "DSNS", "DSHS", "DSHS", "DSHU", "DSHU", "DSSP", "DSSP", "SCIS", "SCIS", "DVUP", DIVERSITY] as const;
export type GenEdRow = { need: string; id: string | null; term: string | null };

const GEN_ED_NODES = 60_000;

// Which course fills each row: a course counts once in each of its Gen Ed groups (the finder's rules), the most
// rows filled, earlier courses first. `term` null is a course from before the plan.
export function genEdTable(courses: Array<{ id: string; term: string | null; groups: string[][] }>): GenEdRow[] {
  const left: Record<string, number> = {};
  for (const need of GEN_ED_ROWS) left[need] = (left[need] ?? 0) + 1;
  const firstOf = new Map<string, { id: string; term: string | null; groups: string[][] }>();
  for (const course of [...courses].sort((a, b) => (a.term ?? "") < (b.term ?? "") ? -1 : (a.term ?? "") > (b.term ?? "") ? 1 : 0)) {
    if (course.groups.length && !firstOf.has(course.id)) firstOf.set(course.id, course);
  }
  const list = [...firstOf.values()];
  const most = list.map((course) => Math.max(0, ...fillOptions(course.groups, Object.keys(left)).map((option) => option.length)));
  const rest = most.map((_, index) => most.slice(index).reduce((sum, value) => sum + value, 0));
  let best = { filled: -1, picks: [] as string[][] };
  const picks: string[][] = [];
  let nodes = 0;
  // Each course takes one of its fullest ways to count, or none; a branch stops once it cannot fill more rows
  // than the best found. Ways are tried before "none", so the first best found uses the earliest courses.
  const visit = (index: number, filled: number) => {
    if (++nodes > GEN_ED_NODES) return;
    if (index === list.length) {
      if (filled > best.filled) best = { filled, picks: picks.map((keys) => [...keys]) };
      return;
    }
    if (filled + rest[index]! <= best.filled) return;
    const open = Object.keys(left).filter((key) => left[key] > 0);
    for (const option of fillOptions(list[index]!.groups, open)) {
      for (const key of option) left[key] -= 1;
      picks.push(option);
      visit(index + 1, filled + option.length);
      picks.pop();
      for (const key of option) left[key] += 1;
    }
    picks.push([]);
    visit(index + 1, filled);
    picks.pop();
  };
  visit(0, 0);
  const queue: Record<string, Array<{ id: string; term: string | null }>> = {};
  best.picks.forEach((keys, index) => { for (const key of keys) (queue[key] ??= []).push({ id: list[index]!.id, term: list[index]!.term }); });
  return GEN_ED_ROWS.map((need) => {
    const next = queue[need]?.shift();
    return { need, id: next?.id ?? null, term: next ? next.term : null };
  });
}
