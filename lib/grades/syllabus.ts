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

/**
 * Remove brackets that are noise, and only those.
 *
 * A label wholly wrapped in brackets is noise — "(Homework)" is "Homework". A bracket inside the
 * label is not: stripping the trailing ")" from "Homework (5)" left "Homework (5", and
 * "In-class participation (Top Hat)" lost its closing bracket the same way.
 */
function stripUnbalanced(text: string, open: string, close: string): string {
  let s = text.trim();
  const count = (ch: string) => s.split(ch).length - 1;

  // Wholly wrapped, so the brackets are decoration.
  while (s.length > 2 && s.startsWith(open) && s.endsWith(close)) {
    let depth = 0;
    let wraps = true;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === open) depth += 1;
      else if (s[i] === close) {
        depth -= 1;
        if (depth === 0 && i < s.length - 1) { wraps = false; break; }
      }
    }
    if (!wraps) break;
    s = s.slice(1, -1).trim();
  }

  // A stray bracket with no partner is noise too, but a matched pair is part of the name.
  while (s.startsWith(open) && count(open) > count(close)) s = s.slice(1).trim();
  while (s.endsWith(close) && count(close) > count(open)) s = s.slice(0, -1).trim();
  // "Projects (40%, 400 pts)" leaves a dangling "(" once the weight is taken out of it.
  while (s.endsWith(open) && count(open) > count(close)) s = s.slice(0, -1).trim();
  return s;
}

function stripLabel(label: string): string {
  let s = String(label ?? "");
  s = s.replace(LIST_PREFIX_RE, "");
  s = s.replace(/^[\s:;,.\-–—]+/, "");
  s = s.replace(/[\s:;,.\-–—]+$/, "");
  s = stripUnbalanced(s, "(", ")");
  s = stripUnbalanced(s, "[", "]");
  s = s.replace(TRAILING_NOISE_RE, "");
  s = s.replace(/\s+/g, " ").trim();
  // A leading article or conjunction is prose, not part of the category name.
  s = s.replace(/^(?:and|or|plus|also)\s+/i, "");
  s = s.replace(/^(?:the|a|an|your|my|our)\s+/i, "");
  // A trailing parenthetical that restates the weight is noise — but only when it says so. A bare
  // number is more often a count ("Homework (5)" is five assignments), and truncating the label
  // loses information the student needs to check the parse.
  s = s.replace(/\s*\((?:about\s+)?\d{1,3}(?:\.\d+)?\s*%\)\s*$/i, "").trim();
  return s;
}

/** Openers that begin a sentence about a proportion, never a category name. */
const PROSE_OPENER_RE = /^(?:roughly|about|approximately|approx|nearly|almost|around|only|just|over|under|more|less|most|many|some|few|at\s+least|at\s+most|up\s+to|no\s+more\s+than|no\s+less\s+than)\b/;

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
  // "Roughly 30% of students earned an A last spring." — the label is a sentence opener, not a
  // category. Kept narrow so "Homework is worth 30% of your final grade" still reads as Homework.
  if (PROSE_OPENER_RE.test(l)) return false;
  // A label that is nothing but letter grades ("D/F", "A") is a grade-distribution row, not work.
  if (/^[a-f](?:[+-])?(?:\s+(?:and\s+)?[a-f](?:[+-])?)*$/.test(l)) return false;
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

/** Letter grades from best to worst. */
const LETTER_ORDER = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];

/**
 * A real cut-off table descends: the top letter has the highest floor, and no better letter sits
 * below a worse one. "A 35%, B 40%, C 20%" fails on both counts, which is what keeps a sentence
 * about last term's grade distribution out of the letter grader.
 */
function isMonotonicScale(entries: Array<LetterCut & { line?: number }>): boolean {
  if (!entries.length) return false;
  const sorted = [...entries].sort((a, b) => b.min - a.min);
  if (sorted[0]!.min < 50) return false;
  let lastIndex = -1;
  for (const e of sorted) {
    const idx = LETTER_ORDER.indexOf(e.letter);
    if (idx === -1) return false;
    if (idx < lastIndex) return false;
    lastIndex = idx;
  }
  return true;
}

export type ScaleEntry = LetterCut;

/** A cut-off plus the line it came from, so a scale heading can outrank a stray pair. */
type FoundCut = LetterCut & { line?: number };

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
  const found: FoundCut[] = [];
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

  const scaleZone: boolean[] = [];
  {
    let inScale = false;
    for (const raw of lines) {
      const line = normaliseLine(raw);
      if (SCALE_HEADING_RE.test(line) && line.length < 90) inScale = true;
      else if (inScale && line.length > 0 && /^[A-Z][A-Za-z ]{3,60}$/.test(line) && !/\d/.test(line)) inScale = false;
      scaleZone.push(inScale);
    }
  }

  lines.forEach((raw, lineIndex) => {
    const line = normaliseLine(raw);
    if (!line || line.length > 220) return;

    // A cut-off table whose columns normalising has already collapsed into one line:
    // "A+ 97.00% B+ 87.00% C+ 77.00% …". Splitting cannot recover it, so the pairs are picked out
    // directly. Three pairs across at least two letters is not something prose does by accident.
    {
      const pairs = [...line.matchAll(/\b([A-F][+-]?)\s*[:=]?\s*(\d{1,3}(?:\.\d+)?)\s*%/gi)];
      const letters = new Set(pairs.map((m) => m[1]!.toUpperCase()));
      if (pairs.length >= 3 && letters.size >= 2) {
        for (const m of pairs) {
          const letter = normaliseLetterToken(m[1]);
          const min = num(m[2]);
          if (!letter || min === null || min < 0 || min > 100) continue;
          found.push({ letter, min, line: lineIndex });
          evidence.push({ line: lineIndex, text: line });
        }
      }
    }

    // The segments of a line, plus the tail of any "heading: rest" opening — the letter-first
    // patterns are anchored, so "Letter grades: A 93-100" used to lose its A and leave 95%
    // matching A- instead.
    const segments = line.split(SEG_SPLIT).flatMap((part) => {
      const colon = part.lastIndexOf(":");
      return colon >= 0 ? [part, part.slice(colon + 1)] : [part];
    });

    for (const segment of segments) {
      const s = segment.trim();
      if (!s || s.length > 40) continue;
      for (const p of patterns) {
        const m = s.match(p.re);
        if (!m) continue;
        const letter = normaliseLetterToken(m[1]) ?? normaliseLetterToken(m[3]) ?? normaliseLetterToken(m[2]);
        if (!letter) continue;
        const min = p.min(m);
        if (min === null || min < 0 || min > 100) continue;
        found.push({ letter, min, line: lineIndex });
        evidence.push({ line: lineIndex, text: line });
        break;
      }
    }
  });

  // A real scale has a spread of letters; reject fragments like a lone "A 90".
  const spread = (list: LetterCut[]) => list.length >= 4 && new Set(list.map((f) => f.letter)).size >= 4;
  if (!spread(found)) return { scale: [], evidence: [], confident: false };

  // Entries read under a scale heading win over pairs picked up elsewhere, which is how a
  // distribution sentence ("…was A 35%, B 40%, C 20%") stops displacing the real table sitting
  // below it — the pair scan runs first and `seen` would otherwise keep the stray value.
  const inZone = (f: FoundCut) => f.line !== undefined && scaleZone[f.line] === true;
  const byLetter = new Map<string, FoundCut>();
  for (const f of found) {
    const existing = byLetter.get(f.letter);
    if (!existing || (inZone(f) && !inZone(existing))) byLetter.set(f.letter, f);
  }
  const deduped = [...byLetter.values()];
  const underHeading = deduped.filter(inZone);
  const chosen = spread(underHeading) ? underHeading : deduped;

  // And the result has to descend: A's floor is the highest and the letters run down to F. A
  // distribution sentence does not survive this, so a stray line cannot reach the letter grader.
  if (!isMonotonicScale(chosen)) return { scale: [], evidence: [], confident: false };
  return { scale: chosen.sort((a, b) => b.min - a.min) as ScaleEntry[], evidence: evidence.slice(0, 16), confident: true };
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

  const weightPatterns: Array<{ re: RegExp; unit: "pct" | "pts"; swap?: boolean; each?: boolean }> = [
    // Homework (20%)   /   Projects (40%, 400 pts)
    // The bracket may carry more than the percentage, so it is closed only after any trailing
    // detail — "(40%, 400 pts)" used to match nothing at all, and the row was lost.
    { re: /^(.{2,64}?)\s*[\(\[]\s*(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b)[^)\]]*[)\)\]]/i, unit: "pct" },
    // Homework: 20%   /   Homework – 20 %
    { re: /^(.{2,64}?)\s*[:=–—]\s*(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b)/i, unit: "pct" },
    // two midterm exams worth 20% each — the count is in the label, so the total is the product.
    { re: /^(.{2,64}?)\s+worth\s+(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b)\s*each\b/i, unit: "pct", each: true },
    // Papers, which together are worth 45%   /   participation, which counts for 10%
    // The weight belongs to the thing before the comma, not to "which together".
    { re: /^(.{2,64}?),?\s+which\s+(?:together\s+)?(?:are\s+|is\s+|counts?\s+|count\s+)?(?:worth|for)\s+(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b)/i, unit: "pct" },
    // Homework is worth 20%
    { re: /^(.{2,64}?)\s+(?:is\s+|are\s+)?worth\s+(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b)/i, unit: "pct" },
    // Homework 20%
    { re: /^(.{2,64}?)\s+(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b)/i, unit: "pct" },
    // 20% Homework. The percent group stays CAPTURING: `swap` reads the label out of m[3], and
    // making it non-capturing silently shifts the label to m[2] and drops every leading-percentage
    // line. Caught by tests/grades.test.mjs — do not "tidy" it.
    { re: /^(\d{1,3}(?:\.\d+)?)\s*(%|percent)\s*[-–—:]?\s*(.{2,64})$/i, unit: "pct", swap: true },
    // Homework (200 points)   /   Projects (400 pts total)
    { re: /^(.{2,64}?)\s*[\(\[]?\s*(\d{1,4})\s*(?:pts?|points?)\b[^)\]]*[)\)\]]?/i, unit: "pts" },
    // Homework: 200 points
    { re: /^(.{2,64}?)\s*[:=–—]\s*(\d{1,4})\s*(?:pts?|points?)\b/i, unit: "pts" },
    // 作业20% — Chinese types no space before the figure. Last, so it only takes lines the patterns
    // above did not already claim.
    { re: /^([^\d]{2,30}?)\s*(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b|分)/, unit: "pct" },
  ];

  /** "Exams (3 x 15%)" — how many of a thing, and what each is worth. */
  const MULTIPLIER_RE = /\(\s*(\d{1,2})\s*[x×]\s*(\d{1,3}(?:\.\d+)?)\s*%\s*\)/i;
  /**
   * "Exams (70% total):" is a subtotal heading, not a category of its own.
   *
   * The bare "…total" form has to exclude weights phrased against the course total — "Homework 20%
   * of total" is a row like any other, and matching it dropped every line of a scheme written that
   * way, leaving the parser reporting no breakdown at all.
   */
  const SUBTOTAL_RE = /\(\s*\d{1,3}(?:\.\d+)?\s*%?\s*(?:sub)?total\s*\)/i;
  const isSubtotalRow = (text: string): boolean => {
    if (SUBTOTAL_RE.test(text)) return true;
    if (!/\b(?:sub)?total\s*[:=]?\s*$/i.test(text)) return false;
    return !/\bof\s+(?:the\s+|course\s+)?total\b/i.test(text);
  };

  /** Lines that already read as a complete row on their own. */
  const producedOnLine = new Set<number>();

  const push = (s: string, lineIndex: number, fromProse: boolean) => {
    if (!s || s.length > 200) return;

    // A subtotal row restates what its components already said; counting it adds them twice.
    if (isSubtotalRow(s)) return;

    // "…papers, which together are worth 45%, and a final 55%" — the relative clause describes the
    // thing before the comma, so it has to be read before the comma-split separates them.
    let work = s;
    const relative = work.match(/^(.{2,64}?),\s+which\s+(?:together\s+)?(?:are\s+|is\s+|counts?\s+|count\s+)?(?:worth|for)\s+(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b)/i);
    if (relative) {
      const label = stripLabel(relative[1]!.replace(/^(?:there\s+(?:are|is)|this\s+course\s+has|the\s+course\s+has)\s+/i, ""));
      const value = num(relative[2]);
      if (label && value !== null && value > 0 && value <= 100 && isPlausibleLabel(label)) {
        candidates.push({ name: label, value, unit: "pct", line: lineIndex, inGradingZone: gradingZone[lineIndex] ?? false, fromProse, raw: s });
      }
      work = work.slice(relative[0].length).replace(/^\s*(?:,|;|\band\b|\bplus\b)\s*/i, " ");
    }

    const hits = (work.match(/%|percent/gi) ?? []).length;
    const pieces = hits > 1 ? work.split(/\s*(?:,|;|\band\b|\bplus\b)\s*/i) : [work];

    for (const piece of pieces) {
      const seg = piece.trim();
      if (!seg || seg.length > 120) continue;

      // "Exams (3 x 15%) 45%" states the multiplier and then the total; the total wins. When no
      // total is given — "two midterm exams worth 20% each" — the multiplier is the total.
      const mult = seg.match(MULTIPLIER_RE);
      if (mult) {
        const count = num(mult[1]);
        const each = num(mult[2]);
        const after = seg.slice((mult.index ?? 0) + mult[0].length);
        const totalPct = after.match(/(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b)/i);
        const name = stripLabel(seg.slice(0, mult.index ?? 0));
        const value = totalPct ? num(totalPct[1]) : count !== null && each !== null ? count * each : null;
        if (name && value !== null && value > 0 && value <= 100 && isPlausibleLabel(name)) {
          candidates.push({ name, value, unit: "pct", line: lineIndex, inGradingZone: gradingZone[lineIndex] ?? false, fromProse, raw: seg });
          break;
        }
      }

      for (const p of weightPatterns) {
        const m = seg.match(p.re);
        if (!m) continue;
        const rawLabel = p.swap ? m[3]! : m[1]!;
        const rawValue = p.swap ? m[1]! : m[2]!;
        let label = stripLabel(rawLabel);
        let value = num(rawValue);
        if (value === null || value <= 0) break;
        if (p.each) {
          // "two midterm exams worth 20% each" is 40% of the grade in total.
          const lead = label.match(/^(one|two|three|four|five|six|\d{1,2})\b/i);
          const n = lead ? (WORD_COUNTS[lead[1]!.toLowerCase()] ?? parseInt(lead[1]!, 10)) : null;
          if (n && Number.isFinite(n) && n > 1) {
            value *= n;
            label = stripLabel(label.slice(lead![0].length));
          }
        }
        if (p.unit === "pct" && value > 100) break;
        if (!isPlausibleLabel(label)) break;
        candidates.push({ name: label, value, unit: p.unit, line: lineIndex, inGradingZone: gradingZone[lineIndex] ?? false, fromProse, raw: s });
        producedOnLine.add(lineIndex);
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
    // A block of short lines that each already read as their own row is a table, not a wrapped
    // sentence. Joining it is what fused a heading onto the row beneath it ("Grading 25% Lab
    // assignments") and carried a bracketed detail into the next row ("October 15) Final Exam
    // 50%"). The word count matters: a line of real prose is long, and those still get joined.
    const rows = b.lines.filter((_, i) => producedOnLine.has(b.start + i));
    const allShort = rows.every((l) => l.split(/\s+/).filter(Boolean).length <= 6);
    if (rows.length >= 2 && allShort) continue;

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

/**
 * A drop phrase sitting on the same line as a category belongs to that category.
 *
 * "Homework (best 10 of 12) 20%" and "Homework: 20% (lowest one dropped)" both state their rule
 * inline, where the document-wide scan cannot attribute it — the first has no "drop" verb at all,
 * and the second's captured subject comes out as "one".
 */
export function dropCountFromLine(line: string): number {
  const text = String(line ?? "");
  const best = text.match(/\bbest\s+(\d{1,3})\s+of\s+(\d{1,3})\b/i);
  if (best) {
    const keep = parseInt(best[1]!, 10);
    const total = parseInt(best[2]!, 10);
    if (total > keep && keep >= 1) return Math.min(5, total - keep);
  }
  const lowest = text.match(/\b(?:lowest|low|worst|smallest)\s+(one|two|three|four|five|\d{1,2})\b/i);
  if (lowest && /drop|discard|exclud/i.test(text)) {
    const w = lowest[1]!.toLowerCase();
    const n = WORD_COUNTS[w] ?? parseInt(w, 10);
    if (Number.isFinite(n) && n > 0) return Math.min(5, n);
  }
  return 0;
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
      dropLowest: dropRuleForCategory(c.name, dropRules) || dropCountFromLine(c.raw),
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
