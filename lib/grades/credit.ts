// Which Canvas enrolments are for-credit courses.
//
// UMD puts a lot of non-credit shells in Canvas: onboarding (TerrapinSTRONG, Gemstone Year 1),
// compliance training (FERPA, AI literacy), programme modules like micromobility, and anything
// registered through Non-Credit Programs — whose course codes literally contain "NCR". They carry
// no credits, never reach a transcript, and would otherwise fill the term view and, once a credit
// value was typed in, quietly distort the GPA.
//
// The Canvas API has no "for credit" flag, so this reads the course code instead: every for-credit
// UMD course is DEPT + three digits + an optional section letter (CMSC131, ENGL101H, BMGT110F,
// MATH003, BMGT298J). That is a heuristic, so the caller applies it as a *default the student can
// undo* and shows what was set aside — never as a silent deletion.

export const UMD_COURSE_CODE = /\b([A-Z]{4}\d{3}[A-Z]?)\b/;

export type CreditVerdict = { forCredit: boolean; reason: string };

/** Does this Canvas course code look like a for-credit UMD course? */
export function looksForCredit(code: unknown): CreditVerdict {
  const upper = String(code ?? "").toUpperCase();
  const match = UMD_COURSE_CODE.exec(upper);
  if (match) {
    return { forCredit: true, reason: `matches the UMD course-code pattern (${match[1]})` };
  }
  return {
    forCredit: false,
    reason: "no DEPT### code, so this is most likely a non-credit Canvas shell",
  };
}

/** Split a course list into the ones to show and the ones set aside by default. */
export function partitionByCredit<T extends { code?: string; source?: string; forCredit?: boolean }>(
  courses: T[],
): { forCredit: T[]; nonCredit: T[] } {
  const forCredit: T[] = [];
  const nonCredit: T[] = [];
  for (const c of courses) {
    // Only Canvas courses are judged; anything the student added by hand is theirs to keep.
    const isNonCredit = c.forCredit === false || (c.forCredit === undefined && c.source === "canvas" && !looksForCredit(c.code).forCredit);
    if (isNonCredit) nonCredit.push(c);
    else forCredit.push(c);
  }
  return { forCredit, nonCredit };
}
