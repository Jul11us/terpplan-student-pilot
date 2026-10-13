// Turns "Canvas items + a syllabus grading scheme" into a percentage.
//
// Two numbers come out of this, and they answer different questions:
//   current    only work that has actually been graded counts, and the weights of categories with
//              nothing graded yet are re-normalised away — the same convention Canvas uses.
//   projected  every item with no score yet is treated as full marks, i.e. the ceiling you would
//              reach if you aced everything outstanding.
// A partially-graded course has no single true average, so reporting only one of them misleads.
//
// Chinese syllabi are supported: normaliseLabel preserves CJK (stripping it made every non-Latin
// label invalid, so the parser reported "no grading breakdown found" instead of working).

import type { LetterCut } from "@/lib/grades/gpa";

export const DEFAULT_FILL_PERCENT = 100;

export type CanvasGroup = { id: number; name: string; weight?: number | null; position?: number };
export type CanvasAssignment = {
  id: number;
  name: string;
  assignment_group_id?: number | null;
  points_possible?: number | null;
  score?: number | null;
  missing?: boolean;
  due_at?: string | null;
  html_url?: string | null;
};

export type SchemeCategory = {
  id: string;
  name: string;
  weight: number;
  dropLowest?: number;
  /** The groups this category draws from. One category often spans several. */
  canvasGroupIds?: number[];
  /**
   * Older single-group field, still written as the first selection so anything reading the previous
   * shape keeps working. `canvasGroupIds` wins when it is present.
   */
  canvasGroupId?: number | null;
  confidence?: number | null;
};

/** The Canvas groups a category draws from, tolerating the older single-group shape. */
export function categoryGroupIds(cat: SchemeCategory): number[] {
  if (Array.isArray(cat.canvasGroupIds)) {
    return [...new Set(cat.canvasGroupIds.filter((n) => Number.isFinite(n)))];
  }
  return cat.canvasGroupId === null || cat.canvasGroupId === undefined ? [] : [cat.canvasGroupId];
}

export type Scheme = {
  source: "syllabus" | "canvas" | "manual";
  confirmed: boolean;
  categories: SchemeCategory[];
  letterScale?: LetterCut[] | null;
  scaleSource?: "syllabus" | "assumed";
};

export type ManualItem = {
  id: string;
  name: string;
  categoryId?: string | null;
  earned?: number | null;
  possible?: number | null;
  note?: string;
};

export type GradeCourse = {
  id?: string;
  code: string;
  title?: string;
  /** Canvas's apply_assignment_group_weights; false means it grades by total points. */
  weighted?: boolean | null;
  canvas?: { groups?: CanvasGroup[]; items?: CanvasAssignment[] };
  scheme?: Scheme | null;
  manualItems?: ManualItem[];
};

export type EngineItem = {
  id: string;
  name: string;
  groupId: number | null;
  categoryId?: string | null;
  earned: number | null;
  possible: number | null;
  graded: boolean;
  missing: boolean;
  source: "canvas" | "manual";
};

// Synonym buckets. A Canvas group called "Problem Sets" and a syllabus row called "Homework" are
// the same thing; so are 作业 and 习题.
export const CATEGORY_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  // Textbook and submission platforms belong here rather than in a bucket of their own: when a
  // syllabus says "Connect SmartBook Exercises 15%" or "ALEKS Homework 10%", the work being
  // described is homework, and the platform name is often the only word the Canvas group shares
  // with it. Leaving them out is what made real UMD courses fail to map automatically.
  homework: ["homework", "hw", "problem set", "problem sets", "problemset", "pset", "psets", "assignment", "assignments", "exercises", "exercise", "written work", "submissions", "coursework", "course work",
    "connect", "connect math", "smartbook", "connect smartbook", "learnsmart", "mcgraw-hill", "mcgraw hill", "mcgraw-hill connect", "aleks", "mymathlab", "mylab", "mylab math", "mastering", "pearson", "revel", "mathxl",
    "zybooks", "zybook", "zyante", "webassign", "webwork", "lon-capa", "loncapa", "edfinity", "sapling", "achieve", "cengage", "mindtap", "aplia", "owlv2", "wiley", "wileyplus", "wiley plus", "launchpad", "macmillan",
    "gradescope", "crowdmark", "codio", "prairielearn", "prairie learn", "respondus",
    "作业", "习题", "平时作业", "课后作业", "练习"],
  quiz: ["quiz", "quizzes", "weekly quiz", "reading quiz", "pop quiz", "checkpoint", "checkpoints",
    "小测", "随堂测验", "测验", "课堂测验"],
  exam: ["exam", "exams", "test", "tests", "midterm", "midterms", "midterm exam", "hour exam", "hourly", "unit exam",
    "期中", "期中考试", "月考", "考试", "阶段测验"],
  final: ["final", "finals", "final exam", "cumulative final",
    "期末", "期末考试", "期末考"],
  project: ["project", "projects", "term project", "group project", "capstone", "design project", "group work", "groupwork", "team project", "teamwork", "group assignment",
    "项目", "课程项目", "大作业", "课程设计", "小组作业"],
  paper: ["paper", "papers", "essay", "essays", "writing", "written assignment", "composition", "report", "reports", "term paper",
    "论文", "报告", "小论文", "写作", "读书报告"],
  lab: ["lab", "labs", "laboratory", "lab report", "lab reports", "practical", "experiment", "experiments",
    "实验", "实验报告", "上机", "实践"],
  prelab: ["prelab", "pre-lab", "pre lab", "preparation", "预习", "实验预习"],
  participation: ["participation", "attendance", "engagement", "in-class", "in class", "discussion", "discussions", "section", "seminar", "classwork", "studio", "effort",
    "top hat", "tophat", "packback", "yellowdig", "piazza", "campuswire", "iclicker", "clicker",
    "参与", "出勤", "课堂参与", "平时表现", "讨论", "课堂讨论", "考勤"],
  presentation: ["presentation", "presentations", "oral", "oral exam", "speech", "demo", "demonstration",
    "演示", "汇报", "口头报告", "答辩"],
  reading: ["reading", "readings", "response", "responses", "reflection", "journal", "annotations", "annotation", "perusall",
    "阅读", "读书笔记", "反思"],
  portfolio: ["portfolio", "eportfolio", "作品集", "档案袋"],
};

const SYNONYM_INDEX = (() => {
  const idx = new Map<string, string>();
  for (const [key, words] of Object.entries(CATEGORY_SYNONYMS)) {
    idx.set(key, key);
    for (const w of words) idx.set(w, key);
  }
  return idx;
})();

export const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

export function hasCJK(s: unknown): boolean {
  return CJK_RE.test(String(s ?? ""));
}

/**
 * Collapse a human label to lowercase words with light singularisation.
 * CJK is preserved rather than stripped — see the module note.
 */
export function normaliseLabel(s: unknown): string {
  const out = String(s ?? "")
    .toLowerCase()
    .replace(/[%()[\]:;,./\\|]/g, " ")
    .replace(/[^a-z0-9+\-\s\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out.replace(/^(?:the|a|an|your|my|our)\s+/, "");
}

function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("ches") || word.endsWith("shes")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function tokens(s: unknown): string[] {
  return normaliseLabel(s).split(" ").filter(Boolean).map(singular);
}

/** Canonical bucket for a label, or null when nothing matches. */
export function canonicalCategory(name: unknown): string | null {
  const n = normaliseLabel(name);
  if (!n) return null;
  if (SYNONYM_INDEX.has(n)) return SYNONYM_INDEX.get(n)!;

  const words = n.split(" ");
  // Longest phrase wins, so "lab report" beats "lab".
  for (let len = Math.min(4, words.length); len >= 1; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const phrase = words.slice(i, i + len).map(singular).join(" ");
      if (SYNONYM_INDEX.has(phrase)) return SYNONYM_INDEX.get(phrase)!;
    }
  }

  // Chinese is written without spaces, so "期中考试成绩" arrives as one token and never equals a
  // synonym. Fall back to substring matching, longest synonym first.
  if (hasCJK(n)) {
    let best: { word: string; bucket: string } | null = null;
    for (const [word, bucket] of SYNONYM_INDEX) {
      if (!hasCJK(word) || word.length < 2 || !n.includes(word)) continue;
      if (!best || word.length > best.word.length) best = { word, bucket };
    }
    if (best) return best.bucket;
  }
  return null;
}

/** 0…1 similarity between two category labels, for mapping a syllabus onto Canvas groups. */
export function categorySimilarity(a: unknown, b: unknown): number {
  const na = normaliseLabel(a);
  const nb = normaliseLabel(b);
  if (!na || !nb) return 0;

  const ca = canonicalCategory(a);
  const cb = canonicalCategory(b);
  const bucket = ca && cb ? (ca === cb ? 0.82 : 0) : 0;

  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return Math.max(bucket, 0.7);

  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return bucket;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return Math.max(bucket, (shared / (ta.size + tb.size - shared)) * 0.8);
}

/**
 * Are two labels two names for the *same* piece of work?
 * Deliberately stricter than categorySimilarity and blind to the synonym buckets: "Midterm Exam 1"
 * and "Midterm Exam 2" are both 15%, both in the `exam` bucket, and are emphatically not one row.
 */
export function labelsAreSameWork(a: unknown, b: unknown): boolean {
  const na = normaliseLabel(a);
  const nb = normaliseLabel(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  // Differing numbers always mean different work ("Quiz 1" vs "Quiz 2").
  if ((na.match(/\d+/g) ?? []).join(",") !== (nb.match(/\d+/g) ?? []).join(",")) return false;
  if (na.includes(nb) || nb.includes(na)) return true;

  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared) >= 0.8;
}

/**
 * Best-match assignment of syllabus categories to Canvas groups.
 * Each category independently takes its closest group, and a group may be claimed by more than one
 * category: a syllabus listing "Midterm Exam 1 15%" and "Midterm Exam 2 15%" against a single Canvas
 * "Midterms" group is normal, and the two are separated at the item level in computeCourseGrade.
 */
/**
 * Group names that carry no information about *what* the work is — Canvas's default "Assignments",
 * and the handful of catch-all names instructors use instead.
 */
const GENERIC_GROUP_RE = /^(?:assignment|assignments|coursework|course work|all work|all assignments|course total|gradebook|grades|general|other|misc|miscellaneous|unassigned)$/i;

export function autoMapCategories(
  categories: Array<{ id: string; name: string }>,
  groups: CanvasGroup[],
): Record<string, { groupId: number; confidence: number; generic?: boolean }> {
  const pairs: Array<{ catId: string; groupId: number; score: number }> = [];
  for (const c of categories) {
    for (const g of groups) pairs.push({ catId: c.id, groupId: g.id, score: categorySimilarity(c.name, g.name) });
  }
  pairs.sort((a, b) => b.score - a.score);

  const claimed = new Set<string>();
  const out: Record<string, { groupId: number; confidence: number; generic?: boolean }> = {};
  for (const p of pairs) {
    if (claimed.has(p.catId) || p.score < 0.34) continue;
    claimed.add(p.catId);
    out[p.catId] = { groupId: p.groupId, confidence: Math.round(p.score * 100) / 100 };
  }

  // Nothing matched by name. Canvas's default grouping is a single "Assignments" group holding
  // every piece of work in the course, and in that case the categories really are all in it — the
  // engine then splits it at the item level by assignment name. Point the leftovers there rather
  // than leaving them unmapped, but at low confidence so the UI asks the student to check.
  //
  // Groups are deliberately never claimed here: two categories sharing one Canvas group is the
  // normal "two midterms, one Midterms group" case, and the item-level split handles it.
  const fallback =
    groups.find((g) => GENERIC_GROUP_RE.test(String(g.name || "").trim())) ||
    (groups.length === 1 ? groups[0] : null);
  if (fallback) {
    for (const c of categories) {
      if (!out[c.id]) out[c.id] = { groupId: fallback.id, confidence: 0.3, generic: true };
    }
  }

  return out;
}

function toNumber(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function canvasItemToEngine(a: CanvasAssignment): EngineItem {
  const possible = toNumber(a.points_possible);
  const earned = toNumber(a.score);
  return {
    id: `c${a.id}`,
    name: a.name || "Untitled",
    groupId: a.assignment_group_id ?? null,
    earned,
    possible,
    graded: earned !== null,
    missing: !!a.missing,
    source: "canvas",
  };
}

export function manualItemToEngine(m: ManualItem): EngineItem {
  const possible = toNumber(m.possible);
  const earned = toNumber(m.earned);
  return {
    id: m.id,
    name: m.name || "Untitled",
    groupId: null,
    categoryId: m.categoryId ?? null,
    earned,
    possible,
    graded: earned !== null,
    missing: false,
    source: "manual",
  };
}

function itemPercent(item: EngineItem): number | null {
  if (item.earned === null) return null;
  if (item.possible === null || item.possible === 0) return null; // extra credit
  return (item.earned / item.possible) * 100;
}

export type CategoryResult = {
  id: string;
  name: string;
  weight: number;
  dropLowest: number;
  canvasGroupIds: number[];
  confidence: number | null;
  items: EngineItem[];
  droppedItems: EngineItem[];
  gradedCount: number;
  ungradedCount: number;
  totalCount: number;
  earned: number;
  /** Total points possible across the graded items. */
  possible: number;
  /** Total points possible across the items that have no score yet. */
  ungradedPossible: number;
  currentPct: number | null;
  projectedPct: number | null;
};

export type GradeWarning = { level: "info" | "warn" | "bad"; key: string; params?: Record<string, unknown>; text: string };

export type GradeResult = {
  schemeSource: "syllabus" | "canvas" | "none";
  categories: CategoryResult[];
  weightTotal: number;
  currentCovered: number;
  unmappedGroups: CanvasGroup[];
  droppedItems: EngineItem[];
  current: { pct: number | null };
  projected: { pct: number | null };
  warnings: GradeWarning[];
};

/** A confirmed syllabus scheme wins; otherwise fall back to Canvas's own assignment groups. */
export function resolveCategories(course: GradeCourse): { categories: SchemeCategory[]; source: "syllabus" | "canvas" | "none" } {
  const scheme = course.scheme;
  // A hand-entered scheme and one read from a syllabus are the same thing here: confirmed weights
  // the student owns. Only "did these come from Canvas or from you?" matters downstream.
  if (scheme?.categories?.length) {
    return { categories: scheme.categories, source: scheme.source === "canvas" ? "canvas" : "syllabus" };
  }

  const groups = course.canvas?.groups ?? [];
  if (groups.length) {
    const weights = groups.map((g) => toNumber(g.weight) ?? 0);
    const sum = weights.reduce((a, b) => a + b, 0);

    // Canvas only applies group weights when the course says so. Otherwise it grades by total
    // points across every assignment, and equal-weighting the groups (what this used to do with
    // no weight to divide by) does not match it: with Exams 90/100 and Homework 10/100 + 10/100,
    // Canvas shows 36.67% and equal weights show 50%.
    //
    // Weighting each group by its own total points reproduces Canvas exactly, because the engine
    // aggregates as Σ(w·pct)/Σ(w) and pct is that group's earned/possible — so the total points
    // cancel and the result is Σearned/Σpossible.
    const usePoints = course.weighted === false || sum <= 0;
    const pointsByGroup = new Map<number, number>();
    if (usePoints) {
      for (const it of course.canvas?.items ?? []) {
        const gid = it.assignment_group_id ?? null;
        if (gid === null) continue;
        const possible = toNumber(it.points_possible) ?? 0;
        if (possible > 0) pointsByGroup.set(gid, (pointsByGroup.get(gid) ?? 0) + possible);
      }
    }
    const pointsSum = [...pointsByGroup.values()].reduce((a, b) => a + b, 0);

    const byPoints = usePoints && pointsSum > 0;
    return {
      source: "canvas",
      categories: groups.map((g, i) => ({
        id: `grp-${g.id}`,
        name: g.name || `Group ${i + 1}`,
        weight: byPoints
          ? pointsByGroup.get(g.id) ?? 0
          : sum > 0
            ? weights[i]!
            : Math.round((100 / groups.length) * 100) / 100,
        dropLowest: 0,
        canvasGroupIds: [g.id],
        canvasGroupId: g.id,
        confidence: 1,
      })),
    };
  }
  return { source: "none", categories: [{ id: "all", name: "All work", weight: 100, dropLowest: 0, canvasGroupIds: [], canvasGroupId: null, confidence: 1 }] };
}

export function computeCourseGrade(course: GradeCourse, settings: { ungradedFillPercent?: number } = {}): GradeResult {
  const fill = Number.isFinite(Number(settings.ungradedFillPercent))
    ? Number(settings.ungradedFillPercent)
    : DEFAULT_FILL_PERCENT;

  const warnings: GradeWarning[] = [];
  const { categories: rawCats, source } = resolveCategories(course);

  const allCanvasItems = (course.canvas?.items ?? []).map(canvasItemToEngine);
  const manualItems = (course.manualItems ?? []).map(manualItemToEngine);
  const groups = course.canvas?.groups ?? [];

  const claimedGroups = new Set<number>();
  for (const c of rawCats) for (const gid of categoryGroupIds(c)) claimedGroups.add(gid);
  const unmappedGroups = groups.filter((g) => !claimedGroups.has(g.id));
  const looseItems = allCanvasItems.filter((it) => it.groupId === null || !claimedGroups.has(it.groupId));

  // Groups claimed by more than one category are split at the item level: each assignment goes to
  // the category whose name it actually resembles, and anything unrecognised stays with the first.
  const claims = new Map<number, string[]>();
  for (const cat of rawCats) {
    for (const gid of categoryGroupIds(cat)) {
      if (!claims.has(gid)) claims.set(gid, []);
      claims.get(gid)!.push(cat.id);
    }
  }
  const firstClaimant = new Map<number, string>();
  for (const [gid, ids] of claims) firstClaimant.set(gid, ids[0]!);

  const itemOwner = new Map<string, string>();
  const sharedGroups: Array<{ groupId: number; groupName: string; categories: string[] }> = [];
  const nameById = new Map(rawCats.map((c) => [c.id, c.name]));

  for (const [gid, ids] of claims) {
    if (ids.length < 2) continue;
    const groupName = groups.find((g) => g.id === gid)?.name ?? `group ${gid}`;
    sharedGroups.push({ groupId: gid, groupName, categories: ids.map((id) => nameById.get(id) ?? id) });
    for (const it of allCanvasItems) {
      if (it.groupId !== gid) continue;
      let best: string | null = null;
      let bestScore = 0;
      for (const cid of ids) {
        const score = categorySimilarity(nameById.get(cid), it.name);
        if (score > bestScore) { bestScore = score; best = cid; }
      }
      if (best && bestScore >= 0.5) itemOwner.set(it.id, best);
    }
  }

  const categories: CategoryResult[] = rawCats.map((cat) => {
    const weight = toNumber(cat.weight) ?? 0;
    const gids = categoryGroupIds(cat);

    let items: EngineItem[] = [];
    for (const gid of gids) {
      for (const it of allCanvasItems) {
        if (it.groupId !== gid) continue;
        const owner = itemOwner.get(it.id);
        if (owner) { if (owner === cat.id) items.push(it); }
        else if (firstClaimant.get(gid) === cat.id) items.push(it);
      }
    }
    for (const it of manualItems) if (it.categoryId === cat.id) items.push(it);
    if (gids.length === 0 && cat.id === "all") items.push(...looseItems);

    const dropLowest = Math.max(0, toNumber(cat.dropLowest) ?? 0);
    let droppedItems: EngineItem[] = [];
    if (dropLowest > 0) {
      // Only items with a percentage can be dropped. An ungraded item has no standing to lose, and
      // an extra-credit item — a score on a zero-point assignment — used to fall through
      // `itemPercent` as null and be coerced to 0%, so it ranked worst and was dropped first,
      // throwing the bonus away. At least one graded item always survives.
      const ranked = items
        .map((it, i) => ({ i, pct: itemPercent(it) }))
        .filter((r): r is { i: number; pct: number } => r.pct !== null)
        .sort((a, b) => a.pct - b.pct);
      const toDrop = Math.min(dropLowest, Math.max(0, ranked.length - 1));
      const drop = new Set(ranked.slice(0, toDrop).map((r) => r.i));
      if (drop.size > 0) {
        droppedItems = items.filter((_, i) => drop.has(i));
        items = items.filter((_, i) => !drop.has(i));
      }
    }

    // Extra credit adds to what was earned without adding to what was possible, which is what
    // Canvas does: a bonus worth 5 on a zero-point assignment lifts the total by 5 and leaves the
    // denominator alone. Filtering on `possible > 0` used to drop those points entirely.
    const scoredItems = items.filter((it) => it.earned !== null);
    const earned = scoredItems.reduce((s, it) => s + (it.earned ?? 0), 0);
    const possible = scoredItems
      .filter((it) => it.possible !== null && it.possible > 0)
      .reduce((s, it) => s + (it.possible ?? 0), 0);
    const currentPct = possible > 0 ? (earned / possible) * 100 : null;
    const ungradedPossible = items
      .filter((it) => it.earned === null && it.possible !== null && it.possible > 0)
      .reduce((s, it) => s + (it.possible ?? 0), 0);

    let projEarned = 0;
    let projPossible = 0;
    for (const it of items) {
      if (it.possible === null || it.possible <= 0) continue;
      projPossible += it.possible;
      projEarned += it.earned !== null ? it.earned : (it.possible * fill) / 100;
    }
    const projectedPct = projPossible > 0 ? (projEarned / projPossible) * 100 : items.length === 0 ? fill : null;

    return {
      id: cat.id,
      name: cat.name,
      weight,
      dropLowest,
      canvasGroupIds: gids,
      confidence: cat.confidence ?? null,
      items,
      droppedItems,
      gradedCount: scoredItems.length,
      ungradedCount: items.filter((it) => it.earned === null).length,
      totalCount: items.length,
      earned,
      possible,
      ungradedPossible,
      currentPct,
      projectedPct,
    };
  });

  const weightTotal = Math.round(categories.reduce((s, c) => s + c.weight, 0) * 100) / 100;

  const weighted = (pick: (c: CategoryResult) => number | null): number | null => {
    let num = 0;
    let den = 0;
    for (const c of categories) {
      const pct = pick(c);
      if (pct === null || !(c.weight > 0)) continue;
      num += c.weight * pct;
      den += c.weight;
    }
    return den > 0 ? num / den : null;
  };

  const currentRaw = weighted((c) => c.currentPct);
  const projectedRaw = weighted((c) => c.projectedPct);
  const currentCovered = categories.reduce((s, c) => (c.currentPct !== null ? s + c.weight : s), 0);
  const round2 = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100);

  // Each warning carries a stable key for translation plus ready-made English text.
  if (weightTotal > 0 && Math.abs(weightTotal - 100) > 0.51) {
    warnings.push({
      level: "warn",
      key: "warn.weightsNot100",
      params: { total: weightTotal },
      text: `Weights add up to ${weightTotal}%, not 100%. Scores are scaled proportionally, but the scheme is probably incomplete.`,
    });
  }
  if (unmappedGroups.length) {
    const names = unmappedGroups.map((g) => g.name).join(", ");
    warnings.push({
      level: "warn",
      key: `warn.unmappedGroups.${unmappedGroups.length > 1 ? "other" : "one"}`,
      params: { n: unmappedGroups.length, names },
      text: `${unmappedGroups.length} Canvas assignment group${unmappedGroups.length > 1 ? "s are" : " is"} not mapped to a syllabus category: ${names}. Their scores are not in the total yet.`,
    });
  }
  if (sharedGroups.length) {
    const groups2 = sharedGroups.map((s) => `“${s.groupName}”`).join(", ");
    const detail = sharedGroups.map((s) => `${s.groupName} → ${s.categories.join(" / ")}`).join("; ");
    warnings.push({
      level: "info",
      key: `warn.sharedGroups.${sharedGroups.length > 1 ? "other" : "one"}`,
      params: { groups: groups2, detail, group: sharedGroups[0]!.groupName },
      text: `${groups2} feed${sharedGroups.length > 1 ? "" : "s"} more than one syllabus category, so individual assignments were matched by name: ${detail}. Check that the split is right.`,
    });
  }
  const emptyCats = categories.filter((c) => c.totalCount === 0);
  if (emptyCats.length) {
    const names = emptyCats.map((c) => c.name).join(", ");
    warnings.push({
      level: "info",
      key: `info.emptyCategories.${emptyCats.length > 1 ? "other" : "one"}`,
      params: { names },
      text: `${names} ${emptyCats.length > 1 ? "have" : "has"} nothing in Canvas yet. The projected score assumes full marks for ${emptyCats.length > 1 ? "them" : "it"}.`,
    });
  }
  if (source === "none") {
    warnings.push({
      level: "info",
      key: "info.noScheme",
      text: "No grading scheme yet. Everything is treated as one flat category until you upload a syllabus.",
    });
  }
  if (source === "canvas" && groups.length && course.weighted === false) {
    warnings.push({
      level: "info",
      key: "info.canvasNoWeights",
      text: "Canvas is not weighting assignment groups for this course, so everything is graded by total points — the same way Canvas itself does it.",
    });
  }

  return {
    schemeSource: source,
    categories,
    weightTotal,
    currentCovered,
    unmappedGroups,
    droppedItems: categories.flatMap((c) => c.droppedItems),
    current: { pct: round2(currentRaw) },
    projected: { pct: round2(projectedRaw) },
    warnings,
  };
}

/** What do you need on the work still ungraded, to finish at `targetPct`? */
export function requiredOnRemaining(course: GradeCourse, targetPct: number, settings: { ungradedFillPercent?: number } = {}) {
  const g = computeCourseGrade(course, settings);
  const weightTotal = g.weightTotal || 100;

  let banked = 0;
  let remainingWeight = 0;
  for (const c of g.categories) {
    if (!(c.weight > 0)) continue;

    // Everything this category can still contribute, graded or not. The graded share is banked at
    // the points *actually earned* rather than at the category's running percentage: that
    // percentage is computed over the graded items alone, so using it for the whole category
    // counts the ungraded half twice — once as though already earned, and again as weight still
    // to come. With "100 points graded at 50%, 100 points ungraded, target 90%" that reported
    // 80% needed when the best reachable result is 75%.
    const total = c.possible + c.ungradedPossible;
    if (c.currentPct === null || total <= 0) {
      remainingWeight += c.weight;
      continue;
    }
    banked += (c.weight * c.earned) / total;
    remainingWeight += (c.weight * c.ungradedPossible) / total;
  }

  if (remainingWeight <= 0) return { possible: false, final: g.current.pct, needed: null, remainingWeight: 0, alreadySecured: false };

  const needed = (((targetPct * weightTotal) / 100 - banked) / remainingWeight) * 100;
  return {
    possible: needed <= 100,
    needed: Math.round(needed * 100) / 100,
    banked: Math.round(banked * 100) / 100,
    remainingWeight: Math.round(remainingWeight * 100) / 100,
    alreadySecured: needed <= 0,
  };
}
