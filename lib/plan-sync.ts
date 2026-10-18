// Plans follow a signed-in student between devices. What travels is one document: the saved plans and
// preferences (personal commitments with their names included), the courses taken (codes and a credit count,
// no grades), the registration times typed in the checklist and My week for each term. The newer copy wins; when
// this device and the account both changed since they last matched, the student chooses which one to keep.
// The sample plan (?demo=1) never syncs.

import { canonicalJson, parseSavedState, type SavedState } from "@/lib/saved-state";
import { parseTaken, type TakenCourses } from "@/lib/taken-courses";
import { roadmapHasCourses } from "@/lib/roadmap";
import { parseMyWeeks, type MyWeeks } from "@/lib/my-week";

// weeks is left out by a page from before My week synced: the account keeps its weeks then, and so does a device
// that downloads such a copy.
export type SyncState = { saved: SavedState; taken: TakenCourses | null; reminders: Record<string, { date: string; time: string }>; weeks?: MyWeeks };

export const MAX_SYNC_BYTES = 65_536;

function parseReminders(value: unknown) {
  const result: Record<string, { date: string; time: string }> = {};
  if (!value || typeof value !== "object") return result;
  for (const [term, entry] of Object.entries(value as Record<string, unknown>).slice(0, 12)) {
    const record = entry as { date?: unknown; time?: unknown } | null;
    if (term.length > 40 || !record) continue;
    const date = typeof record.date === "string" && /^(\d{4}-\d{2}-\d{2})?$/.test(record.date) ? record.date : "";
    const time = typeof record.time === "string" && /^(\d{2}:\d{2})?$/.test(record.time) ? record.time : "";
    if (date || time) result[term] = { date, time };
  }
  return result;
}

// Every field is checked the same way as when it is read from this browser; anything unusable is dropped.
export function parseSyncState(value: unknown): SyncState | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return { saved: parseSavedState(record.saved), taken: parseTaken(record.taken), reminders: parseReminders(record.reminders), ...(record.weeks === undefined ? {} : { weeks: parseMyWeeks({ weeks: record.weeks }) }) };
}

const hasWeeks = (state: SyncState) => Boolean(state.weeks && Object.keys(state.weeks).length);

export function syncStateEmpty(state: SyncState) {
  return !Object.values(state.saved.plans).some((courses) => courses.length)
    && !Object.values(state.saved.otherPlans ?? {}).some((courses) => courses.length)
    && !(state.saved.genEd?.codes.length)
    && !roadmapHasCourses(state.saved.roadmap)
    && !state.taken && !(state.saved.preferences?.busyBlocks?.length) && !hasWeeks(state);
}

// The same content, whatever order its keys were written in (for "is this already the account's copy?").
// (The taken courses' own "updatedAt" is when they were typed, not part of their content; no weeks and weeks left
// out are the same.)
export function sameSyncState(a: SyncState, b: SyncState) {
  const content = (state: SyncState) => ({ ...state, taken: state.taken ? { ...state.taken, updatedAt: undefined } : null, weeks: hasWeeks(state) ? state.weeks : undefined });
  return canonicalJson(content(a)) === canonicalJson(content(b));
}

// A legacy account copy has no weeks field. Keep this device's weeks only when they already belong to that
// account; choosing another account's copy on a shared device must not carry the previous student's week over.
export function syncStateForAccount(state: SyncState, previousAccount: string | undefined, account: string): SyncState {
  return state.weeks === undefined && previousAccount !== account ? { ...state, weeks: {} } : state;
}

// "askUpload": the account is empty but this device has data it never synced with this account (someone
// else's plan on a shared computer, say), so the student is asked before it goes into their account.
export type SyncDecision = "upload" | "download" | "conflict" | "askUpload" | "inSync";

// What to do when this device and the account are compared.
//   lastSynced: when the two last matched (null when this device never synced with this account)
//   localChanged: whether this device's data changed after that
export function decideSync(input: { local: SyncState; server: { state: SyncState; updatedAt: string } | null; lastSynced: string | null; localChanged: boolean }): SyncDecision {
  const { local, server, lastSynced, localChanged } = input;
  const localEmpty = syncStateEmpty(local);
  if (!server) return localEmpty ? "inSync" : lastSynced ? "upload" : "askUpload";
  if (sameSyncState(local, server.state)) return "inSync";
  const serverChanged = !lastSynced || server.updatedAt > lastSynced;
  if (!serverChanged) return localChanged ? "upload" : "inSync";
  if (!localChanged || localEmpty) return "download";
  return "conflict";
}

// The courses of the plan on screen for a term, for the "which copy do you keep?" question, and the terms with a
// saved week.
export function planSummary(state: SyncState) {
  const term = state.saved.term ?? Object.keys(state.saved.plans)[0] ?? "";
  return { term, courses: (state.saved.plans[term] ?? []).map((course) => course.courseId), commitments: state.saved.preferences?.busyBlocks?.length ?? 0, weeks: Object.keys(state.weeks ?? {}).sort() };
}

// Everything a student's planner keeps in this browser, for "sign out and clear this device".
export const PERSONAL_KEYS = ["terpplan:v1", "terpplan:taken", "terpplan:audit-needs", "terpplan:registration-time", "terpplan:registration-day", "terpplan:my-week", "terpplan:sync-meta"];
