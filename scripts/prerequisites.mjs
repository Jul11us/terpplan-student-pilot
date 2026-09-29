// Reads UMD catalog prerequisite text into a small logic tree, for scripts/build-programs.mjs.
//
// A node is one of:
//   "CMSC131"             a course that must be finished first
//   "~MATH140"            a course that may also be taken in the same semester ("or be concurrently enrolled")
//   "MATH113+"            that course or any higher-numbered course in the same subject ("MATH113 or higher")
//   ["&", ...nodes]       all of them
//   ["|", ...nodes]       any one of them
//   [2, ...nodes]         at least 2 of them ("2 courses from (...)")
// null means nothing course-based is required (only permission, standing, or math placement).
//
// Reading rules, from the wording the catalog uses:
//   ";" and new sentences separate clauses; "; or" alternatives bind tighter than "; and", so
//     "A; or AP exam; and B" is (A or exam) and B, and "A and B; or C" is (A and B) or C.
//   A comma list takes the conjunction that ends it ("A, B, and C" / "A, B or C"); otherwise "or"
//     binds looser than "and" ("either A or B and C" is A or (B and C)). A bare list in parentheses
//     ("theory course ( A , B , C )") means any one of them.
//   Math placement ("math eligibility of MATH140", "math placement of STAT100") is how most students
//     start, so a choice that includes it is dropped. Other text-only alternatives (AP or department
//     exams, a language placement score, "or equivalent", permission, a program) are exceptions for a
//     few students and are ignored, so the course path stays.

const CODE = /\b([A-Z]{4}\d{3}[A-Z]?)\b(\+)?/g;
const HAS_CODE = /\b[A-Z]{4}\d{3}/;
// Math placement, and "any higher course" alternatives that name no course.
// ("scored 3 or higher on the AP exam" is an exception, not a course level.)
const WAIVER = /\beligib|\bmath placement\b|\bhigher[- ]level\b/i;
const PLACEMENT = /\beligib|\bmath placement\b/i;
const NUMBER = { one: 1, two: 2, three: 3, four: 4, 1: 1, 2: 2, 3: 3, 4: 4 };

// Splits at a separator that is not inside parentheses.
function splitTop(value, separator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      separator.lastIndex = index;
      const match = separator.exec(value);
      if (match && match.index === index) {
        parts.push(value.slice(start, index));
        start = index + match[0].length;
        index = start - 1;
      }
    }
  }
  parts.push(value.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

const hasTop = (value, separator) => splitTop(value, separator).length > 1;
const AND = () => /\band\b/giy;
const OR = () => /\bor\b/giy;
const COMMA = () => /,/gy;
const hasConjunction = (value) => /\b(?:and|or)\b/i.test(value);

const WAIVED = Symbol("waived");

// Joins nodes, dropping empty ones; a waived alternative satisfies an "or".
function join(kind, nodes) {
  if (kind === "|" && nodes.includes(WAIVED)) return WAIVED;
  const kept = nodes.filter((node) => node !== null && node !== WAIVED);
  const flat = kept.flatMap((node) => Array.isArray(node) && node[0] === kind ? node.slice(1) : [node]);
  const unique = flat.filter((node, index) => typeof node !== "string" || flat.indexOf(node) === index);
  if (!unique.length) return nodes.includes(WAIVED) ? WAIVED : null;
  return unique.length === 1 ? unique[0] : [kind, ...unique];
}

function stripOuter(value) {
  let text = value.trim();
  while (text.startsWith("(") && text.endsWith(")")) {
    let depth = 0;
    let wraps = true;
    for (let index = 0; index < text.length - 1; index++) {
      if (text[index] === "(") depth++;
      else if (text[index] === ")") depth--;
      if (depth === 0) { wraps = false; break; }
    }
    if (!wraps) break;
    text = text.slice(1, -1).trim();
  }
  return text;
}

const codesOf = (value, self, concurrent) => [...value.matchAll(CODE)]
  .filter((match) => match[1] !== self)
  .map((match) => `${concurrent ? "~" : ""}${match[1]}${match[2] ?? ""}`);

// One clause: no top-level ";" left.
function parseClause(raw, self, concurrent) {
  const text = stripOuter(raw.replace(/^(?:(?:and|or)\b\s*)+/i, ""));
  if (!text) return null;
  if (hasTop(text, /;/gy)) return parseText(text, self, concurrent);
  if (PLACEMENT.test(text) && !hasTop(text, AND()) && !hasTop(text, OR())) return WAIVED;
  if (!HAS_CODE.test(text)) return WAIVER.test(text) ? WAIVED : null;

  // "2 courses from ( A , B , C )", "1 course with a minimum grade of C- from ( ... )", "one of ( ... )",
  // "one of A , B or C", "Two of the following courses: A , B , or C". Only when nothing before the
  // count names a course.
  const pick = /^(.*?)\b(one|two|three|four|[1-4])\s+(?:courses?\b[^(]*?\bfrom|of)\s*\(([^()]*)\)\s*$/i.exec(text)
    ?? /^(.*?)\b(one|two|three|four|[1-4])\s+(?:of the following(?: courses)?|courses? from the following|of)\s*:?\s*([^()]*)$/i.exec(text);
  if (pick && !HAS_CODE.test(pick[1]) && !/\band\b/i.test(pick[3])) {
    const options = codesOf(pick[3], self, concurrent);
    const k = NUMBER[pick[2].toLowerCase()] ?? 1;
    return k <= 1 ? join("|", options) : options.length <= k ? join("&", options) : [k, ...options];
  }

  // A comma list whose last item carries the conjunction: "A , B , and C", "A , B or C".
  if (hasTop(text, COMMA())) {
    const items = splitTop(text, COMMA());
    const last = items.at(-1);
    const plainBefore = items.slice(0, -1).every((item) => !hasConjunction(item));
    const kind = /^and\b/i.test(last) || (plainBefore && hasTop(last, AND())) ? "&"
      : /^or\b/i.test(last) || (plainBefore && hasTop(last, OR())) ? "|" : null;
    if (kind) {
      if (!/^(?:and|or)\b/i.test(last)) items.splice(-1, 1, ...splitTop(last, kind === "&" ? AND() : OR()));
      return join(kind, items.map((item) => parseClause(item, self, concurrent)));
    }
  }
  const alternatives = splitTop(text, OR());
  if (alternatives.length > 1) return join("|", alternatives.map((part) => parseClause(part, self, concurrent)));
  const required = splitTop(text, AND());
  if (required.length > 1) return join("&", required.map((part) => parseClause(part, self, concurrent)));

  // Codes only inside parentheses: the words outside describe them ("theory course ( A , B )").
  const open = text.indexOf("(");
  const close = text.lastIndexOf(")");
  if (open >= 0 && close > open && !HAS_CODE.test(text.slice(0, open) + text.slice(close + 1))) {
    const inner = text.slice(open + 1, close);
    if (!/\band\b|\bor\b|;/i.test(inner)) return join("|", codesOf(inner, self, concurrent));
    return parseText(inner, self, concurrent);
  }
  // A bare comma list outside parentheses ("C- in MATH140, MATH141") needs all of them.
  if (hasTop(text, COMMA())) return join("&", splitTop(text, COMMA()).map((item) => parseClause(item, self, concurrent)));
  // A leaf: normally one course; several codes with no conjunction are read as alternatives.
  return join("|", codesOf(text, self, concurrent));
}

// Several clauses: "; or" groups alternatives, "; and" (or a new sentence) adds a requirement.
function parseText(value, self, concurrent = false) {
  const normalized = value
    // Notes that are not prerequisites.
    .replace(/\b(?:Cross-listed with|Also offered as|Credit only granted for|Formerly)\b[^.]*\.?/gi, " ")
    // A new sentence is another clause: ". Or X" is an alternative, anything else is required too.
    .replace(/\.\s+(?=or\b)/gi, "; ")
    .replace(/\.\s+(?=[A-Z(])/g, "; and ")
    // "C- or higher" is a grade, not an alternative course.
    .replace(/\b([A-D][+-]?)\s+or\s+(?:higher|better)\b/g, "$1")
    // "MATH113 or higher (level MATH course)" / "CHIN204 or above": that course or a higher one.
    .replace(/\b([A-Z]{4}\d{3}[A-Z]?)\s+or\s+(?:higher|above)\b(?:[- ]level)?(?:\s+[A-Z]{4})?(?:\s+courses?)?/g, "$1+")
    .replace(/\band\/or\b/gi, "or")
    // "Must have completed or be concurrently enrolled in X" is one requirement that may share a semester.
    .replace(/(?:must have )?completed(?:\s+or|\s+and\/or)?\s+(?:be\s+)?concurrently enrolled in/gi, "concurrently enrolled in")
    // "... and either A or B and C": the "either" part is one choice.
    .replace(/\beither\b([^;]*)/gi, "($1)");
  const requirements = [];
  let alternatives = [];
  for (const clause of splitTop(normalized.replace(/\.\s*$/, ""), /;/gy)) {
    const isOr = /^or\b/i.test(clause);
    const clauseConcurrent = concurrent || /concurrent/i.test(clause);
    const node = parseClause(clause, self, clauseConcurrent);
    if (isOr) alternatives.push(node);
    else {
      if (alternatives.length) requirements.push(join("|", alternatives));
      alternatives = [node];
    }
  }
  if (alternatives.length) requirements.push(join("|", alternatives));
  return join("&", requirements);
}

export function prerequisiteTree(text, self) {
  const tree = parseText(text, self);
  return tree === WAIVED ? null : tree;
}

// Every course code in a tree, without the "~" and "+" markers.
export function treeCodes(node, into = new Set()) {
  if (typeof node === "string") into.add(node.replace(/^~/, "").replace(/\+$/, ""));
  else if (Array.isArray(node)) node.slice(1).forEach((child) => treeCodes(child, into));
  return into;
}
