"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDocumentLanguage } from "@/lib/document-language";
import { readSavedState, writeSavedState } from "@/lib/saved-state";
import { readRegistrationDay, savedReminder, writeRegistrationDay, type RegistrationDay } from "@/lib/registration-day";
import { RegistrationCountdown } from "@/app/components/registration-countdown";
import { formatTermName } from "@/lib/seat-trends";

type Language = "en" | "zh";

const copy = {
  en: {
    home: "Back to planner", eyebrow: "Registration day", title: (term: string) => `Register for ${term}`,
    none: "Nothing saved yet. Build a schedule in TerpPlan, then open \"Registration-day view\" from the registration checklist under the timetable.",
    noTime: "Add your registration date and time in the checklist to see a countdown here.",
    testudo: "Open Testudo", copyAll: "Copy all", copied: "Copied", copyFailed: "Copy failed. Select the text and copy it manually.",
    registered: "Registered", full: "Full", backups: "If it is full, try:", noBackups: "No backup section in your other options.",
    progress: (done: number, total: number) => `${done} of ${total} registered`,
    missing: "Not placed in this schedule, so not listed:",
    saved: (when: string) => `Saved from TerpPlan ${when}. If you change your schedule, open this page again from the checklist.`,
    confirm: "Seat counts were read when you saved; confirm each section in Testudo. TerpPlan cannot register you.",
  },
  zh: {
    home: "返回排课", eyebrow: "选课当天", title: (term: string) => `${term} 选课`,
    none: "还没有保存选课清单。先在 TerpPlan 排好课，再在课表下方的选课清单里点“打开‘选课当天’页面”。",
    noTime: "在选课清单里填上你的注册日期和时间，这里就会显示倒计时。",
    testudo: "打开 Testudo", copyAll: "全部复制", copied: "已复制", copyFailed: "复制失败，请手动选中文字复制。",
    registered: "已注册", full: "已满", backups: "满了的话可以试：", noBackups: "其他方案里没有这门课的备选班次。",
    progress: (done: number, total: number) => `已注册 ${done} / ${total} 门`,
    missing: "这些课没能排进这个方案，所以不在清单里：",
    saved: (when: string) => `清单保存于 ${when}。如果改了课表，请从选课清单重新打开这个页面。`,
    confirm: "余位是保存时读取的，请在 Testudo 中确认每个班次。TerpPlan 不能替你注册。",
  },
} as const;

export default function RegisterPage() {
  const [language, setLanguage] = useState<Language>("en");
  useDocumentLanguage(language);
  const [day, setDay] = useState<RegistrationDay | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reminder, setReminder] = useState({ date: "", time: "" });
  const [copied, setCopied] = useState("");
  const [failed, setFailed] = useState(false);
  const t = copy[language];

  useEffect(() => {
    // Read after the first render, so the server and client HTML match.
    const saved = readRegistrationDay();
    /* eslint-disable react-hooks/set-state-in-effect */
    setLanguage(readSavedState().language ?? "en");
    setDay(saved);
    if (saved) setReminder(savedReminder(saved.termName));
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const write = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key); setFailed(false);
      window.setTimeout(() => setCopied((current) => current === key ? "" : current), 1500);
    } catch { setFailed(true); }
  };
  const toggleDone = (courseId: string) => {
    if (!day) return;
    const next = { ...day, done: day.done.includes(courseId) ? day.done.filter((id) => id !== courseId) : [...day.done, courseId] };
    setDay(next); writeRegistrationDay(next);
  };
  const chip = (key: string, text: string, large = false) => <button type="button" onClick={() => void write(key, text)} title={t.copied} className={`rounded-lg border border-[#d9d6ce] bg-[#fbfaf8] font-mono font-semibold text-[#24312d] hover:bg-white ${large ? "px-3 py-2 text-base" : "px-2 py-1 text-xs"}`}>{copied === key ? `✓ ${t.copied}` : text}</button>;
  const when = day ? new Date(day.savedAt).toLocaleString(language === "zh" ? "zh-CN" : "en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

  return <main className="min-h-screen bg-[#f5f3ef] text-[#202728]">
    <header className="border-b border-[#dedbd3] bg-[#fbfaf8]"><div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-4 sm:px-8"><Link href="/" className="flex items-center gap-3 font-semibold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#bd302f] font-serif text-lg text-white">T</span>TerpPlan</Link><div className="flex items-center gap-3"><Link href="/" className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9d6ce] bg-white px-3 py-1.5 text-xs font-semibold text-[#273c38] shadow-sm hover:border-[#536d64] hover:bg-[#edf3ef]"><span aria-hidden="true">←</span>{t.home}</Link><button type="button" onClick={() => { const next = language === "en" ? "zh" : "en"; setLanguage(next); writeSavedState({ language: next }); }} className="rounded-lg border border-[#dcd9d0] px-3 py-2 text-xs">{language === "en" ? "中文" : "English"}</button></div></div></header>
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-8 sm:px-8">
      <p className="text-[11px] font-semibold uppercase tracking-[.17em] text-[#a34a39]">{t.eyebrow}</p>
      {loaded && !day && <p className="mt-4 rounded-xl border border-[#e0ddd5] bg-[#fbfaf8] px-4 py-3 text-sm leading-6 text-[#5d6561]">{t.none}</p>}
      {day && <>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl">{t.title(/^\d{6}$/.test(day.term) ? formatTermName(day.term, language) : day.termName)}</h1>
        <div className="mt-4 rounded-2xl border border-[#e0ddd5] bg-white p-4">
          {reminder.date && reminder.time ? <RegistrationCountdown date={reminder.date} time={reminder.time} language={language} large /> : <p className="text-xs text-[#646c68]">{t.noTime}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a href="https://app.testudo.umd.edu/" target="_blank" rel="noreferrer" className="rounded-lg bg-[#a34a39] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#8f3f30]">{t.testudo} ↗</a>
            <button type="button" onClick={() => void write("all", day.courses.map((course) => `${course.courseId} ${course.section}`).join("\n"))} className="rounded-lg bg-[#273c38] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1d302c]">{copied === "all" ? `✓ ${t.copied}` : t.copyAll}</button>
            <span className="text-xs text-[#5d6561]" aria-live="polite">{t.progress(day.done.length, day.courses.length)}</span>
          </div>
        </div>
        {failed && <p role="alert" className="mt-3 text-xs text-[#8c352c]">{t.copyFailed}</p>}
        <ol className="mt-4 space-y-3">{day.courses.map((course) => {
          const done = day.done.includes(course.courseId);
          return <li key={course.courseId} className={`rounded-2xl border p-4 ${done ? "border-[#cddbd1] bg-[#edf3ef]" : "border-[#e3e0d8] bg-white"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-sm text-[#48534f] ${done ? "line-through" : ""}`}>{course.title}{course.full && <span className="ml-2 rounded-full bg-[#f5e9e5] px-1.5 py-0.5 text-[10px] font-semibold text-[#8f4538] no-underline">{t.full}</span>}</p>
                <div className="mt-2 flex flex-wrap gap-2">{chip(`${course.courseId}:course`, course.courseId, true)}{chip(`${course.courseId}:section`, course.section, true)}</div>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-[#d9d6ce] bg-white px-3 py-2 text-sm font-medium text-[#273c38]"><input type="checkbox" checked={done} onChange={() => toggleDone(course.courseId)} className="h-4 w-4 accent-[#273c38]" />{t.registered}</label>
            </div>
            {!done && <div className="mt-3 border-t border-[#eeebe4] pt-2 text-xs text-[#5d6561]">{course.backups.length ? <><span>{t.backups}</span> <span className="mt-1 flex flex-wrap gap-1.5">{course.backups.map((backup) => <span key={backup.section} className="inline-flex items-center gap-1">{chip(`${course.courseId}:${backup.section}`, backup.section)}{backup.full && <span className="text-[10px] font-semibold text-[#8f4538]">{t.full}</span>}</span>)}</span></> : t.noBackups}</div>}
          </li>;
        })}</ol>
        {day.missing.length > 0 && <p className="mt-3 rounded-lg border border-[#e7c6bf] bg-[#fff0ec] px-3 py-2 text-xs text-[#8c352c]">{t.missing} {day.missing.join(", ")}</p>}
        <p className="mt-4 text-[11px] leading-5 text-[#646c68]">{t.confirm} {t.saved(when)}</p>
      </>}
    </div>
  </main>;
}
