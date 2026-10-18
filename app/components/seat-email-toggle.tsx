"use client";

import { useEffect, useState } from "react";
import { ALERT_GAP_MINUTES, SEAT_CHECK_MINUTES } from "@/lib/seat-cadence";

type Language = "en" | "zh";

const copy = {
  en: {
    title: "Email me when a seat opens",
    off: "Off. Seat changes show only while this page is open.",
    on: `On. We email you when a full section you watch opens up: at most one email every ${ALERT_GAP_MINUTES} minutes, with the sections that opened in between together.`,
    consent: "Turning this on saves your email address so TerpPlan can send seat alerts. You can turn it off here or from any alert email.",
    confirmEmail: "Confirm the email you signed in with",
    enable: "Turn on seat emails",
    disable: "Turn off",
    notConfigured: "Seat emails are not available yet.",
    mismatch: "That is not the email you signed in with.",
    error: "Could not update seat emails. Please try again.",
    lag: `Checks run about every ${SEAT_CHECK_MINUTES} minutes and seat data can lag, so a seat may be gone by the time you open the email.`,
    unwatched: (n: number) => `You are watching ${n} section${n === 1 ? "" : "s"}, but seat emails are off: when one opens, you will only see it if this page is open.`,
  },
  zh: {
    title: "有空位时发邮件提醒我",
    off: "已关闭。只有打开本页面时才会检查余位变化。",
    on: `已开启。你关注的班次从满员变为有空位时发邮件：每 ${ALERT_GAP_MINUTES} 分钟最多一封，期间新开的班次合在同一封里。`,
    consent: "开启后会保存你的邮箱地址，仅用于发送余位提醒。可随时在这里或任意一封提醒邮件中关闭。",
    confirmEmail: "请确认你登录时使用的邮箱",
    enable: "开启邮件提醒",
    disable: "关闭",
    notConfigured: "邮件提醒暂未开放。",
    mismatch: "这不是你登录时使用的邮箱。",
    error: "暂时无法更新邮件提醒，请重试。",
    lag: `系统大约每 ${SEAT_CHECK_MINUTES} 分钟检查一次，余位数据也可能有延迟，收到邮件时位置可能已被占用。`,
    unwatched: (n: number) => `你关注了 ${n} 个班次，但还没开邮件提醒：有空位时不会通知你，只有打开这个页面才看得到。`,
  },
} as const;

export default function SeatEmailToggle({ language, defaultEmail, watchCount = 0 }: { language: Language; defaultEmail: string; watchCount?: number }) {
  const t = copy[language];
  const [status, setStatus] = useState<{ configured: boolean; enabled: boolean } | null>(null);
  const [email, setEmail] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/alerts").then(async (response) => {
      if (!response.ok) throw new Error("alerts");
      const payload = await response.json() as { configured: boolean; enabled: boolean };
      if (active) setStatus(payload);
    }).catch(() => { if (active) setStatus({ configured: false, enabled: false }); });
    return () => { active = false; };
  }, []);

  const update = async (enable: boolean) => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/alerts", enable
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }
        : { method: "DELETE" });
      const payload = await response.json() as { enabled?: boolean; code?: string };
      if (!response.ok) { setError(payload.code === "emailMismatch" ? t.mismatch : t.error); return; }
      setStatus((current) => ({ configured: current?.configured ?? true, enabled: Boolean(payload.enabled) }));
    } catch {
      setError(t.error);
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;
  // Watches with seat emails off never reach the student: say so where they turn emails on.
  const silent = status.configured && !status.enabled && watchCount > 0;
  return <div className={`mt-3 rounded-xl border bg-white p-4 ${silent ? "border-[#e2b86b] ring-1 ring-[#e2b86b]/40" : "border-[#e3dfd6]"}`}>
    {silent && <p role="alert" className="mb-3 rounded-lg bg-[#fff8e8] px-3 py-2 text-xs font-semibold leading-5 text-[#745424]">⚠ {t.unwatched(watchCount)}</p>}
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{t.title}</p>
        <p className="mt-1 text-xs leading-5 text-[#5d6561]">{!status.configured ? t.notConfigured : status.enabled ? t.on : t.off}</p>
      </div>
      {status.configured && status.enabled && <button onClick={() => void update(false)} disabled={busy} className="rounded-lg border border-[#dedbd3] px-3 py-2 text-xs font-medium text-[#8b5148] hover:bg-[#f7f5f0] disabled:opacity-50">{t.disable}</button>}
    </div>
    {status.configured && !status.enabled && <div className="mt-3">
      <p className="rounded-lg bg-[#f6f4ef] px-3 py-2 text-xs leading-5 text-[#59635f]">{t.consent}</p>
      <label className="mt-3 grid gap-1.5 text-xs font-medium text-[#5d6561]">{t.confirmEmail}<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-lg border border-[#dedbd3] bg-white px-3 py-2.5 text-sm text-[#202728] outline-none focus:border-[#a34a39] focus:ring-2 focus:ring-[#a34a39]/30" /></label>
      <button onClick={() => void update(true)} disabled={busy || !email.trim()} className="mt-3 rounded-lg bg-[#273c38] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{t.enable}</button>
    </div>}
    {status.configured && <p className="mt-3 text-[11px] leading-5 text-[#646c68]">{t.lag}</p>}
    {error && <p role="alert" className="mt-2 text-xs text-[#8c352c]">{error}</p>}
  </div>;
}
