"use client";

import { useEffect, useState } from "react";
import { countdown, easternMoment, formatCountdown } from "@/lib/registration-day";

type Language = "en" | "zh";

const copy = {
  en: { until: "Your registration opens in", open: "Your registration time has started. Register in Testudo now.", past: "Your registration time has passed." },
  zh: { until: "距离你的选课时间还有", open: "你的选课时间已经开始，现在就去 Testudo 注册。", past: "你的选课时间已经过了。" },
} as const;

// Counts down to the registration date and time the student entered (Eastern). Nothing without a time.
export function RegistrationCountdown({ date, time, language, large = false }: { date: string; time: string; language: Language; large?: boolean }) {
  const t = copy[language];
  const targetTime = easternMoment(date, time)?.getTime() ?? null;
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    if (targetTime === null) return;
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [targetTime]);
  // The first render waits for the clock, so the server and client HTML match.
  if (targetTime === null || !now) return null;
  const left = countdown(new Date(targetTime), now);
  if (left.state === "past") return <p className="text-xs text-[#646c68]">{t.past}</p>;
  if (left.state === "open") return <p role="status" className={`rounded-lg bg-[#a34a39] px-3 py-2 font-semibold text-white ${large ? "text-base" : "text-xs"}`}>{t.open}</p>;
  return <p className={large ? "text-sm text-[#48534f]" : "text-xs text-[#48534f]"}>{t.until} <span className={`font-semibold tabular-nums text-[#273c38] ${large ? "block font-serif text-4xl" : ""}`}>{formatCountdown(left, language)}</span></p>;
}
