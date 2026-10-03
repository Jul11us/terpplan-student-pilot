"use client";

import { useEffect, useState } from "react";

type Language = "en" | "zh";

const copy = {
  en: {
    title: "Email me when a seat opens",
    off: "Off. Seat changes show only while this page is open.",
    on: "On. We email you once each time a full section you watch opens up.",
    consent: "Turning this on saves your email address so TerpPlan can send seat alerts. You can turn it off here or from any alert email.",
    confirmEmail: "Confirm the email you signed in with",
    enable: "Turn on seat emails",
    disable: "Turn off",
    notConfigured: "Seat emails are not available yet.",
    mismatch: "That is not the email you signed in with.",
    error: "Could not update seat emails. Please try again.",
    lag: "Checks run about every 10 minutes and seat data can lag, so a seat may be gone by the time you open the email.",
  },
  zh: {
    title: "有空位时发邮件提醒我",
    off: "已关闭。只有打开本页面时才会检查余位变化。",
    on: "已开启。你关注的班次从满员变为有空位时，每次开放发一封邮件。",
    consent: "开启后会保存你的邮箱地址，仅用于发送余位提醒。可随时在这里或任意一封提醒邮件中关闭。",
    confirmEmail: "请确认你登录时使用的邮箱",
    enable: "开启邮件提醒",
    disable: "关闭",
    notConfigured: "邮件提醒暂未开放。",
    mismatch: "这不是你登录时使用的邮箱。",
    error: "暂时无法更新邮件提醒，请重试。",
    lag: "系统大约每 10 分钟检查一次，余位数据也可能有延迟，收到邮件时位置可能已被占用。",
  },
} as const;

export default function SeatEmailToggle({ language, defaultEmail }: { language: Language; defaultEmail: string }) {
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
  return <div className="mt-3 rounded-xl border border-[#e3dfd6] bg-white p-4">
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
