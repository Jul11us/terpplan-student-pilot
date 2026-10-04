// Courses that need a number of finished credits ("Restricted to students with 24 credit hours completed",
// "Junior standing or higher"). Read from the course's requirement text on Testudo, so a course whose text
// says nothing about credits has no minimum here, and Testudo still decides at registration.

// Either requirement shape (the page keeps kind as a plain string).
type CourseRequirement = { kind: string; text: string };

// UMD class standing by credits earned.
const STANDING: Record<string, number> = { sophomore: 30, junior: 60, senior: 90 };

const CREDIT_COUNT = /(\d{1,3})\s+(?:or\s+more\s+)?(?:earned\s+|completed\s+)?(?:credit\s+hours?|credits?|semester\s+hours?)\b(?!\s+(?:in|of|from|at)\s)/g;
// A sentence about credits overall: "students with", "must have", "minimum of", "completed", "earned".
const OVERALL = /\b(?:restricted to students with|students with|must have|minimum of|at least|completed|completion of|earned)\b/;
// Repeat limits, credit caps and "credit only granted for" are not entry requirements.
const NOT_ENTRY = /\b(?:repeat|repeated|repeatable|maximum|up to|only granted|may not exceed)\b/;

// The largest credit minimum in a course's requirement text; null when it names none.
export function minimumCredits(requirements: CourseRequirement[] | null | undefined): number | null {
  let minimum: number | null = null;
  for (const requirement of requirements ?? []) {
    if (requirement.kind === "creditOnlyFor" || requirement.kind === "crossListed" || requirement.kind === "formerly") continue;
    for (const sentence of requirement.text.toLowerCase().split(/(?<=[.;])\s+/)) {
      if (NOT_ENTRY.test(sentence)) continue;
      // "Junior or senior standing" is open from junior standing on.
      const standing = /\b(sophomore|junior|senior)(?:\s+or\s+(sophomore|junior|senior))?\s+standing\b/.exec(sentence);
      if (standing) minimum = Math.max(minimum ?? 0, Math.min(STANDING[standing[1]], STANDING[standing[2] ?? standing[1]]));
      if (!OVERALL.test(sentence)) continue;
      for (const match of sentence.matchAll(CREDIT_COUNT)) {
        const credits = Number(match[1]);
        // Small counts ("3 credits") describe a course, not a student's standing.
        if (credits >= 12 && credits <= 150) minimum = Math.max(minimum ?? 0, credits);
      }
    }
  }
  return minimum;
}
