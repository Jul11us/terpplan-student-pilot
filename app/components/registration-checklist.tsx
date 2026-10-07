"use client";

import { useState } from "react";
import { buildReminderIcs } from "@/lib/ics";
import { storageKey } from "@/lib/demo";

// The registration date and time the student typed, by term name, so it is there next time.
const REMINDER_KEY = "terpplan:registration-time";
function savedReminder(termName: string): { date: string; time: string } {
  try {
    const value = (JSON.parse(window.localStorage.getItem(storageKey(REMINDER_KEY)) ?? "{}") as Record<string, { date?: unknown; time?: unknown }>)[termName];
    return { date: typeof value?.date === "string" ? value.date : "", time: typeof value?.time === "string" ? value.time : "" };
  } catch {
    return { date: "", time: "" };
  }
}

type Language = "en" | "zh";
type ChecklistSection = { course_id: string; course_title: string; section_id: string; open_seats?: string | number | null };
type ChecklistOption = { selectedSections: ChecklistSection[] };

const REGISTRAR = "https://registrar.umd.edu/registration/register-classes";
// Official pages only: TerpPlan does not describe Testudo's screens, which can change.
const LINKS = {
  steps: `${REGISTRAR}/steps-register`,
  blocks: `${REGISTRAR}/blocks-special-permissions-exceptions-policy`,
  waitlist: `${REGISTRAR}/waitlist-hold-file`,
};

const copy = {
  en: {
    title: "Registration checklist",
    intro: "The course and section numbers for this option, ready to enter when you register in Testudo.",
    course: "Course", section: "Section", copy: "Copy", copied: "Copied", copyAll: "Copy all", full: "Full",
    backups: "Backup sections from the other options",
    before: "Before your registration time",
    tips: [
      ["Check your registration date and time and follow the official steps to register.", "steps", "Steps to register"],
      ["Clear any registration block ahead of time; blocks can stop you from registering.", "blocks", "Blocks & permissions"],
      ["If a section is full, a waitlist or hold file may be available.", "waitlist", "Waitlist & hold file"],
    ],
    confirm: "Seat counts can lag. Confirm every section in Testudo when you register.",
    copyFailed: "Copy failed. Select the text and copy it manually.",
    missing: "Not in this checklist because they could not be placed:",
    reminderTitle: "Remind me at my registration time",
    reminderIntro: "Look up your registration date and time in Testudo and enter it here. The calendar file alerts you a day before and 15 minutes before, with these course and section numbers.",
    reminderDate: "Date", reminderTime: "Time (Eastern)", reminderButton: "Add to calendar (.ics)",
    reminderDone: "Downloaded. Open the file to add it to your calendar.",
    reminderSummary: "Register for classes · {term}", reminderBody: "Your TerpPlan course and section numbers:", reminderBackups: "Backups:",
    reminderBlocks: "Clear any registration block before this time:",
  },
  zh: {
    title: "选课清单",
    intro: "这个方案的课程号和班号，注册时可以直接对照填写。",
    course: "课程", section: "班号", copy: "复制", copied: "已复制", copyAll: "全部复制", full: "已满",
    backups: "其他方案里的备选班次",
    before: "注册之前",
    tips: [
      ["确认自己的注册日期和时间，并按官方步骤操作。", "steps", "官方选课步骤"],
      ["提前处理选课限制（block），否则可能无法注册。", "blocks", "选课限制与特别许可"],
      ["班次已满时，可能可以加入候补（waitlist / hold file）。", "waitlist", "候补说明"],
    ],
    confirm: "余位数据可能有延迟，注册时请在 Testudo 中确认每个班次。",
    copyFailed: "复制失败，请手动选中文字复制。",
    missing: "这些课没能排进方案，所以不在清单里：",
    reminderTitle: "注册时间提醒",
    reminderIntro: "在 Testudo 查到自己的注册日期和时间后填在这里。日历文件会在前一天和前 15 分钟提醒你，并附上这些课号和班号。",
    reminderDate: "日期", reminderTime: "时间（美东）", reminderButton: "加入日历（.ics）",
    reminderDone: "已下载，打开文件即可加入日历。",
    reminderSummary: "选课注册 · {term}", reminderBody: "TerpPlan 选课清单（课号 班号）：", reminderBackups: "备选班次：",
    reminderBlocks: "注册前先处理选课限制（block）：",
  },
} as const;

const sectionNumber = (section: ChecklistSection) => section.section_id.slice(section.course_id.length + 1) || section.section_id;
const isFull = (section: ChecklistSection) => section.open_seats !== null && section.open_seats !== undefined && section.open_seats !== "" && Number(section.open_seats) === 0;

export default function RegistrationChecklist({ option, others, missingCourseIds = [], language, termName = "" }: { option: ChecklistOption; others: ChecklistOption[]; missingCourseIds?: string[]; language: Language; termName?: string }) {
  const t = copy[language];
  const [reminder, setReminder] = useState(() => typeof window === "undefined" ? { date: "", time: "" } : savedReminder(termName));
  const [reminderDone, setReminderDone] = useState(false);
  const changeReminder = (patch: Partial<typeof reminder>) => {
    const next = { ...reminder, ...patch };
    setReminder(next); setReminderDone(false);
    try {
      const all = JSON.parse(window.localStorage.getItem(storageKey(REMINDER_KEY)) ?? "{}") as Record<string, unknown>;
      window.localStorage.setItem(storageKey(REMINDER_KEY), JSON.stringify({ ...all, [termName]: next }));
    } catch { /* not remembered; the download still works */ }
  };
  const [copied, setCopied] = useState("");
  const [failed, setFailed] = useState(false);

  const write = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key); setFailed(false);
      window.setTimeout(() => setCopied((current) => current === key ? "" : current), 1500);
    } catch {
      setFailed(true);
    }
  };

  const chosenIds = new Set(option.selectedSections.map((section) => section.section_id));
  const backups = [...new Map(others.flatMap((other) => other.selectedSections)
    .filter((section) => !chosenIds.has(section.section_id))
    .map((section) => [section.section_id, section])).values()];
  const allText = option.selectedSections.map((section) => `${section.course_id} ${sectionNumber(section)}`).join("\n");
  const downloadReminder = () => {
    const description = [
      t.reminderBody, allText,
      ...(backups.length ? ["", t.reminderBackups, backups.map((section) => `${section.course_id} ${sectionNumber(section)}`).join(", ")] : []),
      "", t.reminderBlocks, LINKS.blocks, "", "Testudo: https://app.testudo.umd.edu/",
    ].join("\n");
    const ics = buildReminderIcs(reminder, { summary: t.reminderSummary.replace("{term}", termName), description, url: "https://app.testudo.umd.edu/" });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `terpplan-registration-${reminder.date}.ics`;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setReminderDone(true);
  };
  const chip = (key: string, text: string) => <button type="button" onClick={() => void write(key, text)} title={t.copy} className="rounded-md border border-[#dedbd3] bg-[#fbfaf8] px-2 py-1 font-mono text-xs font-semibold text-[#24312d] hover:bg-white">{copied === key ? `✓ ${t.copied}` : text}</button>;

  return <section className="mt-6 rounded-xl border border-[#cddbd1] bg-[#f4f8f5] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h4 className="font-semibold">{t.title}</h4><p className="mt-1 text-xs leading-5 text-[#59635f]">{t.intro}</p></div>
      <button type="button" onClick={() => void write("all", allText)} className="rounded-lg bg-[#273c38] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d302c]">{copied === "all" ? `✓ ${t.copied}` : t.copyAll}</button>
    </div>
    {missingCourseIds.length > 0 && <p role="alert" className="mt-3 rounded-lg border border-[#e7c6bf] bg-[#fff0ec] px-3 py-2 text-xs font-medium text-[#8c352c]">{t.missing} {missingCourseIds.join(", ")}</p>}
    <div className="mt-3 overflow-hidden rounded-lg border border-[#dfe7e1] bg-white">
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-[#eef2ef] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#646c68]"><span /><span>{t.course}</span><span>{t.section}</span></div>
      {option.selectedSections.map((section) => <div key={section.section_id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-[#eef2ef] px-3 py-2 last:border-b-0">
        <span className="min-w-0 text-xs leading-5 text-[#59635f]">{section.course_title}{isFull(section) && <span className="ml-2 rounded-full bg-[#f5e9e5] px-1.5 py-0.5 text-[10px] font-semibold text-[#8f4538]">{t.full}</span>}</span>
        {chip(`${section.section_id}:course`, section.course_id)}
        {chip(`${section.section_id}:section`, sectionNumber(section))}
      </div>)}
    </div>
    {backups.length > 0 && <div className="mt-3"><p className="text-xs font-medium text-[#48534f]">{t.backups}</p><div className="mt-1.5 flex flex-wrap gap-2">{backups.map((section) => <span key={section.section_id}>{chip(`${section.section_id}:backup`, `${section.course_id} ${sectionNumber(section)}`)}</span>)}</div></div>}
    <p className="mt-4 text-xs font-medium text-[#48534f]">{t.before}</p>
    <ul className="mt-1.5 space-y-1 text-xs leading-5 text-[#59635f]">{t.tips.map(([text, link, label]) => <li key={link}>• {text} <a href={LINKS[link]} target="_blank" rel="noreferrer" className="font-medium text-[#a34a39] underline underline-offset-2">{label} ↗</a></li>)}</ul>
    <div className="mt-4 rounded-lg border border-[#dfe7e1] bg-white p-3">
      <p className="text-xs font-medium text-[#48534f]">{t.reminderTitle}</p>
      <p className="mt-1 text-[11px] leading-5 text-[#646c68]">{t.reminderIntro}</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-[#5d6561]">{t.reminderDate}<input type="date" value={reminder.date} onChange={(event) => changeReminder({ date: event.target.value })} className="mt-1 block rounded-lg border border-[#dedbd3] px-2 py-1.5 text-xs text-[#24312d]" /></label>
        <label className="text-[11px] text-[#5d6561]">{t.reminderTime}<input type="time" value={reminder.time} onChange={(event) => changeReminder({ time: event.target.value })} className="mt-1 block rounded-lg border border-[#dedbd3] px-2 py-1.5 text-xs text-[#24312d]" /></label>
        <button type="button" onClick={downloadReminder} disabled={!reminder.date || !reminder.time} className="rounded-lg bg-[#273c38] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d302c] disabled:cursor-not-allowed disabled:opacity-50">{t.reminderButton}</button>
      </div>
      {reminderDone && <p role="status" className="mt-2 text-[11px] text-[#367047]">✓ {t.reminderDone}</p>}
    </div>
    <p className="mt-3 text-[11px] leading-5 text-[#646c68]">{t.confirm}</p>
    {failed && <p role="alert" className="mt-2 text-xs text-[#8c352c]">{t.copyFailed}</p>}
  </section>;
}
