// Remembers a visitor's plan in this browser only (localStorage), so a refresh does not lose it.
// Nothing here is sent to the server. Storage can be missing or blocked (private windows,
// cleared site data), so every access is wrapped and the page works without it.

const STORAGE_KEY = "terpplan:v1";

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
  windowStart: string;
  windowEnd: string;
  strictTime: boolean;
  openSeatsOnly: boolean;
  includeFreshmanConnection: boolean;
};

export type SavedState = {
  language?: "en" | "zh";
  term?: string;
  // One plan per term, so switching terms and back restores each one.
  plans: Record<string, SavedPlanCourse[]>;
  preferences?: SavedPreferences;
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

function preferences(value: unknown): SavedPreferences | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const text = (key: string) => typeof record[key] === "string" ? record[key] as string : "";
  return {
    excludedDays: strings(record.excludedDays),
    earliestStart: text("earliestStart"),
    windowStart: text("windowStart"),
    windowEnd: text("windowEnd"),
    strictTime: record.strictTime === true,
    openSeatsOnly: record.openSeatsOnly === true,
    includeFreshmanConnection: record.includeFreshmanConnection === true,
  };
}

export function readSavedState(): SavedState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { plans: {} };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const plans: Record<string, SavedPlanCourse[]> = {};
    if (parsed.plans && typeof parsed.plans === "object") {
      for (const [term, courses] of Object.entries(parsed.plans as Record<string, unknown>)) {
        if (/^\d{6}$/.test(term)) plans[term] = planCourses(courses);
      }
    }
    return {
      language: parsed.language === "zh" || parsed.language === "en" ? parsed.language : undefined,
      term: typeof parsed.term === "string" && /^\d{6}$/.test(parsed.term) ? parsed.term : undefined,
      plans,
      preferences: preferences(parsed.preferences),
    };
  } catch {
    return { plans: {} };
  }
}

// Merges the given fields into what is already stored.
export function writeSavedState(patch: Partial<SavedState>) {
  try {
    const next = { ...readSavedState(), ...patch };
    // Drop empty per-term plans so old terms do not pile up.
    next.plans = Object.fromEntries(Object.entries(next.plans).filter(([, courses]) => courses.length));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable or full: the page keeps working, it just will not remember.
  }
}
