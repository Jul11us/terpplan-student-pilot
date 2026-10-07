// Bookkeeping for account sync, in this browser: which account it last synced with, when the two last
// matched, and when the student last changed something here. Saving planner data calls markLocalChange().

import { isDemo } from "@/lib/demo";

const META_KEY = "terpplan:sync-meta";
export const LOCAL_CHANGE_EVENT = "terpplan:local-change";

export type SyncMeta = { account?: string; lastSyncedAt?: string; localChangedAt?: string };

export function readSyncMeta(): SyncMeta {
  try {
    const value = JSON.parse(window.localStorage.getItem(META_KEY) ?? "{}") as SyncMeta;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function writeSyncMeta(patch: SyncMeta) {
  try { window.localStorage.setItem(META_KEY, JSON.stringify({ ...readSyncMeta(), ...patch })); } catch { /* sync just retries later */ }
}

// The sample plan is not the student's, so changing it is not a change to sync.
export function markLocalChange() {
  if (typeof window === "undefined" || isDemo()) return;
  writeSyncMeta({ localChangedAt: new Date().toISOString() });
  window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT));
}
