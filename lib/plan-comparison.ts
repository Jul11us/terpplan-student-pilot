import { findSavedOption, savedOptionSections } from "@/lib/option-choice";
import { anonymousBusyBlocks } from "@/lib/personal-schedule";
import { canonicalJson, type SavedPlanCourse } from "@/lib/saved-state";
import type { PlanPreferences, ScheduleOption } from "@/lib/planner";

export type PlanSlot = "A" | "B";
export type ComparisonInput = {
  term: string;
  plans: Record<PlanSlot, SavedPlanCourse[]>;
  preferences: PlanPreferences;
  choices: Record<string, string[]>;
};
export type ComparisonColumn = {
  state: "empty" | "loading" | "invalid" | "error" | "unavailable" | "ready";
  courses: SavedPlanCourse[];
  option?: ScheduleOption;
  pick?: "saved" | "unpicked" | "invalid";
  missing?: string[];
};
export type ComparisonSnapshot = Record<PlanSlot, ComparisonColumn>;

export function comparisonPlans(active: PlanSlot, current: SavedPlanCourse[], other: SavedPlanCourse[]): ComparisonInput["plans"] {
  return active === "A" ? { A: current, B: other } : { A: other, B: current };
}

export function comparisonRequest(input: ComparisonInput, slot: PlanSlot) {
  const courses = input.plans[slot];
  const ids = courses.map((course) => course.courseId);
  return {
    term: input.term, courseIds: ids,
    preferences: { ...input.preferences, busyBlocks: anonymousBusyBlocks(input.preferences.busyBlocks ?? []) },
    savedSectionIds: savedOptionSections(input.choices[`${input.term}:${slot}`], ids),
    instructorFilters: Object.fromEntries(courses.filter((course) => course.instructors?.length).map((course) => [course.courseId, course.instructors])),
    sectionFilters: Object.fromEntries(courses.filter((course) => course.pinnedSectionId || course.excludedSectionIds?.length).map((course) => [course.courseId, { pinnedSectionId: course.pinnedSectionId, excludedSectionIds: course.excludedSectionIds }])),
  };
}

// Only the two plans in this term and their relevant picks identify a run. Anonymous commitments are
// used here as well as in the request, so editing a private event's label never sends it to the server.
export const comparisonKey = (input: ComparisonInput) => canonicalJson([
  comparisonRequest(input, "A"), comparisonRequest(input, "B"),
  input.choices[`${input.term}:A`] ?? [], input.choices[`${input.term}:B`] ?? [],
]);

function validWindow(preferences: PlanPreferences) {
  const { windowStart: start, windowEnd: end, strictTime } = preferences;
  return !((start || end || strictTime) && (!start || !end || start >= end));
}

export function initialComparison(input: ComparisonInput): ComparisonSnapshot {
  const column = (slot: PlanSlot): ComparisonColumn => ({ courses: input.plans[slot], state: !input.plans[slot].length ? "empty" : validWindow(input.preferences) ? "loading" : "invalid" });
  return { A: column("A"), B: column("B") };
}

export function comparisonColumn(courses: SavedPlanCourse[], options: ScheduleOption[], saved?: string[]): ComparisonColumn {
  const ids = courses.map((course) => course.courseId);
  const match = findSavedOption(options, saved, ids);
  const option = match.option ?? options[0];
  if (!option) return { state: "unavailable", courses };
  return {
    state: "ready", courses, option,
    pick: match.option ? "saved" : saved?.length ? "invalid" : "unpicked",
    missing: ids.filter((id) => !option.selectedSections.some((section) => section.course_id === id)),
  };
}

// Two independent, read-only generations. Cancelling gates every update even when an old fetch ignores
// abort or completes parsing after another A/B/term/preferences run has started.
export function startPlanComparison(input: ComparisonInput, onUpdate: (state: ComparisonSnapshot) => void, fetcher: typeof fetch = fetch) {
  const controller = new AbortController();
  let cancelled = false;
  let state = initialComparison(input);
  const emit = () => { if (!cancelled) onUpdate(state); };
  emit();
  for (const slot of ["A", "B"] as const) {
    if (state[slot].state !== "loading") continue;
    void (async () => {
      let column: ComparisonColumn;
      try {
        const response = await fetcher("/api/schedules/generate", {
          method: "POST", headers: { "content-type": "application/json" },
          signal: controller.signal, body: JSON.stringify(comparisonRequest(input, slot)),
        });
        if (cancelled) return;
        if (!response.ok) throw new Error("generation failed");
        const payload = await response.json() as { options?: ScheduleOption[] };
        if (cancelled) return;
        if (!Array.isArray(payload.options)) throw new Error("incomplete generation");
        column = comparisonColumn(input.plans[slot], payload.options, input.choices[`${input.term}:${slot}`]);
      } catch {
        if (cancelled) return;
        column = { courses: input.plans[slot], state: "error" };
      }
      state = { ...state, [slot]: column };
      emit();
    })();
  }
  return () => { cancelled = true; controller.abort(); };
}

const countSeats = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value
  : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : null;

export function comparisonMetrics(column: ComparisonColumn) {
  if (column.state !== "ready" || !column.option) return null;
  const { option } = column;
  const incompleteTime = !Array.isArray(option.unknownSectionIds) || option.unknownSectionIds.length > 0;
  const incompletePlan = Boolean(column.missing?.length);
  const incomplete = incompleteTime || incompletePlan;
  const unknownCredits = incompletePlan || option.selectedSections.some((section) => section.credits === null || !Number.isFinite(section.credits));
  return {
    placed: option.selectedSections.length, planned: column.courses.length,
    credits: unknownCredits || !Number.isFinite(option.totalCredits) ? null : option.totalCredits,
    earliestStart: incomplete || typeof option.earliestStart !== "string" ? null : option.earliestStart,
    days: incomplete || !Array.isArray(option.campusDays) ? null : option.campusDays.length,
    gaps: incomplete || !Number.isFinite(option.gapMinutes) ? null : option.gapMinutes,
    walking: incomplete || !Number.isFinite(option.walkMinutes) ? null : option.walkMinutes,
    full: option.selectedSections.filter((section) => countSeats(section.open_seats) === 0).length,
    unknownSeats: option.selectedSections.filter((section) => countSeats(section.open_seats) === null).length + (column.missing?.length ?? 0),
    incompleteTime, incompletePlan,
  };
}

export type ComparisonDifference = { courseId: string; A: string[] | null; B: string[] | null };
// Null means the course is absent from that plan; [] means planned but not placed in its result.
export function comparisonDifferences(state: ComparisonSnapshot): ComparisonDifference[] | null {
  if ([state.A, state.B].some((column) => column.state !== "ready" && column.state !== "empty")) return null;
  const ids = [...new Set([...state.A.courses, ...state.B.courses].map((course) => course.courseId))].sort();
  const sections = (slot: PlanSlot, id: string) => state[slot].courses.some((course) => course.courseId === id)
    ? state[slot].option?.selectedSections.filter((section) => section.course_id === id).map((section) => section.section_id).sort() ?? [] : null;
  return ids.flatMap((courseId) => {
    const A = sections("A", courseId), B = sections("B", courseId);
    return canonicalJson(A) === canonicalJson(B) ? [] : [{ courseId, A, B }];
  });
}
