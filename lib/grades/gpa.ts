// UMD GPA, per the Office of the University Registrar.
//   https://registrar.umd.edu/grades-records/grades/gpa-calculation  (policy III-6.20(A))
//   https://registrar.umd.edu/grades-records/grades/course-repeats
//
// Undergraduate: A+/A 4.0 … D- 0.7, F/XF 0.0; I, P, S, W and NGR are excluded entirely; zero-level
// courses (MATH003) are excluded; GPA = quality points ÷ attempted credits and is TRUNCATED at the
// third decimal, never rounded (29.3 ÷ 13 = 2.2538… → 2.253).
// Graduate: D+, D and D- are worth 0.0, only 400-level and above count, 500-level/799/898/899 and
// S-graded courses are excluded, and a repeat takes the most recent grade rather than the best one.

export type Level = "undergraduate" | "graduate";

export const UG_QUALITY_POINTS: Readonly<Record<string, number>> = {
  "A+": 4.0, A: 4.0, "A-": 3.7,
  "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7,
  "D+": 1.3, D: 1.0, "D-": 0.7,
  F: 0.0, XF: 0.0,
};

export const GRAD_QUALITY_POINTS: Readonly<Record<string, number>> = {
  "A+": 4.0, A: 4.0, "A-": 3.7,
  "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7,
  "D+": 0.0, D: 0.0, "D-": 0.0,
  F: 0.0,
};

// Marks the registrar explicitly leaves out of the GPA.
export const NON_GPA_MARKS = ["I", "P", "S", "W", "NGR", "NG", "AU", "NC", "--", ""] as const;
const NON_GPA = new Set<string>(NON_GPA_MARKS);

export const ALL_LETTERS = [
  "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F", "XF", "I", "P", "S", "W", "NGR",
];

// Anything a syllabus or Canvas might hand us, collapsed to a grade symbol.
export function normaliseLetter(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  let s = String(raw).trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return "";
  s = s.replace(/MINUS|NEGATIVE/g, "-").replace(/PLUS|POSITIVE/g, "+");
  if (s === "AUDIT") return "AU";
  if (s === "WITHDRAWN" || s === "W") return "W";
  if (s === "INCOMPLETE" || s === "I*") return "I";
  if (s === "PASS") return "P";
  if (s === "FAIL") return "F";
  const m = s.match(/^([ABCDF])\s*([+-])?$/);
  if (m) return m[1] + (m[2] ?? "");
  if (s === "XF") return "XF";
  return s;
}

/** Quality points for a letter, or null when the mark is excluded from the GPA. */
export function qualityPoints(letter: unknown, level: Level = "undergraduate"): number | null {
  const L = normaliseLetter(letter);
  if (!L || NON_GPA.has(L)) return null;
  const table = level === "graduate" ? GRAD_QUALITY_POINTS : UG_QUALITY_POINTS;
  return Object.prototype.hasOwnProperty.call(table, L) ? table[L]! : null;
}

/**
 * Truncate to 3 decimals the way the registrar does — floor, not round.
 * The epsilon snap removes binary floating-point noise so an exact value such as 2.253 is never
 * knocked down to 2.252 by a 2.2529999999999997 artefact.
 */
export function truncate3(x: number | null): number | null {
  if (x === null || !Number.isFinite(x)) return null;
  const negative = x < 0;
  const snapped = Math.round(Math.abs(x) * 1000 * 1e6) / 1e6;
  const floored = Math.floor(snapped) / 1000;
  return negative ? -floored : floored;
}

/** "CMSC132" → 132, "MATH003" → 3, "ENGL101H" → 101. */
export function courseNumber(code: unknown): number | null {
  if (!code) return null;
  const m = String(code).match(/(\d+)/);
  return m ? parseInt(m[1]!, 10) : null;
}

/** Courses numbered below 100 (MATH003) never enter the GPA. */
export function isZeroLevel(code: unknown): boolean {
  const n = courseNumber(code);
  return n !== null && n < 100;
}

export type SkipReason = { key: string; params?: Record<string, unknown>; text: string };

/**
 * Why a course would be skipped in a graduate GPA, or null when it counts.
 * The registrar lists "courses at the 500-level" as excluded; that is read literally as the 500–599
 * band, and 799/898/899 are named separately.
 */
export function graduateExclusionReason(code: unknown, letter: unknown): SkipReason | null {
  const L = normaliseLetter(letter);
  if (L === "S") return { key: "gpa.skip.gradS", text: "S-graded courses are not counted for graduate GPA" };
  const n = courseNumber(code);
  if (n === null) return null;
  if (n < 400) {
    return { key: "gpa.skip.gradBelow400", params: { n }, text: `Course number ${n} is below 400, so it is not counted` };
  }
  if (n >= 500 && n <= 599) {
    return { key: "gpa.skip.grad500", params: { n }, text: `${n} is a 500-level course, which is not counted` };
  }
  if (n === 799 || n === 898 || n === 899) {
    return { key: "gpa.skip.gradNamed", params: { n }, text: `${n} is not counted for graduate GPA` };
  }
  return null;
}

export type GpaCourse = {
  code: string;
  title?: string;
  credits: number | null;
  letter?: string | null;
  term?: string | null;
  termIndex?: number;
  excluded?: boolean;
  /** Undergraduate repeat exception: first semester, or within the first 24 attempted credits. */
  dropLower?: boolean;
  repeatKey?: string;
  id?: string;
  pct?: number | null;
  basis?: string;
  provisional?: boolean;
  source?: string;
};

type Row = GpaCourse & {
  letter: string;
  credits: number;
  termIndex: number;
  repeatKey: string;
  qp: number;
  qualityPoints: number;
};

export type GpaResult = {
  level: Level;
  gpa: number | null;
  exact: number | null;
  totalCredits: number;
  totalQualityPoints: number;
  counted: Row[];
  dropped: Array<GpaCourse & { reason?: string; reasonKey?: string }>;
  skipped: Array<GpaCourse & { reason?: string; reasonKey?: string }>;
  notes: Array<{ code: string; level: Level; key?: string; params?: Record<string, unknown>; text: string }>;
};

/**
 * Collapse repeat groups. Undergraduate: every attempt counts, unless the student flagged the
 * first-semester / first-24-credit exception, in which case only the highest grade counts.
 * Graduate: only the most recent attempt counts, whether the grade went up or down.
 */
export function applyRepeats(rows: Row[], level: Level) {
  const dropped: Array<GpaCourse & { reason?: string; reasonKey?: string }> = [];
  const notes: GpaResult["notes"] = [];
  const groups = new Map<string, Array<Row & { __i: number }>>();

  rows.forEach((r, i) => {
    const key = r.repeatKey;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ ...r, __i: i });
  });

  const keep = new Set(rows.map((_, i) => i));

  for (const [key, attempts] of groups) {
    if (attempts.length < 2) continue;

    if (level === "graduate") {
      const newest = [...attempts].sort((a, b) => (b.termIndex ?? b.__i) - (a.termIndex ?? a.__i))[0]!;
      for (const a of attempts) {
        if (a.__i === newest.__i) continue;
        keep.delete(a.__i);
        dropped.push({ ...a, reasonKey: "gpa.drop.gradRepeat", reason: "repeat — graduate: most recent grade counts" });
      }
      notes.push({
        code: key,
        level,
        key: "gpa.repeat.grad",
        params: { letter: newest.letter || "—" },
        text: `Repeated course: only your most recent attempt (${newest.letter || "—"}) counts.`,
      });
      continue;
    }

    if (!attempts.some((a) => a.dropLower)) {
      notes.push({ code: key, level, key: "gpa.repeat.ugAll", text: "Repeated course: every attempt is included in your GPA." });
      continue;
    }

    const best = attempts.reduce((a, b) => (b.qp > a.qp ? b : a));
    for (const a of attempts) {
      if (a.__i === best.__i) continue;
      keep.delete(a.__i);
      dropped.push({ ...a, reasonKey: "gpa.drop.ugRepeat", reason: "repeat — first-semester / first-24-credit exception: higher grade counts" });
    }
    notes.push({
      code: key,
      level,
      key: "gpa.repeat.ugDrop",
      params: { letter: best.letter || "—" },
      text: `Repeated course within your first semester or first 24 credits: only the higher grade (${best.letter || "—"}) counts.`,
    });
  }

  return { kept: rows.filter((_, i) => keep.has(i)), dropped, notes };
}

export type GpaOptions = { level?: Level; includeZeroLevel?: boolean; includeGradIneligible?: boolean };

export function computeGpa(courses: GpaCourse[] = [], opts: GpaOptions = {}): GpaResult {
  const level: Level = opts.level === "graduate" ? "graduate" : "undergraduate";
  const rows: Row[] = [];
  const skipped: GpaResult["skipped"] = [];

  courses.forEach((c, i) => {
    const letter = normaliseLetter(c.letter);
    const credits = Number(c.credits);
    const base: GpaCourse = {
      ...c,
      letter,
      credits,
      termIndex: c.termIndex ?? i,
      repeatKey: c.repeatKey ?? c.code ?? `__row${i}`,
    };

    if (c.excluded) {
      skipped.push({ ...base, reasonKey: "gpa.skip.excluded", reason: "Excluded by you" });
      return;
    }
    if (!letter) {
      skipped.push({ ...base, reasonKey: "gpa.skip.noLetter", reason: "No letter grade yet — it has no quality points until the course is graded" });
      return;
    }
    if (NON_GPA.has(letter)) {
      skipped.push({ ...base, reasonKey: "gpa.skip.nonGpa", reason: `${letter} is not included in the GPA` });
      return;
    }
    const qp = qualityPoints(letter, level);
    if (qp === null) {
      skipped.push({ ...base, reasonKey: "gpa.skip.notGpaGrade", reason: `${letter} is not a GPA grade` });
      return;
    }
    if (!Number.isFinite(credits) || credits <= 0) {
      skipped.push({ ...base, reasonKey: "gpa.skip.noCredits", reason: "No credit value set" });
      return;
    }
    if (level === "undergraduate" && isZeroLevel(base.code) && !opts.includeZeroLevel) {
      skipped.push({ ...base, reasonKey: "gpa.skip.zeroLevel", reason: "Zero-level course — not counted" });
      return;
    }
    if (level === "graduate" && !opts.includeGradIneligible) {
      const why = graduateExclusionReason(base.code, letter);
      if (why) {
        skipped.push({ ...base, reasonKey: why.key, reason: why.text });
        return;
      }
    }
    rows.push({ ...base, letter, credits, termIndex: base.termIndex!, repeatKey: base.repeatKey!, qp, qualityPoints: qp * credits });
  });

  const { kept, dropped, notes } = applyRepeats(rows, level);
  const totalCredits = kept.reduce((s, r) => s + r.credits, 0);
  const totalQuality = kept.reduce((s, r) => s + r.qualityPoints, 0);
  const exact = totalCredits > 0 ? totalQuality / totalCredits : null;

  return {
    level,
    gpa: exact === null ? null : truncate3(exact),
    exact,
    totalCredits,
    totalQualityPoints: Number(totalQuality.toFixed(4)),
    counted: kept,
    dropped,
    skipped,
    notes,
  };
}

/** Split a mixed course list into a per-term breakdown plus a cumulative row. */
export function computeGpaTerms(courses: GpaCourse[], opts: GpaOptions = {}) {
  const byTerm = new Map<string, GpaCourse[]>();
  courses.forEach((c, i) => {
    const key = c.term || "Unscheduled";
    if (!byTerm.has(key)) byTerm.set(key, []);
    byTerm.get(key)!.push({ ...c, termIndex: c.termIndex ?? i });
  });
  const terms = [...byTerm.entries()].map(([term, list]) => ({ term, list, ...computeGpa(list, opts) }));
  return { terms, cumulative: computeGpa(courses, opts) };
}

export type LetterCut = { letter: string; min: number };

/** Used only when a syllabus states no scale of its own; UMD sets no university-wide cut-off. */
export const DEFAULT_LETTER_SCALE: LetterCut[] = [
  { letter: "A+", min: 97 }, { letter: "A", min: 93 }, { letter: "A-", min: 90 },
  { letter: "B+", min: 87 }, { letter: "B", min: 83 }, { letter: "B-", min: 80 },
  { letter: "C+", min: 77 }, { letter: "C", min: 73 }, { letter: "C-", min: 70 },
  { letter: "D+", min: 67 }, { letter: "D", min: 63 }, { letter: "D-", min: 60 },
  { letter: "F", min: 0 },
];

export function letterFromPercent(pct: number | null, scale: LetterCut[] = DEFAULT_LETTER_SCALE): string {
  if (pct === null || !Number.isFinite(pct)) return "";
  for (const cut of [...scale].sort((a, b) => b.min - a.min)) {
    if (pct >= cut.min - 1e-9) return normaliseLetter(cut.letter);
  }
  return "F";
}
