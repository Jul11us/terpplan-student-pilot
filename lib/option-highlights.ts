// Short reasons shown on each schedule option instead of its raw score: what this option does best
// compared with the other options on the page. A reason is only given when the options actually differ,
// so three schedules with the same instructors never all claim "Highest-rated instructors".

import { meetingMinutes } from "@/lib/meeting-time";

export type Highlight = "noRush" | "rating" | "days" | "gaps" | "lateStart" | "window" | "balanced" | "onlyOne";

type OptionStats = {
  professorRating: number | null;
  gapMinutes: number;
  tightWalkCount?: number;
  campusDays: string[];
  earliestStart: string | null;
  timeFitPercent: number | null;
};

const MAX_PER_OPTION = 2;

// Index of the options that are best on a measure, or [] when every option scores about the same.
function bestOf(values: Array<number | null>, better: "high" | "low", margin: number) {
  const known = values.filter((value): value is number => value !== null);
  if (known.length < 2) return [];
  const best = better === "high" ? Math.max(...known) : Math.min(...known);
  const worst = better === "high" ? Math.min(...known) : Math.max(...known);
  if (Math.abs(best - worst) < margin) return [];
  return values.flatMap((value, index) => value !== null && Math.abs(value - best) < margin ? [index] : []);
}

export function optionHighlights(options: OptionStats[]): Highlight[][] {
  if (!options.length) return [];
  if (options.length === 1) return [["onlyOne"]];
  const result: Highlight[][] = options.map(() => []);
  const give = (indexes: number[], highlight: Highlight) => {
    // A reason that every option shares says nothing about any of them.
    if (indexes.length === options.length) return;
    for (const index of indexes) if (result[index].length < MAX_PER_OPTION) result[index].push(highlight);
  };
  const walks = options.map((option) => option.tightWalkCount ?? 0);
  if (walks.some((count) => count > 0)) give(walks.flatMap((count, index) => count === 0 ? [index] : []), "noRush");
  give(bestOf(options.map((option) => option.professorRating), "high", 0.05), "rating");
  give(bestOf(options.map((option) => option.campusDays.length), "low", 1), "days");
  give(bestOf(options.map((option) => option.gapMinutes), "low", 30), "gaps");
  give(bestOf(options.map((option) => meetingMinutes(option.earliestStart)), "high", 30), "lateStart");
  give(bestOf(options.map((option) => option.timeFitPercent), "high", 5), "window");
  // The first option is first because it balances everything best, even if it leads on nothing alone.
  if (!result[0].length) result[0].push("balanced");
  return result;
}
