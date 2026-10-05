"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { dayNames, displayClock, minutes, WeeklyCalendar } from "@/app/components/schedule-planner";
import { isAsyncOnline } from "@/lib/meeting-time";
import type { BusyBlock } from "@/lib/personal-schedule";
import type { ScheduleOption, ScheduledSection } from "@/lib/planner";
import { roomLabel } from "@/lib/room";

type Language = "en" | "zh";

const copy = {
  en: {
    button: "Print / save as PDF", preparing: "Preparing…", withBackups: "Include backup sections",
    hint: "Opens your browser's print window; choose \"Save as PDF\" to keep a file.",
    title: "TerpPlan schedule", credits: "{n} credits", printed: "Printed {t}",
    course: "Course", section: "Section", times: "Meets", instructor: "Instructor", seats: "Seats", backups: "Backups if full (in order)",
    open: "{n} open", full: "Full", unknown: "—", none: "No other section fits", backupsFailed: "Backups could not be loaded",
    tba: "Time TBA", online: "Online, no set time",
    lecture: "Lecture", discussion: "Discussion", lab: "Lab",
    days: { Mon: "M", Tue: "Tu", Wed: "W", Thu: "Th", Fri: "F", Sat: "Sa", Sun: "Su" } as Record<string, string>,
    note: "Backups fit around every other class here (and your personal commitments). Seats and times change: confirm in Testudo when you register.",
  },
  zh: {
    button: "打印 / 存为 PDF", preparing: "正在准备…", withBackups: "附上备选班次",
    hint: "会打开浏览器的打印窗口；选“存储为 PDF”即可保存文件。",
    title: "TerpPlan 课表", credits: "{n} 学分", printed: "打印于 {t}",
    course: "课程", section: "班次", times: "上课时间", instructor: "老师", seats: "余位", backups: "满了就按顺序换（备选）",
    open: "空位 {n}", full: "已满", unknown: "—", none: "没有其他不冲突的班次", backupsFailed: "备选班次读取失败",
    tba: "时间待定", online: "线上，无固定时间",
    lecture: "讲课", discussion: "讨论课", lab: "实验课",
    days: { Mon: "一", Tue: "二", Wed: "三", Thu: "四", Fri: "五", Sat: "六", Sun: "日" } as Record<string, string>,
    note: "备选班次和这里的其他课（以及你的个人日程）都不冲突。余位和时间会变，注册时请以 Testudo 为准。",
  },
} as const;

type Backup = { section: ScheduledSection; full: boolean };
type Sheet = { backups: Record<string, Backup[] | null> | null };

const count = (value: string | number | null | undefined) => {
  const number = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : null;
  return number !== null && number >= 0 ? number : null;
};

function meetingLines(section: ScheduledSection, language: Language) {
  const t = copy[language];
  const lines = (section.meetings ?? []).map((meeting) => {
    const type = meeting.classtype?.trim().toLowerCase();
    const label = type === "discussion" ? t.discussion : type === "lab" ? t.lab : !type || type === "lecture" ? t.lecture : meeting.classtype;
    if (isAsyncOnline(meeting)) return `${label} · ${t.online}`;
    const start = minutes(meeting.start_time), end = minutes(meeting.end_time), days = dayNames(meeting.days);
    if (start === null || end === null || !days.length) return `${label} · ${t.tba}`;
    const dayText = days.map((day) => t.days[day] ?? day).join(language === "zh" ? "" : " ");
    return `${label} · ${language === "zh" ? "周" : ""}${dayText} ${displayClock(start)}–${displayClock(end)} · ${roomLabel(meeting.building, meeting.room, language)}`;
  });
  return lines.length ? lines : [t.tba];
}

function seatText(section: ScheduledSection, language: Language) {
  const t = copy[language], open = count(section.open_seats);
  return open === null ? t.unknown : open > 0 ? t.open.replace("{n}", String(open)) : t.full;
}

// Up to three other sections per course that fit with everything else chosen, from the same "change
// section" search the page uses (open sections first, then by score).
async function loadBackups(sections: ScheduledSection[], request: Record<string, unknown>) {
  const entries = await Promise.all(sections.map(async (section) => {
    try {
      const response = await fetch("/api/schedules/generate", { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ ...request, mode: "alternatives", replaceCourseId: section.course_id }) });
      if (!response.ok) return [section.course_id, null] as const;
      const payload = await response.json() as { options?: ScheduleOption[] };
      const backups = (payload.options ?? []).slice(0, 3).flatMap((option) => {
        const replacement = option.selectedSections.find((item) => item.course_id === section.course_id);
        return replacement ? [{ section: replacement, full: count(replacement.open_seats) === 0 }] : [];
      });
      return [section.course_id, backups] as const;
    } catch {
      return [section.course_id, null] as const;
    }
  }));
  return Object.fromEntries(entries);
}

// "Print / save as PDF": builds a print-only page (the week, then a table to register from) as a direct
// child of <body>, hides everything else while printing, and removes it again afterwards. Personal
// commitments appear without their names, since a printout is easily left lying around.
export function PrintSchedule({ option, busyBlocks, request, termName, language, canLoadBackups }: { option: ScheduleOption; busyBlocks: BusyBlock[]; request: Record<string, unknown>; termName: string; language: Language; canLoadBackups: boolean }) {
  const t = copy[language];
  const [withBackups, setWithBackups] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);

  useEffect(() => {
    if (!sheet) return;
    document.body.classList.add("printing-sheet");
    const done = () => { document.body.classList.remove("printing-sheet"); setSheet(null); };
    window.addEventListener("afterprint", done, { once: true });
    // Let the portal render before the print dialog takes its snapshot.
    const frame = window.requestAnimationFrame(() => window.setTimeout(() => window.print(), 50));
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("afterprint", done); document.body.classList.remove("printing-sheet"); };
  }, [sheet]);

  const start = async () => {
    setPreparing(true);
    const backups = withBackups && canLoadBackups ? await loadBackups(option.selectedSections, request) : null;
    setPreparing(false);
    setSheet({ backups });
  };

  const printedAt = new Date().toLocaleString(language === "zh" ? "zh-CN" : "en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const anonymous = busyBlocks.map((block) => ({ ...block, label: "" }));

  return <>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void start()} disabled={preparing} className="rounded-lg border border-[#273c38] px-3 py-2 text-xs font-semibold text-[#273c38] hover:bg-[#edf3ef] disabled:opacity-60">{preparing ? t.preparing : t.button}</button>
      {canLoadBackups && <label className="inline-flex items-center gap-1.5 text-xs text-[#5d6561]"><input type="checkbox" checked={withBackups} onChange={(event) => setWithBackups(event.target.checked)} />{t.withBackups}</label>}
      <p className="w-full text-[11px] leading-5 text-[#646c68] sm:w-auto sm:min-w-0 sm:flex-1">{t.hint}</p>
    </div>
    {sheet && createPortal(<div id="print-sheet" lang={language === "zh" ? "zh-CN" : "en"} className="bg-white p-0 text-[#202728]">
      <header className="mb-3 flex items-baseline justify-between gap-4 border-b border-[#202728] pb-2">
        <h1 className="font-serif text-xl">{t.title} · {termName}</h1>
        <p className="text-xs">{option.totalCredits ? t.credits.replace("{n}", String(option.totalCredits)) + " · " : ""}{t.printed.replace("{t}", printedAt)} ET</p>
      </header>
      <div className="print-calendar"><WeeklyCalendar sections={option.selectedSections} language={language} busyBlocks={anonymous} /></div>
      <table className="print-table mt-4 w-full border-collapse text-[11px] leading-4">
        <thead><tr className="border-b border-[#202728] text-left">
          <th className="py-1 pr-2">{t.course}</th><th className="py-1 pr-2">{t.section}</th><th className="py-1 pr-2">{t.times}</th><th className="py-1 pr-2">{t.instructor}</th><th className="py-1 pr-2">{t.seats}</th>{sheet.backups && <th className="py-1">{t.backups}</th>}
        </tr></thead>
        <tbody>{option.selectedSections.map((section) => {
          const backups = sheet.backups?.[section.course_id];
          return <tr key={section.section_id} className="border-b border-[#d9d6ce] align-top">
            <td className="py-1.5 pr-2"><strong>{section.course_id}</strong><br /><span className="text-[#48534f]">{section.course_title}</span>{section.credits ? <><br />{t.credits.replace("{n}", String(section.credits))}</> : null}</td>
            <td className="py-1.5 pr-2 font-mono text-[13px] font-bold">{section.section_id.slice(section.course_id.length + 1)}</td>
            <td className="py-1.5 pr-2">{meetingLines(section, language).map((line, index) => <div key={index}>{line}</div>)}</td>
            <td className="py-1.5 pr-2">{(section.instructors ?? []).join(", ") || "—"}</td>
            <td className="py-1.5 pr-2">{seatText(section, language)}</td>
            {sheet.backups && <td className="py-1.5">{backups === null || backups === undefined ? <span className="text-[#745424]">{t.backupsFailed}</span> : backups.length ? <ol className="list-decimal pl-4">{backups.map(({ section: backup }) => <li key={backup.section_id}><strong className="font-mono">{backup.section_id.slice(backup.course_id.length + 1)}</strong> · {seatText(backup, language)}<div className="text-[#48534f]">{meetingLines(backup, language).join("; ")}</div></li>)}</ol> : <span className="text-[#48534f]">{t.none}</span>}</td>}
          </tr>;
        })}</tbody>
      </table>
      <p className="mt-3 text-[10px] text-[#48534f]">{t.note}</p>
    </div>, document.body)}
  </>;
}
