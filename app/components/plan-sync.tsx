"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decideSync, parseSyncState, sameSyncState, type SyncState } from "@/lib/plan-sync";
import { readSavedState, STORAGE_KEY } from "@/lib/saved-state";
import { readTaken, TAKEN_KEY } from "@/lib/taken-courses";
import { REMINDER_KEY } from "@/lib/registration-day";
import { LOCAL_CHANGE_EVENT, readSyncMeta, writeSyncMeta } from "@/lib/sync-meta";

type Language = "en" | "zh";
type Server = { account: string; state: SyncState | null; updatedAt: string | null };

const copy = {
  en: {
    conflict: "This device's plan is different from the one in your account.",
    conflictWhen: (when: string) => `The account's copy was last changed ${when}.`,
    useAccount: "Use my account's plan", useDevice: "Keep this device's plan",
  },
  zh: {
    conflict: "这台设备上的方案和你账号里的不一样。",
    conflictWhen: (when: string) => `账号里的版本更新于 ${when}。`,
    useAccount: "用账号里的方案", useDevice: "保留这台设备的方案",
  },
} as const;

function readReminders() {
  try { return JSON.parse(window.localStorage.getItem(REMINDER_KEY) ?? "{}") as SyncState["reminders"]; } catch { return {}; }
}

function localState(): SyncState {
  return parseSyncState({ saved: readSavedState(), taken: readTaken(), reminders: readReminders() })!;
}

// Replaces this device's planner data with the account's (not counted as a local change).
function applyState(state: SyncState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.saved));
  if (state.taken) window.localStorage.setItem(TAKEN_KEY, JSON.stringify(state.taken));
  else window.localStorage.removeItem(TAKEN_KEY);
  window.localStorage.setItem(REMINDER_KEY, JSON.stringify(state.reminders));
}

// Keeps a signed-in student's plan the same on every device. Runs on sign-in, on page load and when the tab
// comes back into view; uploads a couple of seconds after each change. onApplied reloads the page after the
// account's copy replaced this device's.
export function PlanSync({ active, language, onApplied }: { active: boolean; language: Language; onApplied: () => void }) {
  const t = copy[language];
  const [conflict, setConflict] = useState<{ state: SyncState; updatedAt: string; account: string } | null>(null);
  const busyRef = useRef(false);
  const conflictRef = useRef(false);

  const upload = useCallback(async (account: string, force = false): Promise<Server | "ok" | null> => {
    const meta = readSyncMeta();
    const updatedAt = meta.localChangedAt ?? new Date().toISOString();
    const response = await fetch("/api/sync", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: localState(), updatedAt, force }) });
    if (response.status === 409) {
      const body = await response.json() as { state: SyncState | null; updatedAt: string | null };
      return { account, state: body.state, updatedAt: body.updatedAt };
    }
    if (!response.ok) return null;
    const body = await response.json() as { updatedAt: string };
    // A change made while this upload was on its way stays pending for the next one.
    const latest = readSyncMeta().localChangedAt;
    writeSyncMeta({ account, lastSyncedAt: body.updatedAt, ...(latest === meta.localChangedAt ? { localChangedAt: body.updatedAt } : {}) });
    return "ok";
  }, []);

  const adopt = useCallback((state: SyncState, updatedAt: string, account: string) => {
    applyState(state);
    writeSyncMeta({ account, lastSyncedAt: updatedAt, localChangedAt: updatedAt });
    onApplied();
  }, [onApplied]);

  const sync = useCallback(async () => {
    if (busyRef.current || conflictRef.current) return;
    busyRef.current = true;
    try {
      const response = await fetch("/api/sync", { cache: "no-store" });
      if (!response.ok) return;
      let server = await response.json() as Server;
      const meta = readSyncMeta();
      const sameAccount = meta.account === server.account;
      const local = localState();
      const decide = (current: Server) => decideSync({
        local, server: current.state && current.updatedAt ? { state: current.state, updatedAt: current.updatedAt } : null,
        lastSynced: sameAccount ? meta.lastSyncedAt ?? null : null,
        // A device that never synced with this account counts its own plan as changed.
        localChanged: !sameAccount || !meta.lastSyncedAt || (meta.localChangedAt ?? "") > meta.lastSyncedAt,
      });
      let decision = decide(server);
      if (decision === "upload") {
        const result = await upload(server.account);
        if (result === "ok" || result === null) return;
        server = result;
        decision = decide(server);
      }
      if (decision === "inSync") {
        // Same content as the account's: remember that they match now.
        if (server.state && server.updatedAt && sameSyncState(local, server.state)) writeSyncMeta({ account: server.account, lastSyncedAt: server.updatedAt, localChangedAt: server.updatedAt });
        return;
      }
      if (decision === "download" && server.state && server.updatedAt) { adopt(server.state, server.updatedAt, server.account); return; }
      if (decision === "conflict" && server.state && server.updatedAt) { conflictRef.current = true; setConflict({ state: server.state, updatedAt: server.updatedAt, account: server.account }); }
    } catch {
      // Offline or the server is busy: the next change, load or focus tries again.
    } finally {
      busyRef.current = false;
    }
  }, [upload, adopt]);

  useEffect(() => {
    if (!active) return;
    let timer = window.setTimeout(() => void sync(), 0);
    const changed = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void sync(), 2000); };
    const visible = () => { if (document.visibilityState === "visible") void sync(); };
    window.addEventListener(LOCAL_CHANGE_EVENT, changed);
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearTimeout(timer); window.removeEventListener(LOCAL_CHANGE_EVENT, changed); document.removeEventListener("visibilitychange", visible); };
  }, [active, sync]);

  if (!conflict) return null;
  const when = new Date(conflict.updatedAt).toLocaleString(language === "zh" ? "zh-CN" : "en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return <div role="alert" className="mb-5 rounded-2xl border border-[#ead8b5] bg-[#fff8e8] px-4 py-3">
    <p className="text-sm font-semibold text-[#5f4316]">{t.conflict}</p>
    <p className="mt-0.5 text-xs text-[#745424]">{t.conflictWhen(when)}</p>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" onClick={() => adopt(conflict.state, conflict.updatedAt, conflict.account)} className="rounded-lg bg-[#273c38] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d302c]">{t.useAccount}</button>
      <button type="button" onClick={() => { void upload(conflict.account, true).then(() => { conflictRef.current = false; setConflict(null); }); }} className="rounded-lg border border-[#c99a4a] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f4316] hover:bg-[#fffaf0]">{t.useDevice}</button>
    </div>
  </div>;
}
