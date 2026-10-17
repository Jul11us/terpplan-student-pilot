// How schedule scores are shown and compared: the planner ranks options by the score as shown, and the
// option cards show it and say how each option differs from the first.

// A score in hundredths, as shown. Adding up the same parts in another order can land a hair either side
// of a half (4.275 or 4.2749999999999995); the nudge rounds both the same way.
export const shownScore = (score: number) => Math.round(score * 100 + 1e-6);

export function formatScore(score: number) {
  return (shownScore(score) / 100).toFixed(2);
}

type Comparable = {
  score: number;
  walkMinutes: number;
  gapMinutes: number;
  campusDays: string[];
  selectedSections: Array<{ course_id: string; section_id: string }>;
};

// How one option differs from another: the courses taken in a different section, the score as shown (in
// hundredths, negative when lower), and the minutes a week of walking and of gaps, and the days on campus.
export function optionDifference(option: Comparable, base: Comparable) {
  const baseSections = new Map(base.selectedSections.map((section) => [section.course_id, section.section_id]));
  return {
    courses: option.selectedSections.filter((section) => baseSections.get(section.course_id) !== section.section_id).map((section) => section.course_id),
    score: shownScore(option.score) - shownScore(base.score),
    walk: option.walkMinutes - base.walkMinutes,
    gaps: option.gapMinutes - base.gapMinutes,
    days: option.campusDays.length - base.campusDays.length,
  };
}
