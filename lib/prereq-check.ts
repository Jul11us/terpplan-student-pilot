// Checks a planned course's prerequisites against the courses a student has taken.
//
// Rules come from the catalog snapshot (scripts/add-catalog-details.mjs, parsed by scripts/prerequisites.mjs):
//   "CMSC131"   must be finished first          "~MATH140"  may also be taken the same term
//   "MATH113+"  that course or a higher one      ["&", ...] all, ["|", ...] any one, [2, ...] at least 2
// Finished and in-progress courses satisfy any requirement (in-progress ones finish before next term). A
// course in the same plan only satisfies a "~" requirement: an ordinary prerequisite has to come first.
// Grades are not checked (the student's list has none), and text-only conditions (placement, permission,
// standing) were already dropped from the rule, so a "met" result is "no missing course", not approval.

import type { PrereqNode } from "@/lib/programs";

const base = (code: string) => /^([A-Z]{4}\d{3})[A-Z]*$/.exec(code)?.[1] ?? code;
const courseNumber = (code: string) => Number(code.slice(4, 7));

// Codes as the check compares them: honors and other suffixed versions also count as the base course.
export function courseSet(codes: Iterable<string>) {
  const set = new Set<string>();
  for (const code of codes) {
    const upper = code.trim().toUpperCase();
    if (!upper) continue;
    set.add(upper);
    set.add(base(upper));
  }
  return set;
}

function has(code: string, orHigher: boolean, courses: Set<string>) {
  if (courses.has(code)) return true;
  if (!orHigher) return false;
  for (const other of courses) {
    if (other.slice(0, 4) === code.slice(0, 4) && courseNumber(other) >= courseNumber(code)) return true;
  }
  return false;
}

function met(node: PrereqNode, taken: Set<string>, sameTerm: Set<string>): boolean {
  if (typeof node === "string") {
    const concurrent = node.startsWith("~");
    const orHigher = node.endsWith("+");
    const code = node.replace(/^~/, "").replace(/\+$/, "");
    return has(code, orHigher, taken) || (concurrent && has(code, orHigher, sameTerm));
  }
  const [kind, ...children] = node;
  const count = children.filter((child) => met(child as PrereqNode, taken, sameTerm)).length;
  return kind === "&" ? count === children.length : kind === "|" ? count > 0 : count >= kind;
}

// The top-level requirements that are not met yet; [] when nothing is missing.
export function unmetRequirements(rule: PrereqNode | null | undefined, taken: Set<string>, sameTerm: Set<string> = new Set()): PrereqNode[] {
  if (!rule) return [];
  const top = typeof rule !== "string" && rule[0] === "&" ? rule.slice(1) as PrereqNode[] : [rule];
  return top.filter((node) => !met(node, taken, sameTerm));
}

export type PrereqLabels = { orHigher: string; sameTerm: string; of: (k: number) => string };

// "CHEM131 / CHEM146", "(CMSC131 / CMSC133) + MATH140", "MATH113 or higher", "2 of A / B / C".
export function describeRequirement(node: PrereqNode, labels: PrereqLabels): string {
  if (typeof node === "string") {
    const code = node.replace(/^~/, "").replace(/\+$/, "");
    return `${code}${node.endsWith("+") ? labels.orHigher : ""}${node.startsWith("~") ? labels.sameTerm : ""}`;
  }
  const [kind, ...rest] = node;
  const parts = (rest as PrereqNode[]).map((child) => typeof child === "string" ? describeRequirement(child, labels) : `(${describeRequirement(child, labels)})`);
  const shown = parts.length > 4 ? [...parts.slice(0, 4), "…"] : parts;
  return kind === "&" ? shown.join(" + ") : kind === "|" ? shown.join(" / ") : `${labels.of(kind)} ${shown.join(" / ")}`;
}
