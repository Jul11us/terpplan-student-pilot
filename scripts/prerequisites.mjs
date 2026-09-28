// Prerequisite text from the UMD catalog, read into AND of OR-groups for scripts/build-programs.mjs.

const codesInText = (value) => [...new Set(Array.from(value.matchAll(/\b([A-Z]{4}\d{3}[A-Z]?)\b/g), (match) => match[1]))];

// Reads prerequisite text as AND of OR-groups. Clauses are separated by ";" (or ". Or"):
//   "C- in A, B, and C"            -> all three
//   "1 course from (A, B)", "A or B" -> one of them
//   "...; or must have math eligibility of MATH140" -> placement can replace the clause before it, so
//     that clause is dropped; math eligibility is a placement level, never a course to take.
//   "...; or AP exam / permission"   -> an exception for a few students; the clause before it stays.
//   "...; or C"                      -> merged into the clause before it when both name one group.
// A course never lists itself ("eligibility of MATH113 or higher" on MATH113).
export function prerequisiteGroups(text, self) {
  const groups = [];
  let previous = null; // the groups the last course clause added, or "waived"
  for (const raw of text.split(/;|\.\s+(?=or\b)/i)) {
    const clause = raw.trim();
    if (!clause) continue;
    const isOr = /^or\b/i.test(clause);
    if (/\beligib/i.test(clause)) {
      if (isOr && Array.isArray(previous)) previous.forEach((group) => groups.splice(groups.indexOf(group), 1));
      if (isOr || !groups.length) previous = "waived";
      continue;
    }
    const clauseGroups = clause
      .split(/\band\b(?![^()]*\))/i)
      .flatMap((part) => {
        const codes = codesInText(part).filter((code) => code !== self);
        return /\bor\b|\bfrom\b|\bone of\b|\b1 course\b/i.test(part) ? [codes] : codes.map((code) => [code]);
      })
      .filter((group) => group.length);
    if (!clauseGroups.length) continue;
    if (isOr) {
      // "eligibility ...; or MATH113": the whole choice can be met by placement.
      if (previous === "waived") continue;
      if (Array.isArray(previous) && previous.length === 1 && clauseGroups.length === 1) {
        previous[0].push(...clauseGroups[0].filter((code) => !previous[0].includes(code)));
      }
      continue;
    }
    groups.push(...clauseGroups);
    previous = clauseGroups;
  }
  return groups;
}
