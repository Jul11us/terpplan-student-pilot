"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buildReminderIcs } from "@/lib/ics";
import { storageKey } from "@/lib/demo";
import { markLocalChange } from "@/lib/sync-meta";
import { countdown, easternMoment, readRegistrationDay, REGISTRATION_DAY_EVENT, REMINDER_KEY, savedReminder, type RegistrationDay } from "@/lib/registration-day";
import { RegistrationCountdown } from "@/app/components/registration-countdown";

type Language = "en" | "zh";

const BLOCKS_URL = "https://registrar.umd.edu/registration/register-classes/blocks-special-permissions-exceptions-policy";

const copy = {
  en: {
    title: "Registration day", body: (n: number) => `Your ${n} courses, their section numbers and backups are ready on one page.`, open: "Open", setTime: "Enter your registration date and time below for a countdown.",
    timeTitle: "Registration time", timeIntro: "Find your time in Testudo and enter it here. The calendar file alerts you a day before and 15 minutes before, with your course and section numbers.",
    date: "Date", time: "Time (Eastern)", addCalendar: "Add to calendar (.ics)", downloaded: "Downloaded. Open the file to add it to your calendar.",
    summary: (term: string) => `Register for classes · ${term}`, listHeading: "Your TerpPlan course and section numbers:", backupsHeading: "Backups:", blocks: "Clear any registration block before this time:",
  },
  zh: {
    title: "选课当天", body: (n: number) => `你的 ${n} 门课、班号和备选班次已经整理在一个页面里。`, open: "打开", setTime: "在下面填上注册日期和时间，就会显示倒计时。",
    timeTitle: "注册时间", timeIntro: "在 Testudo 查到注册时间后填在这里。日历文件会在前一天和前 15 分钟提醒你，并附上课号和班号。",
    date: "日期", time: "时间（美东）", addCalendar: "加入日历（.ics）", downloaded: "已下载，打开文件即可加入日历。",
    summary: (term: string) => `选课注册 · ${term}`, listHeading: "TerpPlan 选课清单（课号 班号）：", backupsHeading: "备选班次：", blocks: "注册前先处理选课限制（block）：",
  },
} as const;

type Saved = { day: RegistrationDay; reminder: { date: string; time: string } };

function readSaved(term: string): Saved | null {
  const day = readRegistrationDay();
  if (!day || day.term !== term || !day.courses.length) return null;
  return { day, reminder: savedReminder(day.termName) };
}

// The home page's way into /register, once the planner has saved a list for this term, with the registration
// time entered here: the countdown and the calendar reminder. Hidden once the registration time is more than
// six hours past.
export function RegistrationDayLink({ term, language }: { term: string; language: Language }) {
  const t = copy[language];
  const [saved, setSaved] = useState<Saved | null>(null);
  const [reminderDone, setReminderDone] = useState(false);
  useEffect(() => {
    const load = () => setSaved(readSaved(term));
    load();
    window.addEventListener(REGISTRATION_DAY_EVENT, load);
    window.addEventListener("storage", load);
    return () => { window.removeEventListener(REGISTRATION_DAY_EVENT, load); window.removeEventListener("storage", load); };
  }, [term]);
  if (!saved) return null;
  const { day, reminder } = saved;
  const target = easternMoment(reminder.date, reminder.time);
  if (target && countdown(target).state === "past") return null;

  const changeReminder = (patch: Partial<typeof reminder>) => {
    const next = { ...reminder, ...patch };
    setSaved({ day, reminder: next }); setReminderDone(false);
    try {
      const all = JSON.parse(window.localStorage.getItem(storageKey(REMINDER_KEY)) ?? "{}") as Record<string, unknown>;
      window.localStorage.setItem(storageKey(REMINDER_KEY), JSON.stringify({ ...all, [day.termName]: next }));
    } catch { /* not remembered; the calendar download still works */ }
    markLocalChange();
    window.dispatchEvent(new Event(REGISTRATION_DAY_EVENT));
  };
  const downloadReminder = () => {
    const backups = day.courses.flatMap((course) => course.backups.map((backup) => `${course.courseId} ${backup.section}`));
    const description = [
      t.listHeading,
      ...day.courses.map((course) => `${course.courseId} ${course.section}`),
      ...(backups.length ? ["", t.backupsHeading, backups.join(", ")] : []),
      "", t.blocks, BLOCKS_URL, "", "Testudo: https://app.testudo.umd.edu/",
    ].join("\n");
    const ics = buildReminderIcs(reminder, { summary: t.summary(day.termName), description, url: "https://app.testudo.umd.edu/" });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `terpplan-registration-${reminder.date}.ics`;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setReminderDone(true);
  };

  return <div className="mb-5 rounded-2xl border border-[#cddbd1] bg-[#edf3ef] px-4 py-3">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-sm font-semibold text-[#273c38]">📋 {t.title}</p>
        <p className="mt-0.5 text-xs leading-5 text-[#315c43]">{t.body(day.courses.length)}</p>
        <div className="mt-1">{target ? <RegistrationCountdown date={reminder.date} time={reminder.time} language={language} /> : <p className="text-[11px] text-[#5d6561]">{t.setTime}</p>}</div>
      </div>
      <Link href="/register" className="shrink-0 rounded-lg bg-[#273c38] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d302c]">{t.open} →</Link>
    </div>
    <div className="mt-3 border-t border-[#cddbd1] pt-3">
      <p className="text-xs font-medium text-[#273c38]">{t.timeTitle}</p>
      <p className="mt-0.5 text-[11px] leading-5 text-[#315c43]">{t.timeIntro}</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-[#5d6561]">{t.date}<input type="date" value={reminder.date} onChange={(event) => changeReminder({ date: event.target.value })} className="mt-1 block rounded-lg border border-[#c4d6cb] bg-white px-2 py-1.5 text-xs text-[#24312d]" /></label>
        <label className="text-[11px] text-[#5d6561]">{t.time}<input type="time" value={reminder.time} onChange={(event) => changeReminder({ time: event.target.value })} className="mt-1 block rounded-lg border border-[#c4d6cb] bg-white px-2 py-1.5 text-xs text-[#24312d]" /></label>
        <button type="button" onClick={downloadReminder} disabled={!reminder.date || !reminder.time} className="rounded-lg bg-[#273c38] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d302c] disabled:cursor-not-allowed disabled:opacity-50">{t.addCalendar}</button>
      </div>
      {reminderDone && <p role="status" className="mt-2 text-[11px] text-[#367047]">✓ {t.downloaded}</p>}
    </div>
  </div>;
}
