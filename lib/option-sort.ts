// Reorders the schedule options already on the page. The planner's own ranking ("best") stays the default;
// the other orders let a student look at the same options through one measure they care about. Sorting never
// adds or removes an option, so what is shown always matches what the planner found.

import { meetingMinutes } from "@/lib/meeting-time";

export type OptionSort = "best" | "fewestDays" | "latestStart" | "fewestGaps" | "highestRating" | "leastWalking";

export const OPTION_SORTS: OptionSort[] = ["best", "fewestDays", "latestStart", "fewestGaps", "highestRating", "leastWalking"];

type SortableOption = {
  campusDays: string[];
  earliestStart: string | null;
  gapMinutes: number;
  professorRating: number | null;
  walkMinutes?: number;
};

// Options with no value for the chosen measure (an unrated instructor, every time TBA) keep the planner's
// order among themselves and go last, so a sort never looks like it hid them.
export function sortOptions<T extends SortableOption>(options: T[], sort: OptionSort): T[] {
  if (sort === "best") return options;
  const value = (option: T): number | null => {
    if (sort === "fewestDays") return option.campusDays.length || null;
    if (sort === "latestStart") return meetingMinutes(option.earliestStart);
    if (sort === "fewestGaps") return option.gapMinutes;
    // Zero walking is a real answer (one building, or everything online), not a missing value.
    if (sort === "leastWalking") return option.walkMinutes ?? null;
    return option.professorRating;
  };
  const direction = sort === "fewestDays" || sort === "fewestGaps" || sort === "leastWalking" ? 1 : -1;
  return options.map((option, index) => ({ option, index, key: value(option) }))
    .sort((a, b) => (a.key === null ? 1 : 0) - (b.key === null ? 1 : 0)
      || (a.key !== null && b.key !== null ? direction * (a.key - b.key) : 0)
      || a.index - b.index)
    .map(({ option }) => option);
}

export const optionKey = (option: { selectedSections: Array<{ section_id: string }> }) =>
  option.selectedSections.map((section) => section.section_id).join("|");
