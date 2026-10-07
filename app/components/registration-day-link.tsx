"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { countdown, easternMoment, readRegistrationDay, REGISTRATION_DAY_EVENT, savedReminder } from "@/lib/registration-day";
import { RegistrationCountdown } from "@/app/components/registration-countdown";

type Language = "en" | "zh";

const copy = {
  en: { title: "Registration day", body: (n: number) => `Your ${n} courses, their section numbers and backups are ready on one page.`, open: "Open", setTime: "Add your registration time in the checklist under the timetable for a countdown." },
  zh: { title: "选课当天", body: (n: number) => `你的 ${n} 门课、班号和备选班次已经整理在一个页面里。`, open: "打开", setTime: "在课表下方的选课清单里填上注册时间，就会显示倒计时。" },
} as const;

type Saved = { courses: number; date: string; time: string };

function readSaved(term: string): Saved | null {
  const day = readRegistrationDay();
  if (!day || day.term !== term || !day.courses.length) return null;
  const reminder = savedReminder(day.termName);
  return { courses: day.courses.length, date: reminder.date, time: reminder.time };
}

// The home page's way into /register, once the planner has saved a list for this term. Hidden once the
// registration time is more than six hours past.
export function RegistrationDayLink({ term, language }: { term: string; language: Language }) {
  const t = copy[language];
  const [saved, setSaved] = useState<Saved | null>(null);
  useEffect(() => {
    const load = () => setSaved(readSaved(term));
    load();
    window.addEventListener(REGISTRATION_DAY_EVENT, load);
    window.addEventListener("storage", load);
    return () => { window.removeEventListener(REGISTRATION_DAY_EVENT, load); window.removeEventListener("storage", load); };
  }, [term]);
  if (!saved) return null;
  const target = easternMoment(saved.date, saved.time);
  if (target && countdown(target).state === "past") return null;
  return <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[#cddbd1] bg-[#edf3ef] px-4 py-3">
    <div className="min-w-0 flex-1 basis-64">
      <p className="text-sm font-semibold text-[#273c38]">📋 {t.title}</p>
      <p className="mt-0.5 text-xs leading-5 text-[#315c43]">{t.body(saved.courses)}</p>
      <div className="mt-1">{target ? <RegistrationCountdown date={saved.date} time={saved.time} language={language} /> : <p className="text-[11px] text-[#5d6561]">{t.setTime}</p>}</div>
    </div>
    <Link href="/register" className="shrink-0 rounded-lg bg-[#273c38] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d302c]">{t.open} →</Link>
  </div>;
}
