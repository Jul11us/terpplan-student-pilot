"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decideSync, parseSyncState, planSummary, sameSyncState, type SyncState } from "@/lib/plan-sync";
import { readSavedState, STORAGE_KEY } from "@/lib/saved-state";
import { readTaken, TAKEN_KEY } from "@/lib/taken-courses";
import { REMINDER_KEY } from "@/lib/registration-day";
import { formatTermName } from "@/lib/seat-trends";
import { LOCAL_CHANGE_EVENT, readSyncMeta, writeSyncMeta } from "@/lib/sync-meta";

type Language = "en" | "zh";
type Server = { account: string; state: SyncState | null; updatedAt: string | null };
// "upload": the account is empty and this device's plan was never synced with it; "conflict": both changed.
type Question = { kind: "upload" | "conflict"; account: string; otherAccount: boolean; local: SyncState; server: SyncState | null; updatedAt: string | null };

const copy = {
  en: {
    uploadTitle: "This device already has a plan. Save it to your account?",
    uploadOther: "It was left here by a different account. Only save it if it is yours.",
    uploadBody: "If this is a shared or borrowed computer, it may be someone else's.",
    save: "Save it to my account", startEmpty: "No, start this device empty",
    conflict: "This device's plan is different from the one in your account.",
    conflictOther: "This device's plan was left by a different account.",
    conflictWhen: (when: string) => `The account's copy was last changed ${when}.`,
    useAccount: "Use my account's plan", useDevice: "Keep this device's plan",
    account: "In your account", device: "On this device",
    courses: (list: string[]) => list.length ? list.join(", ") : "no courses",
    commitments: (n: number) => n ? ` · ${n} personal ${n === 1 ? "commitment" : "commitments"}` : "",
  },
  zh: {
    uploadTitle: "这台设备上已经有一份方案。要把它存到你的账号吗？",
    uploadOther: "这份方案是另一个账号留在这台设备上的，确定是你自己的再保存。",
    uploadBody: "如果这是公用或借来的电脑，它可能是别人的。",
    save: "存到我的账号", startEmpty: "不用，清空这台设备",
    conflict: "这台设备上的方案和你账号里的不一样。",
    conflictOther: "这台设备上的方案是另一个账号留下的。",
    conflictWhen: (when: string) => `账号里的版本更新于 ${when}。`,
    useAccount: "用账号里的方案", useDevice: "保留这台设备的方案",
    account: "账号里", device: "这台设备",
    courses: (list: string[]) => list.length ? list.join("、") : "没有课程",
    commitments: (n: number) => n ? ` · ${n} 个个人日程` : "",
  },
} as const;

function readReminders() {
  try { return JSON.parse(window.localStorage.getItem(REMINDER_KEY) ?? "{}") as SyncState["reminders"]; } catch { return {}; }
}

function localState(): SyncState {
  return parseSyncState({ saved: readSavedState(), taken: readTaken(), reminders: readReminders() })!;
}

// Replaces this device's planner data (not counted as a local change). An emptied device keeps its language.
function applyState(state: SyncState) {
  const language = state.saved.language ?? readSavedState().language;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state.saved, ...(language ? { language } : {}) }));
  if (state.taken) window.localStorage.setItem(TAKEN_KEY, JSON.stringify(state.taken));
  else window.localStorage.removeItem(TAKEN_KEY);
  window.localStorage.setItem(REMINDER_KEY, JSON.stringify(state.reminders));
}

const EMPTY: SyncState = { saved: { plans: {} }, taken: null, reminders: {} };

// Keeps a signed-in student's plan the same on every device. Runs on sign-in, on page load and when the tab
// comes back into view; uploads a couple of seconds after each change. onApplied reloads the page after the
// account's copy (or an emptied device) replaced this device's data.
export function PlanSync({ active, language, onApplied }: { active: boolean; language: Language; onApplied: () => void }) {
  const t = copy[language];
  const [question, setQuestion] = useState<Question | null>(null);
  const busyRef = useRef(false);
  const askingRef = useRef(false);

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

  const adopt = useCallback((state: SyncState, updatedAt: string | null, account: string) => {
    applyState(state);
    // An emptied device has not matched the account yet; its next change uploads without asking again.
    writeSyncMeta(updatedAt ? { account, lastSyncedAt: updatedAt, localChangedAt: updatedAt } : { account, lastSyncedAt: new Date(0).toISOString(), localChangedAt: new Date(0).toISOString() });
    onApplied();
  }, [onApplied]);

  const ask = useCallback((next: Question) => { askingRef.current = true; setQuestion(next); }, []);
  const answered = useCallback(() => { askingRef.current = false; setQuestion(null); }, []);

  const sync = useCallback(async () => {
    if (busyRef.current || askingRef.current) return;
    busyRef.current = true;
    try {
      const response = await fetch("/api/sync", { cache: "no-store" });
      if (!response.ok) return;
      let server = await response.json() as Server;
      const meta = readSyncMeta();
      const sameAccount = meta.account === server.account;
      const otherAccount = Boolean(meta.account) && !sameAccount;
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
      if (decision === "askUpload") ask({ kind: "upload", account: server.account, otherAccount, local, server: null, updatedAt: null });
      else if (decision === "conflict" && server.state && server.updatedAt) ask({ kind: "conflict", account: server.account, otherAccount, local, server: server.state, updatedAt: server.updatedAt });
    } catch {
      // Offline or the server is busy: the next change, load or focus tries again.
    } finally {
      busyRef.current = false;
    }
  }, [upload, adopt, ask]);

  useEffect(() => {
    if (!active) return;
    let timer = window.setTimeout(() => void sync(), 0);
    const changed = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void sync(), 2000); };
    const visible = () => { if (document.visibilityState === "visible") void sync(); };
    window.addEventListener(LOCAL_CHANGE_EVENT, changed);
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearTimeout(timer); window.removeEventListener(LOCAL_CHANGE_EVENT, changed); document.removeEventListener("visibilitychange", visible); };
  }, [active, sync]);

  if (!question) return null;
  const summary = (state: SyncState) => {
    const { term, courses, commitments } = planSummary(state);
    const label = /^\d{6}$/.test(term) ? formatTermName(term, language) + (language === "zh" ? "：" : ": ") : "";
    return label + t.courses(courses) + t.commitments(commitments);
  };
  const when = question.updatedAt ? new Date(question.updatedAt).toLocaleString(language === "zh" ? "zh-CN" : "en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  const keepDevice = () => { void upload(question.account, true).then(answered); };
  return <div role="alert" className="mb-5 rounded-2xl border border-[#ead8b5] bg-[#fff8e8] px-4 py-3">
    <p className="text-sm font-semibold text-[#5f4316]">{question.kind === "upload" ? t.uploadTitle : t.conflict}</p>
    <p className="mt-0.5 text-xs leading-5 text-[#745424]">{question.otherAccount ? (question.kind === "upload" ? t.uploadOther : t.conflictOther) : question.kind === "upload" ? t.uploadBody : ""} {question.kind === "conflict" ? t.conflictWhen(when) : ""}</p>
    <dl className="mt-2 grid gap-1 text-xs text-[#5f4316] sm:grid-cols-[auto_1fr] sm:gap-x-3">
      {question.server && <><dt className="font-semibold">{t.account}</dt><dd>{summary(question.server)}</dd></>}
      <dt className="font-semibold">{t.device}</dt><dd>{summary(question.local)}</dd>
    </dl>
    <div className="mt-2 flex flex-wrap gap-2">
      {question.kind === "upload" ? <>
        <button type="button" onClick={keepDevice} className="rounded-lg bg-[#273c38] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d302c]">{t.save}</button>
        <button type="button" onClick={() => adopt(EMPTY, null, question.account)} className="rounded-lg border border-[#c99a4a] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f4316] hover:bg-[#fffaf0]">{t.startEmpty}</button>
      </> : <>
        <button type="button" onClick={() => adopt(question.server!, question.updatedAt, question.account)} className="rounded-lg bg-[#273c38] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d302c]">{t.useAccount}</button>
        <button type="button" onClick={keepDevice} className="rounded-lg border border-[#c99a4a] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f4316] hover:bg-[#fffaf0]">{t.useDevice}</button>
      </>}
    </div>
  </div>;
}
