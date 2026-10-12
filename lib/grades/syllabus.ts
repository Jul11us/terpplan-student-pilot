// Reads a syllabus and pulls out the grading structure: the weighted categories ("Homework 20%,
// Midterm 30%, Final 40%"), the letter-grade cut-offs ("A 93–100"), any drop policy, and point-based
// schemes ("Homework 300 points").
//
// Deliberately heuristic, and deliberately not allowed to be silently wrong: every result carries the
// raw lines it came from plus a confidence score, and the UI requires the student to confirm before
// anything is computed. A calculator that quietly mis-reads a syllabus is worse than one that admits
// it could not.
//
// Handles both dotted-leader tables and prose that wraps across lines ("The midterm exam is worth\n30%,
// and the final exam is worth 40%"), and tolerates Chinese syllabi (作业 20% / 期中考试 30%).

import { autoMapCategories, canonicalCategory, labelsAreSameWork, hasCJK } from "@/lib/grades/grading";
import type { Scheme } from "@/lib/grades/grading";
import type { LetterCut } from "@/lib/grades/gpa";

const HEADING_RE = new RegExp(
  [
    "grad(?:e|es|ing)\\s*(?:policy|policies|breakdown|structure|distribution|scheme|criteria|system|scale)?",
    "basis\\s+of\\s+grad(?:e|ing)",
    "how\\s+(?:you\\s+)?(?:will\\s+be\\s+)?graded",
    "assessment(?:s)?\\s*(?:and\\s+evaluation|breakdown|plan|overview)?",
    "evaluation\\s*(?:criteria|breakdown|methods)?",
    "course\\s+requirements\\s+and\\s+grading",
    "points?\\s+distribution",
    "breakdown\\s+of\\s+grades",
  ].join("|"),
  "i",
);

// A heading that really introduces a grading scheme. Used only to rank candidates — HEADING_RE
// above still governs the zone.
const HEADING_STRONG_RE = new RegExp(
  [
    "grad(?:e|es|ing)\\s+(?:policy|policies|breakdown|structure|distribution|scheme|criteria|system|scale)",
    "basis\\s+of\\s+grad(?:e|ing)",
    "how\\s+(?:you\\s+)?(?:will\\s+be\\s+)?graded",
    "assessment(?:s)?\\s+(?:and\\s+evaluation|breakdown|plan|overview)",
    "evaluation\\s+(?:criteria|breakdown|methods)",
    "course\\s+requirements\\s+and\\s+grading",
    "points?\\s+distribution",
    "breakdown\\s+of\\s+grades",
  ].join("|"),
  "i",
);

/**
 * Rank a line as "the heading of the grading section". Higher is better; -Infinity means it is not
 * a candidate at all. The decisive signals are that it names a grading artefact rather than merely
 * containing the word "grade", and that the line after it carries weights.
 */
function scoreGradingHeading(line: string, next: string): number {
  let score: number;
  if (HEADING_STRONG_RE.test(line)) score = 4;
  else if (HEADING_RE.test(line)) score = 1;
  else return Number.NEGATIVE_INFINITY;

  if (line.length <= 40) score += 1;
  if (/^[A-Z]/.test(line)) score += 1;
  // Prose that merely mentions grades: "Midterm grades posted", "Grades will be posted within…".
  if (/\b(?:posted|will|you|your|must|should|are|is|was|were|unless|available)\b/i.test(line)) score -= 3;
  if (/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(line)) score -= 2;
  if (/\d{1,2}\s*[/-]\s*\d{1,2}/.test(line)) score -= 3;
  if (/[.!?]$/.test(line)) score -= 2;
  // A heading is normally followed by rows carrying weights.
  if (/\d{1,3}(?:\.\d+)?\s*%/.test(next)) score += 3;
  return score;
}

const SCALE_HEADING_RE = new RegExp(
  [
    "grad(?:ing|e)\\s*scale",
    "letter\\s+grades?",
    "grade\\s+conversion",
    "grade\\s+equivalen",
    "final\\s+grade\\s+scale",
    "grading\\s+standards?",
    "how\\s+letter\\s+grades",
  ].join("|"),
  "i",
);

const NON_CATEGORY_LABELS = new Set([
  "total", "totals", "grand total", "sum", "overall", "overall total",
  "total points", "total percent", "total percentage", "grade", "grades",
  "final grade", "course grade", "your grade", "component", "components",
  "category", "categories", "item", "items", "assessment", "assessments",
  "weight", "weights", "percentage", "percent", "points", "pts", "score",
  "graded work", "requirement", "requirements", "date", "dates", "week",
]);

const SENTENCE_CUES = new RegExp(
  [
    "\\bmust\\b", "\\bshould\\b", "\\bneed(?:s|ed)?\\b", "\\brequired\\b",
    "\\bearn\\b", "\\bachieve\\b", "\\breceive\\b", "\\bexpect(?:ed)?\\b",
    "\\bbelow\\b", "\\babove\\b", "\\bat\\s+least\\b", "\\bmore\\s+than\\b",
    "\\bless\\s+than\\b", "\\bno\\s+later\\b", "\\bwill\\s+be\\b",
    "\\bpoints?\\s+off\\b", "\\bper\\s+day\\b", "\\blate\\b",
    "\\bpenalt", "\\bdeduct", "\\bmissed\\b", "\\bunexcused\\b",
    "\\bcurve", "\\bextra\\s+credit\\s+opportunit",
    // Declarations about the scheme as a whole, not a category:
    // "This course is graded out of 1000 points." must not become a category.
    "\\bthis\\b", "\\bthese\\b", "\\bout\\s+of\\b", "\\bis\\s+graded\\b",
    "\\bare\\s+graded\\b", "\\bbased\\s+on\\b", "\\bconsists?\\b",
    "\\bcomprises?\\b", "\\bcomputed\\b", "\\bcalculated\\b",
    "\\bthere\\s+(?:are|is)\\b", "\\bfor\\s+example\\b", "\\bi\\.e\\.",
    "\\bsee\\s+the\\b", "\\bnote\\s+that\\b",
  ].join("|"),
  "i",
);

const LIST_PREFIX_RE = /^\s*(?:[-–—•*·▪o>]|\(?[a-z0-9]{1,3}[.)])\s+/i;

// A label that is really the heading of the grading section. Rejoining a wrapped paragraph can fuse
// a heading onto the first row beneath it ("Grade Breakdown 15% Participation …").
const HEADING_LABEL_RE =
  /^(?:grades?|grading|assessments?|evaluations?|course\s+requirements?)\s+(?:polic(?:y|ies)|breakdown|structure|distribution|scheme|criteria|system|scale|plan|overview|and\s+evaluation|components?|weights?|methods?)$/i;

const TRAILING_NOISE_RE =
  /\s*(?:[-–—:;,.]*\s*)?(?:of\s+(?:your\s+|the\s+|my\s+)?(?:final\s+|overall\s+|total\s+|course\s+)?grade|of\s+(?:your\s+)?(?:final\s+|overall\s+|total\s+)?(?:course\s+)?(?:mark|score)|toward\s+(?:your\s+)?(?:final\s+)?grade|of\s+total|total|approx(?:imately)?\.?)\s*$/i;

function toLines(text: unknown): string[] {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((l) => l.trim());
}

/**
 * Collapse dot leaders, underscores and tab runs so a table row and a dot-leader row end up looking
 * the same: "Homework  20%".
 */
function normaliseLine(line: string): string {
  return line
    .replace(/[.\u2026·•]{2,}/g, " ")
    .replace(/_{2,}/g, " ")
    .replace(/\t+/g, " ")
    .replace(/\uff05/g, "%")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLabel(label: string): string {
  let s = String(label ?? "");
  s = s.replace(LIST_PREFIX_RE, "");
  s = s.replace(/^[\s:;,.\-–—]+/, "");
  s = s.replace(/[\s:;,.\-–—]+$/, "");
  s = s.replace(/^\(+/, "").replace(/\)+$/, "");
  s = s.replace(/^\[+/, "").replace(/\]+$/, "");
  s = s.replace(TRAILING_NOISE_RE, "");
  s = s.replace(/\s+/g, " ").trim();
  // A leading article is prose, not part of the category name.
  s = s.replace(/^(?:the|a|an|your|my|our)\s+/i, "");
  // A trailing parenthetical that only restates the weight is noise.
  s = s.replace(/\s*\((?:about\s+)?\d{1,3}(?:\.\d+)?\s*%?\)\s*$/i, "").trim();
  return s;
}

function isPlausibleLabel(label: string): boolean {
  if (!label) return false;
  const l = label
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!l) return false;
  if (l.length < 2 || l.length > 64) return false;
  if (!/[a-z\u4e00-\u9fff]/.test(l)) return false;
  const words = l.split(" ").filter(Boolean);
  if (words.length > 7) return false;
  // Chinese has no spaces, so a sentence is one "word". Cap its length instead.
  if (hasCJK(l) && l.replace(/[^\u3400-\u4dbf\u4e00-\u9fff]/g, "").length > 12) return false;
  if (NON_CATEGORY_LABELS.has(l)) return false;
  if (HEADING_LABEL_RE.test(l)) return false;
  if (SCALE_HEADING_RE.test(l)) return false;
  if (/^(?:sub)?total\b/.test(l)) return false;
  if (SENTENCE_CUES.test(l)) return false;
  if (/^(?:week|wk|day|mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/.test(l)) return false;
  if (/^[\d\s.\-–—%]+$/.test(l)) return false;
  // A truncated sentence: "this course is graded out of", "points for the".
  if (/\b(?:of|out|in|on|for|to|with|at|by|from|and|or|the|a|an|as|that|which)$/.test(l)) return false;
  // A real category name never contains a figure with a unit. This stops a rejoined table
  // ("Participation 35% Midterm 50% Final Exam") being taken for one oddly named category.
  if (/\d{1,3}(?:\.\d+)?\s*(?:%|percent)/i.test(label)) return false;
  if (/\b\d{2,4}\s*(?:pts?|points?)\b/i.test(label)) return false;
  return true;
}

const LETTER_TOKEN = /^(?:A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F|XF)$/;

function normaliseLetterToken(t: unknown): string | null {
  if (!t) return null;
  const s = String(t).toUpperCase().replace(/[^A-F+\-X]/g, "");
  return LETTER_TOKEN.test(s) ? s : null;
}

function num(v: unknown): number | null {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export type ScaleEntry = LetterCut;

/**
 * Pull (letter, minimum-percent) pairs out of the text. Scans comma/semicolon/tab-separated segments
 * so one dense line — "A 93-100, A- 90-92, B+ 87-89" — yields three entries.
 *
 * Two shapes from the real UMD table shape these patterns: a third column holding the GPA
 * ("93-100  A / A+  4.0"), and two letters covering one band. Both are tolerated as a trailing tail
 * rather than being mistaken for "no scale stated", which is what a `$`-anchored pattern did.
 */
export function extractLetterScale(text: unknown): { scale: ScaleEntry[]; evidence: Array<{ line: number; text: string }>; confident: boolean } {
  const lines = toLines(text);
  const found: ScaleEntry[] = [];
  const evidence: Array<{ line: number; text: string }> = [];
  const SEG_SPLIT = /\s*[,;|]\s*|\s{3,}/;

  const patterns: Array<{ re: RegExp; min: (m: RegExpMatchArray) => number | null }> = [
    // A 93-100 / A: 93–96 / A 93 至 96 分
    { re: /^([A-F][+-]?)(?:\s*[/&]\s*[A-F][+-]?)*\s*[:\-=]?\s*(\d{1,3}(?:\.\d+)?)\s*(?:-|–|—|to|through|~|至)\s*(\d{1,3}(?:\.\d+)?)\s*%?\s*分?(?:\s+\d(?:\.\d+)?)?$/i, min: (m) => num(m[2]) },
    // A 93% and above / A 93+
    { re: /^([A-F][+-]?)\s*[:\-=]?\s*(\d{1,3}(?:\.\d+)?)\s*%?\s*(?:\+|and\s+(?:above|up|higher|over)|or\s+(?:above|higher|better|more)|above|or\s+better).*$/i, min: (m) => num(m[2]) },
    // A (93%)
    { re: /^([A-F][+-]?)\s*[\(\[]\s*(\d{1,3}(?:\.\d+)?)\s*%?\s*[\)\]](?:\s+\d(?:\.\d+)?)?$/i, min: (m) => num(m[2]) },
    // A = 93
    { re: /^([A-F][+-]?)\s*[:\-=]\s*(\d{1,3}(?:\.\d+)?)\s*%?(?:\s+\d(?:\.\d+)?)?$/i, min: (m) => num(m[2]) },
    // 93-100 = A
    { re: /^(\d{1,3}(?:\.\d+)?)\s*%?\s*(?:-|–|—|to|through|~|至)\s*(\d{1,3}(?:\.\d+)?)\s*%?\s*分?\s*[:\-=]?\s*([A-F][+-]?)(?:\s*[/&]\s*[A-F][+-]?)*(?:\s+\d(?:\.\d+)?)?$/i, min: (m) => num(m[1]) },
    // 93 and above → A
    { re: /^(\d{1,3}(?:\.\d+)?)\s*%?\s*(?:\+|and\s+(?:above|up|higher|over)|or\s+(?:above|higher|better))?\s*[:\-=]?\s*([A-F][+-]?)$/i, min: (m) => num(m[1]) },
    // F below 60
    { re: /^([A-F][+-]?)\s*[:\-=]?\s*(?:below|under|less\s+than)\s+(\d{1,3}(?:\.\d+)?)/i, min: () => 0 },
    // below 60 = F
    { re: /^(?:below|under|less\s+than)\s+(\d{1,3}(?:\.\d+)?)\s*%?\s*[:\-=]?\s*([A-F][+-]?)$/i, min: () => 0 },
    // A 93 (bare, last resort)
    { re: /^([A-F][+-]?)\s+(\d{1,3}(?:\.\d+)?)\s*%?(?:\s+\d(?:\.\d+)?)?$/i, min: (m) => num(m[2]) },
  ];

  const seen = new Set<string>();

  lines.forEach((raw, lineIndex) => {
    const line = normaliseLine(raw);
    if (!line || line.length > 220) return;
    for (const segment of line.split(SEG_SPLIT)) {
      const s = segment.trim();
      if (!s || s.length > 40) continue;
      for (const p of patterns) {
        const m = s.match(p.re);
        if (!m) continue;
        const letter = normaliseLetterToken(m[1]) ?? normaliseLetterToken(m[3]) ?? normaliseLetterToken(m[2]);
        if (!letter) continue;
        const min = p.min(m);
        if (min === null || min < 0 || min > 100) continue;
        if (seen.has(letter)) break;
        seen.add(letter);
        found.push({ letter, min });
        evidence.push({ line: lineIndex, text: line });
        break;
      }
    }
  });

  // A real scale has a spread of letters; reject fragments like a lone "A 90".
  const looksReal = found.length >= 4 && new Set(found.map((f) => f.letter)).size >= 4;
  if (!looksReal) return { scale: [], evidence: [], confident: false };
  return { scale: found.sort((a, b) => b.min - a.min), evidence: evidence.slice(0, 16), confident: true };
}

type Candidate = {
  name: string;
  value: number;
  unit: "pct" | "pts";
  line: number;
  inGradingZone: boolean;
  fromProse: boolean;
  raw: string;
  weight?: number;
  derivedFromPoints?: { points: number; total: number };
};

function extractWeightCandidates(text: unknown): Candidate[] {
  const lines = toLines(text);
  const candidates: Candidate[] = [];

  const gradingZone: boolean[] = [];
  let inZone = false;
  lines.forEach((raw) => {
    const line = normaliseLine(raw);
    if (HEADING_RE.test(line) && line.length < 90) inZone = true;
    else if (inZone && line.length > 0 && /^[A-Z][A-Za-z ]{3,60}$/.test(line) && !/\d/.test(line) && !HEADING_RE.test(line)) inZone = false;
    gradingZone.push(inZone);
  });

  const weightPatterns: Array<{ re: RegExp; unit: "pct" | "pts"; swap?: boolean }> = [
    // Homework (20%)
    { re: /^(.{2,64}?)\s*\(\s*(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b)\s*\)/i, unit: "pct" },
    // Homework: 20%   /   Homework – 20 %
    { re: /^(.{2,64}?)\s*[:=–—]\s*(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b)/i, unit: "pct" },
    // Homework is worth 20%
    { re: /^(.{2,64}?)\s+(?:is\s+|are\s+)?worth\s+(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b)/i, unit: "pct" },
    // Homework 20%
    { re: /^(.{2,64}?)\s+(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b)/i, unit: "pct" },
    // 20% Homework. The percent group stays CAPTURING: `swap` reads the label out of m[3], and
    // making it non-capturing silently shifts the label to m[2] and drops every leading-percentage
    // line. Caught by tests/grades.test.mjs — do not "tidy" it.
    { re: /^(\d{1,3}(?:\.\d+)?)\s*(%|percent)\s*[-–—:]?\s*(.{2,64})$/i, unit: "pct", swap: true },
    // Homework (200 points)
    { re: /^(.{2,64}?)\s*[\(\[]?\s*(\d{1,4})\s*(?:pts?|points?)\s*[\)\]]?/i, unit: "pts" },
    // Homework: 200 points
    { re: /^(.{2,64}?)\s*[:=–—]\s*(\d{1,4})\s*(?:pts?|points?)\b/i, unit: "pts" },
    // 作业20% — Chinese types no space before the figure. Last, so it only takes lines the patterns
    // above did not already claim.
    { re: /^([^\d]{2,30}?)\s*(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b|分)/, unit: "pct" },
  ];

  const push = (s: string, lineIndex: number, fromProse: boolean) => {
    if (!s || s.length > 200) return;
    const hits = (s.match(/%|percent/gi) ?? []).length;
    const pieces = hits > 1 ? s.split(/\s*(?:,|;|\band\b)\s*/i) : [s];

    for (const piece of pieces) {
      const seg = piece.trim();
      if (!seg || seg.length > 120) continue;
      for (const p of weightPatterns) {
        const m = seg.match(p.re);
        if (!m) continue;
        const rawLabel = p.swap ? m[3]! : m[1]!;
        const rawValue = p.swap ? m[1]! : m[2]!;
        const label = stripLabel(rawLabel);
        const value = num(rawValue);
        if (value === null || value <= 0) break;
        if (p.unit === "pct" && value > 100) break;
        if (!isPlausibleLabel(label)) break;
        candidates.push({ name: label, value, unit: p.unit, line: lineIndex, inGradingZone: gradingZone[lineIndex] ?? false, fromProse, raw: s });
        break;
      }
    }
  };

  // Pass 1: one candidate per physical line (tables, lists).
  lines.forEach((raw, i) => {
    const line = normaliseLine(raw);
    if (!line || line.length > 240) return;
    push(line, i, false);
  });

  // Pass 2: sentences that genuinely straddle a line break. A sentence contained in a single line was
  // already read by pass 1, and re-reading it after joining is what turns a column of rows into one
  // bogus category.
  const SENTINEL = "\u0001";
  const blocks: Array<{ lines: string[]; start: number }> = [];
  let cur: string[] = [];
  let curStart = 0;
  lines.forEach((raw, i) => {
    const line = normaliseLine(raw);
    if (!line) {
      if (cur.length) blocks.push({ lines: cur, start: curStart });
      cur = [];
      return;
    }
    if (!cur.length) curStart = i;
    cur.push(line);
  });
  if (cur.length) blocks.push({ lines: cur, start: curStart });

  for (const b of blocks) {
    const joined = b.lines.join(` ${SENTINEL} `);
    if (joined.length > 1600) continue;
    for (const sentence of joined.replace(/([.;!?])\s+/g, "$1\u0000").split("\u0000")) {
      if (!sentence.includes(SENTINEL)) continue;
      push(sentence.split(SENTINEL).join(" ").trim(), b.start, true);
    }
  }

  return candidates;
}

/**
 * Prefer the coherent block of candidates that reads like a real breakdown. Syllabi happily say
 * "participation is 10% of your grade" in a policies paragraph; the real table is a run of adjacent
 * lines that totals ~100.
 */
function selectCluster(candidates: Candidate[]): { chosen: Candidate[]; mode: string; clusterTotal?: number } {
  if (candidates.length <= 3) return { chosen: candidates, mode: "all" };

  const sorted = [...candidates].sort((a, b) => a.line - b.line);
  const clusters: Candidate[][] = [];
  let current: Candidate[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.line - sorted[i - 1]!.line <= 4) current.push(sorted[i]!);
    else { clusters.push(current); current = [sorted[i]!]; }
  }
  clusters.push(current);

  let best: { cluster: Candidate[]; total: number; cost: number } | null = null;
  for (const cluster of clusters) {
    const pct = cluster.filter((c) => c.unit === "pct");
    if (pct.length < 3) continue;
    if (new Set(pct.map((c) => c.name.toLowerCase())).size < 3) continue;
    const total = pct.reduce((s, c) => s + c.value, 0);
    const cost = Math.abs(total - 100) + (cluster.some((c) => c.inGradingZone) ? 0 : 8);
    if (!best || cost < best.cost) best = { cluster, total, cost };
  }

  if (!best || best.total < 88 || best.total > 112) {
    const zoned = candidates.filter((c) => c.inGradingZone);
    return { chosen: zoned.length >= 2 ? zoned : candidates, mode: zoned.length >= 2 ? "percent-zone" : "percent-all" };
  }
  return { chosen: best.cluster, mode: "percent", clusterTotal: best.total };
}

/** Fold duplicate rows that restate the same category and weight. Line-based hits beat prose ones. */
function dedupe(candidates: Candidate[]): Candidate[] {
  const ordered = [...candidates].sort((a, b) => Number(a.fromProse) - Number(b.fromProse));
  const out: Candidate[] = [];
  for (const c of ordered) {
    const dup = out.some((o) => o.value === c.value && o.unit === c.unit && labelsAreSameWork(o.name, c.name));
    if (!dup) out.push(c);
  }
  return out;
}

/** Convert a points-only scheme into percentages. */
function pointsToPercent(candidates: Candidate[]): Candidate[] | null {
  const pts = candidates.filter((c) => c.unit === "pts");
  if (pts.length < 2) return null;
  const total = pts.reduce((s, c) => s + c.value, 0);
  if (total <= 0 || total < 50) return null;
  return pts.map((c) => ({
    ...c,
    unit: "pct" as const,
    weight: Math.round((c.value / total) * 100 * 100) / 100,
    derivedFromPoints: { points: c.value, total },
  }));
}

const DROP_RE = /(?:drop|drops|dropped|discard|discarded|excluded?)\s+(?:the\s+)?(?:lowest|low|worst)\s*(?:one|two|three|\d+)?\s*([a-z][a-z\s-]{2,28})?/gi;
const DROP_RE_ALT = /(?:the\s+)?(?:lowest|low)\s*(?:one|two|three|\d+)?\s*([a-z][a-z\s-]{2,28}?)\s*(?:grade|score|quiz|assignment|homework|lab|exam|test)?\s*(?:will\s+be|is|are|gets?|may\s+be)?\s*(?:dropped|discarded|excluded)/gi;
const WORD_COUNTS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, a: 1, an: 1, single: 1 };

export type DropRule = { count: number; subject: string; raw: string };

export function extractDropRules(text: unknown): DropRule[] {
  const flat = String(text ?? "").replace(/\s+/g, " ");
  const rules: DropRule[] = [];
  const scan = (re: RegExp) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(flat)) !== null) {
      let count = 1;
      const cm = m[0].match(/\b(one|two|three|four|a|an|single|\d+)\b/i);
      if (cm) {
        const w = cm[1]!.toLowerCase();
        count = WORD_COUNTS[w] ?? parseInt(w, 10) ?? 1;
      }
      rules.push({ count: Math.max(1, Math.min(5, count)), subject: (m[1] ?? "").trim().toLowerCase(), raw: m[0].trim() });
      if (rules.length > 24) return;
    }
  };
  scan(DROP_RE);
  scan(DROP_RE_ALT);
  return rules;
}

export function dropRuleForCategory(catName: string, rules: DropRule[]): number {
  const bucket = canonicalCategory(catName);
  const words = String(catName).toLowerCase();
  for (const r of rules) {
    if (!r.subject) return r.count; // "lowest grade dropped" — applies to the only eligible set
    if (bucket && canonicalCategory(r.subject) === bucket) return r.count;
    if (r.subject && (words.includes(r.subject) || r.subject.includes(words))) return r.count;
  }
  return 0;
}

export type ParsedCategory = {
  id: string;
  name: string;
  weight: number;
  unit: "pct";
  bucket: string | null;
  dropLowest: number;
  confidence: number;
  evidence: { line: number; text: string };
  derivedFromPoints?: { points: number; total: number } | null;
};

export type ParsedScheme = {
  ok: boolean;
  mode: string;
  categories: ParsedCategory[];
  weightTotal: number;
  letterScale: ScaleEntry[];
  scaleEvidence: Array<{ line: number; text: string }>;
  scaleConfident: boolean;
  dropRules: DropRule[];
  gradingHeading: string | null;
  scaleHeading: string | null;
  snippet: string;
  notes: Array<{ key: string; params?: Record<string, unknown>; text: string }>;
  warnings: Array<{ level: "info" | "warn" | "bad"; key: string; params?: Record<string, unknown>; text: string }>;
};

export function extractGradingScheme(text: unknown, opts: { canonicalOf?: (s: unknown) => string | null } = {}): ParsedScheme {
  const canonicalOf = opts.canonicalOf ?? canonicalCategory;
  const src = String(text ?? "");
  const warnings: ParsedScheme["warnings"] = [];
  const notes: ParsedScheme["notes"] = [];

  const lines = toLines(src).map(normaliseLine);

  // HEADING_RE is deliberately loose: it decides which lines sit in the "grading zone" when scoring
  // weight candidates, where a false positive costs nothing. Choosing the heading to *show the
  // student* has to be stricter, because HEADING_RE's qualifier is optional and so it also matches
  // "Midterm grades posted" — which is what pointed the excerpt at the schedule instead of the table.
  let gradingHeading: string | null = null;
  let headingIndex = -1;
  let bestHeadingScore = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.length >= 90) continue;
    const score = scoreGradingHeading(line, lines[i + 1] ?? "");
    if (score > bestHeadingScore) { bestHeadingScore = score; gradingHeading = line; headingIndex = i; }
  }
  if (bestHeadingScore === Number.NEGATIVE_INFINITY) { gradingHeading = null; headingIndex = -1; }
  let scaleHeading: string | null = null;
  for (const l of lines) if (SCALE_HEADING_RE.test(l) && l.length < 90) { scaleHeading = l; break; }

  const scaleResult = extractLetterScale(src);

  // Dedupe first: a points-to-percent conversion divides by the total, so any duplicate row left in
  // the list would inflate the denominator and quietly shrink every category.
  const candidates = dedupe(extractWeightCandidates(src));
  const pctCount = candidates.filter((c) => c.unit === "pct").length;

  let mode = "percent";
  let chosen: Candidate[];
  if (pctCount >= 2) {
    const sel = selectCluster(candidates);
    chosen = sel.chosen;
    mode = sel.mode;
    notes.push(
      sel.mode === "percent"
        ? { key: "parse.note.cluster", params: { n: sel.chosen.length, total: Math.round(sel.clusterTotal ?? 0) }, text: `Read ${sel.chosen.length} weighted items from one block totalling ${Math.round(sel.clusterTotal ?? 0)}%.` }
        : { key: "parse.note.read", params: { n: sel.chosen.length }, text: `Read ${sel.chosen.length} weighted items.` },
    );
  } else {
    const fromPoints = pointsToPercent(candidates);
    if (fromPoints) {
      chosen = fromPoints;
      mode = "points";
      notes.push({ key: "parse.note.points", text: "No percentages found, so weights were derived from point totals." });
    } else {
      chosen = candidates;
      mode = chosen.length ? "weak" : "none";
      if (chosen.length) {
        warnings.push({ level: "warn", key: "parse.warn.partial", text: "Only a partial grading breakdown could be read. Check the weights before trusting the result." });
      }
    }
  }

  const dropRules = extractDropRules(src);

  const categories: ParsedCategory[] = chosen.map((c, i) => {
    const bucket = canonicalOf(c.name);
    const weight = c.weight ?? (c.unit === "pct" ? c.value : 0);
    let confidence = 0.55;
    if (c.inGradingZone) confidence += 0.2;
    if (bucket) confidence += 0.15;
    if (mode === "points") confidence -= 0.1;
    if (mode.startsWith("percent")) confidence += 0.1;
    if (c.fromProse) confidence -= 0.12;
    return {
      id: `cat-${i}-${String(c.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`,
      name: c.name,
      weight,
      unit: "pct",
      bucket,
      dropLowest: dropRuleForCategory(c.name, dropRules),
      confidence: Math.round(Math.max(0.2, Math.min(0.98, confidence)) * 100) / 100,
      evidence: { line: c.line, text: c.raw },
      derivedFromPoints: c.derivedFromPoints ?? null,
    };
  });

  const weightTotal = Math.round(categories.reduce((s, c) => s + (c.weight || 0), 0) * 100) / 100;

  if (!categories.length) {
    warnings.push({
      level: "bad",
      key: "parse.warn.noBreakdown",
      text: "No grading breakdown could be found in this syllabus. You can type the categories in yourself, or paste just the grading section as text.",
    });
  } else if (Math.abs(weightTotal - 100) > 1) {
    warnings.push({
      level: "warn",
      key: "parse.warn.weightsOff",
      params: { total: weightTotal },
      text: `The weights found add up to ${weightTotal}%, not 100%. Something is probably missing — check against the syllabus.`,
    });
  }
  if (!scaleResult.confident) {
    warnings.push({
      level: "info",
      key: "parse.info.noScale",
      text: "No letter-grade scale was stated in this syllabus. A typical scale is used until you set one, and every course sets its own.",
    });
  }
  if (dropRules.length) {
    const list = dropRules.map((r) => `lowest ${r.count} ${r.subject || "item(s)"}`).join("; ");
    notes.push({ key: "parse.note.dropRules", params: { list }, text: `Drop policy detected: ${list}.` });
  }

  // The excerpt has to contain everything the student is being asked to confirm, so it covers the
  // grading section and, when the letter scale lives in its own section further down, that too.
  const sections: string[] = [];
  if (headingIndex >= 0) sections.push(lines.slice(headingIndex, headingIndex + 40).join("\n"));

  if (scaleResult.confident) {
    const scaleAt = lines.findIndex((l) => SCALE_HEADING_RE.test(l) && l.length < 90);
    const coveredAbove = headingIndex >= 0 && scaleAt >= headingIndex && scaleAt < headingIndex + 40;
    if (scaleAt >= 0 && !coveredAbove) sections.push(lines.slice(scaleAt, scaleAt + 16).join("\n"));
  }

  const snippet = sections.length
    ? sections.join("\n…\n")
    : lines.filter((l) => /\d{1,3}(?:\.\d+)?\s*%/.test(l)).slice(0, 24).join("\n");

  return {
    ok: categories.length > 0,
    mode,
    categories,
    weightTotal,
    letterScale: scaleResult.scale,
    scaleEvidence: scaleResult.evidence,
    scaleConfident: scaleResult.confident,
    dropRules,
    gradingHeading,
    scaleHeading,
    snippet,
    notes,
    warnings,
  };
}

/**
 * Build a store-ready scheme from a parsed syllabus, pre-mapped onto Canvas groups.
 * Pass `mapping` to use the student's own choices from the confirmation step instead of the
 * automatic best-guess match.
 */
export function schemeFromParsed(
  parsed: ParsedScheme,
  groups: Array<{ id: number; name: string }>,
  mapping?: Record<string, number[]>,
): Scheme {
  const cats = parsed.categories.map((c) => ({
    id: c.id,
    name: c.name,
    weight: c.weight,
    dropLowest: c.dropLowest || 0,
    canvasGroupIds: [] as number[],
    canvasGroupId: null as number | null,
    confidence: null as number | null,
  }));
  if (mapping) {
    for (const c of cats) {
      const chosen = mapping[c.id] ?? [];
      c.canvasGroupIds = chosen;
      c.canvasGroupId = chosen[0] ?? null;
    }
  } else {
    const auto = autoMapCategories(cats, groups.map((g) => ({ id: g.id, name: g.name })));
    for (const c of cats) {
      const m = auto[c.id];
      if (m) { c.canvasGroupIds = [m.groupId]; c.canvasGroupId = m.groupId; c.confidence = m.confidence; }
    }
  }
  return {
    source: "syllabus",
    confirmed: false,
    categories: cats,
    letterScale: parsed.letterScale.length ? parsed.letterScale : null,
    scaleSource: parsed.letterScale.length ? "syllabus" : "assumed",
  };
}
