// Remembers a visitor's plan in this browser only (localStorage), so a refresh does not lose it.
// Event labels are local. Anonymous time constraints are sent only when scheduling.
// Storage can be missing or blocked (private windows,
// cleared site data), so every access is wrapped and the page works without it.

import { normalizeBusyBlocks, validBuffer, type BusyBlock } from "@/lib/personal-schedule";
import { CAMPUS_AREA_KEYS } from "@/lib/campus-walk";
import { GEN_ED_CATEGORIES } from "@/lib/gened-categories";
import { storageKey } from "@/lib/demo";
import { browserLanguage } from "@/lib/language";
import { markLocalChange } from "@/lib/sync-meta";
import { parseRoadmap, type SavedRoadmap } from "@/lib/roadmap";

export const STORAGE_KEY = "terpplan:v1";

export type SavedPlanCourse = {
  courseId: string;
  courseTitle: string;
  instructors?: string[];
  pinnedSectionId?: string;
  excludedSectionIds?: string[];
};

export type SavedPreferences = {
  excludedDays: string[];
  earliestStart: string;
  // When early classes start costing points ("HH:MM" or "off"); empty means the default, 9am.
  earlyBefore?: string;
  windowStart: string;
  windowEnd: string;
  strictTime: boolean;
  openSeatsOnly: boolean;
  preferGpa?: boolean;
  preferFewerDays?: boolean;
  campusAreas?: string[];
  preferNearbyClasses?: boolean;
  includeFreshmanConnection: boolean;
  busyBlocks?: BusyBlock[];
  bufferMinutes?: number;
};

// The Gen Ed requirements a student still needs, as picked in the Gen Ed finder: the categories, how many
// courses each when that is two, what they have taken toward Diversity (when they said), and whether the
// "fewest courses" sets were showing. Not tied to a term.
export type SavedGenEd = {
  codes: string[];
  counts: Record<string, number>;
  diversity?: "none" | "DVUP" | "DVCC";
  optimizing?: boolean;
};

export type SavedState = {
  language?: "en" | "zh";
  term?: string;
  // One plan per term, so switching terms and back restores each one.
  plans: Record<string, SavedPlanCourse[]>;
  // Plan A / Plan B: plans[term] is always the plan on screen, so the rest of the page reads one list;
  // otherPlans[term] is the one put aside, and showingB marks the terms where Plan B is on screen.
  otherPlans?: Record<string, SavedPlanCourse[]>;
  showingB?: Record<string, true>;
  // The schedule option the student picked, by term and plan ("202701:A"), as its section ids. The planner shows
  // that option again after a reload or new seat counts, instead of whichever one ranks first then.
  chosen?: Record<string, string[]>;
  preferences?: SavedPreferences;
  genEd?: SavedGenEd;
  // The four-year plan (lib/roadmap.ts).
  roadmap?: SavedRoadmap;
};

const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function planCourses(value: unknown): SavedPlanCourse[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.courseId !== "string" || !/^[A-Z]{4}\d{3}[A-Z0-9]*$/.test(record.courseId)) return [];
    const instructors = strings(record.instructors);
    const sectionId = (value: unknown) => typeof value === "string" && value.startsWith(record.courseId + "-") ? value : null;
    const pinnedSectionId = sectionId(record.pinnedSectionId);
    const excludedSectionIds = [...new Set(strings(record.excludedSectionIds).filter((id) => sectionId(id) && id !== pinnedSectionId))];
    return [{
      courseId: record.courseId,
      courseTitle: typeof record.courseTitle === "string" ? record.courseTitle : record.courseId,
      ...(instructors.length ? { instructors } : {}),
      ...(pinnedSectionId ? { pinnedSectionId } : {}),
      ...(excludedSectionIds.length ? { excludedSectionIds } : {}),
    }];
  }).slice(0, 10);
}

export const choiceKey = (term: string, planB: boolean) => `${term}:${planB ? "B" : "A"}`;

function chosen(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => /^\d{6}:[AB]$/.test(key))
    .map(([key, ids]) => [key, [...new Set(strings(ids).filter((id) => /^[A-Z]{4}\d{3}[A-Z0-9]*-[A-Z0-9]{1,8}$/.test(id)))].sort().slice(0, 10)] as const)
    .filter(([, ids]) => ids.length)
    .slice(0, 24));
}

function preferences(value: unknown): SavedPreferences | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const text = (key: string) => typeof record[key] === "string" ? record[key] as string : "";
  return {
    excludedDays: strings(record.excludedDays),
    earliestStart: text("earliestStart"),
    earlyBefore: /^(off|\d{2}:\d{2})$/.test(text("earlyBefore")) ? text("earlyBefore") : "",
    windowStart: text("windowStart"),
    windowEnd: text("windowEnd"),
    strictTime: record.strictTime === true,
    openSeatsOnly: record.openSeatsOnly === true,
    preferGpa: record.preferGpa === true,
    preferFewerDays: record.preferFewerDays === true,
    // Only area names this build knows survive; the planner drops any others again.
    campusAreas: strings(record.campusAreas).filter((area) => (CAMPUS_AREA_KEYS as string[]).includes(area)),
    preferNearbyClasses: record.preferNearbyClasses === true,
    includeFreshmanConnection: record.includeFreshmanConnection === true,
    busyBlocks: normalizeBusyBlocks(record.busyBlocks ?? []),
    bufferMinutes: validBuffer(record.bufferMinutes) ? record.bufferMinutes : 0,
  };
}

function genEd(value: unknown): SavedGenEd | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const codes = [...new Set(strings(record.codes).filter((code) => GEN_ED_CATEGORIES.some((item) => item.code === code)))];
  if (!codes.length) return undefined;
  const rawCounts = record.counts && typeof record.counts === "object" ? record.counts as Record<string, unknown> : {};
  const counts = Object.fromEntries(codes.filter((code) => rawCounts[code] === 2).map((code) => [code, 2]));
  const diversity = record.diversity === "none" || record.diversity === "DVUP" || record.diversity === "DVCC" ? record.diversity : undefined;
  return { codes, counts, ...(diversity ? { diversity } : {}), ...(record.optimizing === true ? { optimizing: true } : {}) };
}

// Checks every field of a stored (or transferred) state; anything unusable is dropped.
export function parseSavedState(value: unknown): SavedState {
  if (!value || typeof value !== "object") return { plans: {} };
  const parsed = value as Record<string, unknown>;
  const byTerm = (raw: unknown) => {
    const result: Record<string, SavedPlanCourse[]> = {};
    if (raw && typeof raw === "object") {
      for (const [term, courses] of Object.entries(raw as Record<string, unknown>)) {
        if (/^\d{6}$/.test(term)) result[term] = planCourses(courses);
      }
    }
    return result;
  };
  const showingB = parsed.showingB && typeof parsed.showingB === "object"
    ? Object.fromEntries(Object.entries(parsed.showingB as Record<string, unknown>).filter(([term, value]) => /^\d{6}$/.test(term) && value === true).map(([term]) => [term, true as const]))
    : {};
  const savedGenEd = genEd(parsed.genEd);
  const roadmap = parseRoadmap(parsed.roadmap);
  return {
    language: parsed.language === "zh" || parsed.language === "en" ? parsed.language : undefined,
    term: typeof parsed.term === "string" && /^\d{6}$/.test(parsed.term) ? parsed.term : undefined,
    plans: byTerm(parsed.plans),
    otherPlans: byTerm(parsed.otherPlans),
    showingB,
    chosen: chosen(parsed.chosen),
    preferences: preferences(parsed.preferences),
    ...(savedGenEd ? { genEd: savedGenEd } : {}),
    ...(roadmap ? { roadmap } : {}),
  };
}

// Puts the plan on screen aside and brings the other one (A <-> B) for this term.
export function swapPlans(state: SavedState, term: string, current: SavedPlanCourse[]): Pick<SavedState, "plans" | "otherPlans" | "showingB"> {
  const showingB = { ...state.showingB };
  if (showingB[term]) delete showingB[term];
  else showingB[term] = true;
  return {
    plans: { ...state.plans, [term]: state.otherPlans?.[term] ?? [] },
    otherPlans: { ...state.otherPlans, [term]: current },
    showingB,
  };
}

export function readSavedState(): SavedState {
  try {
    const raw = window.localStorage.getItem(storageKey(STORAGE_KEY));
    return raw ? parseSavedState(JSON.parse(raw)) : { plans: {} };
  } catch {
    return { plans: {} };
  }
}

// The language a page opens in: the student's choice once they have made one, else their browser's.
export function readLanguage(saved: SavedState = readSavedState()): "en" | "zh" {
  return saved.language ?? browserLanguage();
}

// JSON with object keys sorted and undefined fields left out, so equal content gives equal text.
export function canonicalJson(value: unknown): string {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical)
    : item && typeof item === "object" ? Object.fromEntries(Object.entries(item as Record<string, unknown>).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]))
    : item;
  return JSON.stringify(canonical(value));
}

// Merges the given fields into what is already stored.
export function writeSavedState(patch: Partial<SavedState>) {
  try {
    const before = window.localStorage.getItem(storageKey(STORAGE_KEY));
    const next = { ...readSavedState(), ...patch };
    // Drop empty per-term plans so old terms do not pile up.
    next.plans = Object.fromEntries(Object.entries(next.plans).filter(([, courses]) => courses.length));
    next.otherPlans = Object.fromEntries(Object.entries(next.otherPlans ?? {}).filter(([, courses]) => courses.length));
    window.localStorage.setItem(storageKey(STORAGE_KEY), JSON.stringify(next));
    // The page saves after every render, not always with keys in the same order; only a change in content
    // is one for account sync.
    if (canonicalJson(parseSavedState(before ? JSON.parse(before) : null)) !== canonicalJson(parseSavedState(next))) markLocalChange();
  } catch {
    // Storage unavailable or full: the page keeps working, it just will not remember.
  }
}

// Merge one pick into the latest browser copy: another tab may have picked for a different term or plan
// since this component mounted. Only fall back to the in-memory picks when storage cannot be read.
export function writeOptionChoice(key: string, sectionIds: string[], fallback: Record<string, string[]> = {}) {
  let choices = fallback;
  try {
    const raw = window.localStorage.getItem(storageKey(STORAGE_KEY));
    choices = raw ? parseSavedState(JSON.parse(raw)).chosen ?? {} : {};
  } catch { /* storage blocked: this visit's picks still work */ }
  const next = { ...choices, [key]: sectionIds };
  writeSavedState({ chosen: next });
  return next;
}
