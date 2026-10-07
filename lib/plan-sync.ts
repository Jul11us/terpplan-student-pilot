// Plans follow a signed-in student between devices. What travels is one document: the saved plans and
// preferences (personal commitments with their names included), the courses taken (codes and a credit count,
// no grades) and the registration times typed in the checklist. The newer copy wins; when this device and
// the account both changed since they last matched, the student chooses which one to keep.
// The sample plan (?demo=1) never syncs.

import { canonicalJson, parseSavedState, type SavedState } from "@/lib/saved-state";
import { parseTaken, type TakenCourses } from "@/lib/taken-courses";

export type SyncState = { saved: SavedState; taken: TakenCourses | null; reminders: Record<string, { date: string; time: string }> };

export const MAX_SYNC_BYTES = 32_768;

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
  return { saved: parseSavedState(record.saved), taken: parseTaken(record.taken), reminders: parseReminders(record.reminders) };
}

export function syncStateEmpty(state: SyncState) {
  return !Object.values(state.saved.plans).some((courses) => courses.length)
    && !Object.values(state.saved.otherPlans ?? {}).some((courses) => courses.length)
    && !state.taken && !(state.saved.preferences?.busyBlocks?.length);
}

// The same content, whatever order its keys were written in (for "is this already the account's copy?").
// (The taken courses' own "updatedAt" is when they were typed, not part of their content.)
export function sameSyncState(a: SyncState, b: SyncState) {
  const content = (state: SyncState) => ({ ...state, taken: state.taken ? { ...state.taken, updatedAt: undefined } : null });
  return canonicalJson(content(a)) === canonicalJson(content(b));
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

// The courses of the plan on screen for a term, for the "which copy do you keep?" question.
export function planSummary(state: SyncState) {
  const term = state.saved.term ?? Object.keys(state.saved.plans)[0] ?? "";
  return { term, courses: (state.saved.plans[term] ?? []).map((course) => course.courseId), commitments: state.saved.preferences?.busyBlocks?.length ?? 0 };
}

// Everything a student's planner keeps in this browser, for "sign out and clear this device".
export const PERSONAL_KEYS = ["terpplan:v1", "terpplan:taken", "terpplan:registration-time", "terpplan:registration-day", "terpplan:my-week", "terpplan:sync-meta"];
