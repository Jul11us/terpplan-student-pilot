// "Try a sample": terpplan.com/plan?demo=1 (or the old terpplan.com/?demo=1) opens a ready-made student (courses, a campus job, courses already
// taken) to play with, without touching the visitor's own plan. While the sample is on, every place this
// browser stores planner data uses a separate ":demo" copy, so leaving the sample brings the real plan back
// exactly as it was. The sample lasts for the tab (sessionStorage); closing the tab or "Leave sample" ends it.

import type { SavedState } from "@/lib/saved-state";
import type { TakenCourses } from "@/lib/taken-courses";
import { browserLanguage } from "@/lib/language";

const FLAG = "terpplan:demo";
// Set when a sample is set up and cleared the first time the planner reads it, so a sample opens on its
// ranked schedules instead of the empty "find courses" panel.
const FRESH = "terpplan:demo-fresh";
const SUFFIX = ":demo";
export const DEMO_TERM = "202701";

// Keys whose data is the student's own; each gets a ":demo" twin while the sample is on.
const DEMO_KEYS = ["terpplan:v1", "terpplan:taken", "terpplan:audit-needs", "terpplan:my-week", "terpplan:registration-time", "terpplan:registration-day", "terpplan:popularity-sharing"];

export function isDemo() {
  try { return typeof window !== "undefined" && window.sessionStorage.getItem(FLAG) === "1"; } catch { return false; }
}

// True once, right after a sample is set up from the link or the "Try a sample" button: the planner opens
// on the ranked schedules. Later loads of the same tab keep whichever step the student was last on.
export function takeFreshDemo() {
  try {
    if (typeof window === "undefined" || window.sessionStorage.getItem(FRESH) !== "1") return false;
    window.sessionStorage.removeItem(FRESH);
    return true;
  } catch { return false; }
}

// The storage key to use for one of the keys above: its sample copy while the sample is on.
export function storageKey(key: string) {
  return isDemo() ? key + SUFFIX : key;
}

export function demoState(language: "en" | "zh"): SavedState {
  return {
    language,
    term: DEMO_TERM,
    plans: { [DEMO_TERM]: [
      { courseId: "MATH141", courseTitle: "Calculus II" },
      { courseId: "CMSC132", courseTitle: "Object-Oriented Programming II" },
      { courseId: "COMM107", courseTitle: "Oral Communication: Principles and Practices" },
      { courseId: "PSYC100", courseTitle: "Introduction to Psychology" },
      { courseId: "ENGL101", courseTitle: "Academic Writing" },
    ] },
    preferences: {
      excludedDays: [], earliestStart: "", earlyBefore: "", windowStart: "", windowEnd: "", strictTime: false, openSeatsOnly: false,
      includeFreshmanConnection: false,
      busyBlocks: [{ id: "demo-job", days: ["Tue", "Thu"], start: "13:00", end: "16:00", label: language === "zh" ? "校内打工" : "Campus job" }],
      bufferMinutes: 0,
    },
  };
}

export const DEMO_TAKEN: TakenCourses = { completed: ["MATH140", "CMSC131"], inProgress: [], credits: 31, source: "manual", updatedAt: "" };

// Called once when the page script loads, before the planner reads storage: ?demo=1 starts a fresh sample
// (the parameter is then taken out of the address; other parameters such as ?ref= stay).
export function startDemoFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("demo") !== "1") return;
  url.searchParams.delete("demo");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  seedDemo();
}

// A fresh sample: its own copies of the plan and the taken courses, and the flag for this tab.
function seedDemo() {
  try {
    let language: "en" | "zh" = browserLanguage();
    // Keep the language the visitor already chose, if any.
    const real = JSON.parse(window.localStorage.getItem("terpplan:v1") ?? "null") as { language?: unknown } | null;
    if (real?.language === "zh" || real?.language === "en") language = real.language;
    for (const key of DEMO_KEYS) window.localStorage.removeItem(key + SUFFIX);
    window.localStorage.setItem("terpplan:v1" + SUFFIX, JSON.stringify(demoState(language)));
    window.localStorage.setItem("terpplan:taken" + SUFFIX, JSON.stringify(DEMO_TAKEN));
    window.sessionStorage.setItem(FLAG, "1");
    window.sessionStorage.setItem(FRESH, "1");
  } catch {
    // Storage blocked: the sample cannot be kept apart from a real plan, so it does not start.
  }
}

// Both reload the page, so everything that already read storage starts over from the right copy.
export function enterDemo() {
  seedDemo();
  window.location.reload();
}

export function leaveDemo() {
  try {
    window.sessionStorage.removeItem(FLAG);
    window.sessionStorage.removeItem(FRESH);
    for (const key of DEMO_KEYS) window.localStorage.removeItem(key + SUFFIX);
  } catch { /* nothing to clean up */ }
  window.history.replaceState(null, "", "/plan");
  window.location.reload();
}
