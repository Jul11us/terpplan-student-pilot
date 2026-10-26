import type { PlanPreferences } from "@/lib/planner";
import type { SavedPreferences, SavedState } from "@/lib/saved-state";
import { anonymousBusyBlocks } from "@/lib/personal-schedule";
import { planKey } from "@/lib/plan-key";
import { findSavedOption, optionSectionIds } from "@/lib/option-choice";

type OptionLike = { selectedSections: Array<{ section_id: string; course_id: string }> };
export type OptionPreview = { context: string; sectionIds: string[] };
export type OptionCommitContext = { choiceKey: string; requestKey: string; prefsKey: string; savedIds: string[] };

// The form, API request, and last-minute storage check must compare the same defaults and anonymous
// commitments. A label change is not a scheduling change and personal event names stay out of requests.
export function requestPreferences(value: PlanPreferences | SavedPreferences): PlanPreferences {
  return {
    earliestStart: value.earliestStart || null, earlyBefore: value.earlyBefore || null,
    excludedDays: value.excludedDays ?? [], windowStart: value.windowStart || null, windowEnd: value.windowEnd || null,
    strictTime: value.strictTime ?? false, openSeatsOnly: value.openSeatsOnly ?? false,
    preferGpa: value.preferGpa ?? false, preferFewerDays: value.preferFewerDays ?? false,
    preferNearbyClasses: value.preferNearbyClasses ?? false, campusAreas: value.campusAreas ?? [],
    includeFreshmanConnection: value.includeFreshmanConnection ?? false,
    busyBlocks: anonymousBusyBlocks(value.busyBlocks ?? []), bufferMinutes: value.bufferMinutes ?? 0,
  };
}

export function optionCommitKey(context: OptionCommitContext) {
  return JSON.stringify([context.choiceKey, context.requestKey, context.prefsKey, [...context.savedIds].sort()]);
}

// A stored pick remains a deliberate choice even when every old course has been removed. Only a
// never-picked plan can use its first recommendation without asking to replace a previous checklist.
export function optionSelection<T extends OptionLike>(options: T[], savedIds: string[] | undefined, courseIds: string[], context: string, preview: OptionPreview | null) {
  const match = findSavedOption(options, savedIds, courseIds);
  const replacementRequired = Boolean(savedIds?.length && !match.option);
  const previewed = preview?.context === context ? options.find((option) => JSON.stringify(optionSectionIds(option)) === JSON.stringify(preview.sectionIds)) : undefined;
  return { match, replacementRequired, option: replacementRequired ? previewed ?? options[0] : match.option ?? options[0] };
}

// Read from the latest stored active slot, rather than trusting an already-rendered card. Other terms,
// the other plan's pick, language, and unrelated saved fields do not invalidate this plan's confirmation.
export function storedOptionContext(saved: SavedState, term: string): OptionCommitContext {
  const choiceKey = `${term}:${saved.showingB?.[term] ? "B" : "A"}`;
  return { choiceKey, requestKey: planKey(saved.plans[term] ?? [], term), prefsKey: JSON.stringify(requestPreferences(saved.preferences ?? {})), savedIds: saved.chosen?.[choiceKey] ?? [] };
}

// Replacing an unavailable pick requires the latest saved context. Ordinary ready-card selections can
// still work for this visit when browser storage is blocked, as they did before replacement confirmation.
export function commitCurrentOption<T extends OptionLike>(option: T, options: T[], expected: OptionCommitContext, latest: OptionCommitContext | null, ready: boolean, commit: (option: T) => void, requireLatest = true) {
  if (!ready || (requireLatest && (!latest || optionCommitKey(expected) !== optionCommitKey(latest)))
    || !options.some((candidate) => JSON.stringify(optionSectionIds(candidate)) === JSON.stringify(optionSectionIds(option)))) return false;
  commit(option);
  return true;
}
