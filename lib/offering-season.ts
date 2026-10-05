// Courses that only run in one regular semester ("spring only"), from the offering history TerpPlan reads
// from Testudo (see lib/offering-backfill.ts). Skipping such a course in its semester means waiting a year.

export type Season = "fall" | "spring";

type CheckedTerm = { term: string; sectionCount: number };

const seasonOf = (term: string): Season | null => term.endsWith("08") ? "fall" : term.endsWith("01") ? "spring" : null;

// "spring" when the course ran only in springs and was checked and not offered in at least two falls (and
// the other way round); null when it runs in both, or there is too little history to say.
export function seasonOnly(terms: CheckedTerm[]): Season | null {
  const offered = new Set<Season>();
  const empty: Record<Season, number> = { fall: 0, spring: 0 };
  for (const item of terms) {
    const season = seasonOf(item.term);
    if (!season) continue;
    if (item.sectionCount > 0) offered.add(season);
    else empty[season] += 1;
  }
  if (offered.size !== 1) return null;
  const only = [...offered][0];
  return empty[only === "fall" ? "spring" : "fall"] >= 2 ? only : null;
}

export function termSeason(term: string) {
  return seasonOf(term);
}
