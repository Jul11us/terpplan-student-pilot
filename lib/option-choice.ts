// The schedule option a student picked, found again among freshly generated options (after a reload, new seat
// counts or a change to the plan). Options are matched by their sections, never by their place in the list.

type OptionLike = { selectedSections: Array<{ section_id: string; course_id: string }> };

export const optionSectionIds = (option: OptionLike) => option.selectedSections.map((section) => section.section_id).sort();

const courseOf = (sectionId: string) => sectionId.slice(0, sectionId.lastIndexOf("-"));

export type SavedOptionMatch<T> = {
  option: T | null;
  // The picked sections still in the plan (courses removed since are left out).
  wanted: string[];
  // Picked sections that no option has any more (full, filtered out or no longer offered).
  gone: string[];
};

// The option with exactly the picked sections, else the best-ranked one that keeps them all (a course was added
// since). None when the plan no longer has any of the picked courses, or no option keeps every picked section.
export function findSavedOption<T extends OptionLike>(options: T[], saved: string[] | undefined, courseIds: string[]): SavedOptionMatch<T> {
  const wanted = (saved ?? []).filter((id) => courseIds.includes(courseOf(id)));
  if (!wanted.length) return { option: null, wanted, gone: [] };
  const sets = options.map((option) => new Set(option.selectedSections.map((section) => section.section_id)));
  const keeps = (index: number) => wanted.every((id) => sets[index].has(id));
  const exact = options.findIndex((_, index) => keeps(index) && sets[index].size === wanted.length);
  const superset = exact >= 0 ? exact : options.findIndex((_, index) => keeps(index));
  if (superset >= 0) return { option: options[superset], wanted, gone: [] };
  return { option: null, wanted, gone: wanted.filter((id) => !sets.some((set) => set.has(id))) };
}
