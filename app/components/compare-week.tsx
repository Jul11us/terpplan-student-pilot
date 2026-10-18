"use client";

// On a shared schedule (app/share): the viewer's own My week for that term beside it, day by day, with the times
// gaps in their known class times and the timed classes they share. The comparison happens in the browser.

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { compareWeeks, FREE_FROM, FREE_TO, MIN_FREE } from "@/lib/compare-week";
import type { MyWeek, WeekClass } from "@/lib/my-week";
import { countUse } from "@/lib/usage";

type Language = "en" | "zh";

const copy = {
  en: {
    title: "Compare with my week", you: "You", them: "This schedule", both: "Class gap", together: "Together",
    freeTitle: `Gaps in both listed timetables (8am–8pm, ${MIN_FREE} minutes or more)`, dayOff: "No timed classes listed in either timetable", noFree: "No gaps in the listed class times",
    scope: "Based on known class meeting times only. TBA or missing meetings, asynchronous work and personal commitments are excluded; these gaps may not be free time.",
    same: "In the same section: {list}", sameCourse: "Same course, different sections: {list}", sameCourseItem: "{course} (you {mine}, them {theirs})", none: "No timed classes in common.",
    needWeek: "To compare gaps in listed class times, save your own {term} schedule as My week: build it in the planner and tap “Use as my week”, or import it from Testudo. Then open this link again.",
    plan: "Plan my schedule", importLink: "Import from Testudo",
    saved: "Your My week for {term}, saved {date}.", privacy: "This comparison is calculated in your browser.",
    days: { Mon: "Mon", Tue: "Tue", Wed: "Wed", Thu: "Thu", Fri: "Fri", Sat: "Sat", Sun: "Sun" } as Record<string, string>,
  },
  zh: {
    title: "和我的课表对比", you: "我", them: "TA", both: "课表空档", together: "同一个班",
    freeTitle: `两份已知课表的空档（早 8 点到晚 8 点，至少 ${MIN_FREE} 分钟）`, dayOff: "两份课表这天都未列出固定上课时间", noFree: "已列出的上课时间之间没有共同空档",
    scope: "仅按已知上课时间计算，不包括时间待定或缺失的课程、异步作业和个人日程；课表空档不一定是空闲时间。",
    same: "同一个班：{list}", sameCourse: "同一门课、不同班：{list}", sameCourseItem: "{course}（你 {mine}，TA {theirs}）", none: "已知固定时间的课程中没有相同的课。",
    needWeek: "要对比已知课表的空档，先把你自己 {term}的课表存为“我的一周”：在排课页排好后点“设为我的一周”，或者从 Testudo 导入，然后再打开这个链接。",
    plan: "去排课", importLink: "从 Testudo 导入",
    saved: "你 {term}的“我的一周”，保存于 {date}。", privacy: "课表对比在这个浏览器里计算。",
    days: { Mon: "周一", Tue: "周二", Wed: "周三", Thu: "周四", Fri: "周五", Sat: "周六", Sun: "周日" } as Record<string, string>,
  },
} as const;

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
const clock = (value: number) => {
  const hour = Math.floor(value / 60), minute = value % 60;
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")}${hour < 12 ? "am" : "pm"}`;
};
const sectionNumber = (id: string) => id.split("-")[1] ?? id;

// Course colours on the grid: the viewer's classes sage, the shared schedule's slate.
const MINE = { fill: "#e2eee6", line: "#9cc0aa", text: "#21493a" };
const THEIRS = { fill: "#e4e9f3", line: "#a3b3cf", text: "#24395e" };
const HOUR = 34;

export function CompareWeek({ mine, theirs, termName, language }: { mine: MyWeek | null; theirs: WeekClass[]; termName: string; language: Language }) {
  const t = copy[language];
  const result = useMemo(() => mine ? compareWeeks(mine.classes, theirs) : null, [mine, theirs]);
  // Counted once a day per browser, for the owner's usage numbers (lib/usage.ts).
  useEffect(() => { if (result) countUse("compare"); }, [result]);
  if (!mine || !result) return <section className="mt-6 rounded-2xl border border-dashed border-[#cddbd1] bg-[#f4f8f5] p-5 sm:p-6">
    <h2 className="font-serif text-2xl">{t.title}</h2>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-[#48534f]">{fill(t.needWeek, { term: termName })}</p>
    <div className="mt-3 flex flex-wrap gap-2"><Link href="/plan" className="rounded-lg bg-[#273c38] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d302c]">{t.plan}</Link><Link href="/plan#import" className="rounded-lg border border-[#536d64] bg-white px-3 py-2 text-xs font-semibold text-[#273c38] hover:bg-[#edf3ef]">{t.importLink}</Link></div>
    <p className="mt-3 text-[11px] text-[#646c68]">{t.privacy}</p>
  </section>;

  const all = [...mine.classes, ...theirs];
  const from = Math.min(FREE_FROM, ...all.map((item) => Math.floor(item.start / 60) * 60));
  const to = Math.max(FREE_TO, ...all.map((item) => Math.ceil(item.end / 60) * 60));
  const hours = Array.from({ length: (to - from) / 60 }, (_, index) => from + index * 60);
  const y = (minute: number) => ((minute - from) / 60) * HOUR;
  const shared = new Set(result.sameSections);
  const savedDate = mine.savedAt ? new Date(mine.savedAt).toLocaleDateString(language === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" }) : "";
  const separator = language === "zh" ? "、" : ", ";
  const block = (item: WeekClass, tone: typeof MINE) => <div key={`${item.sectionId}-${item.start}-${item.days.join("")}`} title={`${item.courseId} ${clock(item.start)}–${clock(item.end)}`}
    className={`absolute inset-x-0.5 overflow-hidden rounded-[5px] border-l-[3px] px-0.5 py-0.5 text-[9.5px] font-semibold leading-tight sm:px-1 ${shared.has(item.sectionId) ? "ring-1 ring-[#a34a39]" : ""}`}
    style={{ top: y(item.start), height: Math.max(14, y(item.end) - y(item.start) - 2), backgroundColor: tone.fill, borderLeftColor: tone.line, color: tone.text }}>
    {/* A phone's lanes fit the course number only; the list below and the tooltip name the course. */}
    <span className="sm:hidden">{item.courseId.slice(4)}</span><span className="hidden sm:inline">{item.courseId}</span>
  </div>;

  return <section className="mt-6 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5 sm:p-8">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h2 className="font-serif text-2xl">{t.title}</h2>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#48534f]">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-l-[3px]" style={{ backgroundColor: MINE.fill, borderLeftColor: MINE.line }} />{t.you}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-l-[3px]" style={{ backgroundColor: THEIRS.fill, borderLeftColor: THEIRS.line }} />{t.them}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-[#e3f0e7]" />{t.both}</span>
        {result.sameSections.length > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-white ring-1 ring-[#a34a39]" />{t.together}</span>}
      </div>
    </div>
    <p className="mt-1 text-xs text-[#5d6561]">{fill(t.saved, { term: termName, date: savedDate })}</p>

    <div className="mt-4 grid gap-x-1 sm:gap-x-1.5" style={{ gridTemplateColumns: `30px repeat(${result.days.length}, minmax(0, 1fr))` }}>
      <span />
      {result.days.map((day) => <p key={day} className="pb-1.5 text-center text-xs font-semibold text-[#24312d]">{t.days[day]}</p>)}
      <div className="relative" style={{ height: y(to) }}>{hours.map((hour) => <span key={hour} className="absolute right-1 -translate-y-1/2 text-[9px] tabular-nums text-[#7a817d] sm:text-[9.5px]" style={{ top: y(hour) }}>{clock(hour).replace(":00", "")}</span>)}</div>
      {result.days.map((day) => <div key={day} className="relative rounded-lg bg-white" style={{ height: y(to) }}>
        {hours.map((hour) => <span key={hour} aria-hidden="true" className="absolute inset-x-0 border-t border-[#f0ede6]" style={{ top: y(hour) }} />)}
        {result.free[day]!.map((slot) => <div key={slot.start} className="absolute inset-x-0 rounded-md bg-[#e3f0e7]" style={{ top: y(slot.start) + 1, height: y(slot.end) - y(slot.start) - 2 }}>
          {slot.end - slot.start >= 60 && <span className="block truncate px-1 pt-0.5 text-[9px] font-semibold text-[#3d6b4f]">{t.both}</span>}
        </div>)}
        <div className="absolute inset-y-0 left-0 w-1/2">{mine.classes.filter((item) => item.days.includes(day)).map((item) => block(item, MINE))}</div>
        <div className="absolute inset-y-0 right-0 w-1/2">{theirs.filter((item) => item.days.includes(day)).map((item) => block(item, THEIRS))}</div>
      </div>)}
    </div>

    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div>
        <h3 className="text-sm font-semibold text-[#24312d]">{t.freeTitle}</h3>
        <p className="mt-1 text-[11px] leading-5 text-[#646c68]">{t.scope}</p>
        <ul className="mt-2 space-y-1.5">{result.days.map((day) => <li key={day} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
          <span className="w-9 shrink-0 font-semibold text-[#48534f]">{t.days[day]}</span>
          {result.bothOff.includes(day) ? <span className="text-[#315c43]">{t.dayOff}</span>
            : result.free[day]!.length ? result.free[day]!.map((slot) => <span key={slot.start} className="rounded-full border border-[#cddbd1] bg-[#f1f8f3] px-2 py-0.5 tabular-nums text-[#315c43]">{clock(slot.start)}–{clock(slot.end)}</span>)
            : <span className="text-[#646c68]">{t.noFree}</span>}
        </li>)}</ul>
      </div>
      <div className="text-xs leading-5 text-[#48534f]">
        {result.sameSections.length > 0 && <p>{fill(t.same, { list: result.sameSections.join(separator) })}</p>}
        {result.sameCourses.length > 0 && <p className={result.sameSections.length ? "mt-1" : ""}>{fill(t.sameCourse, { list: result.sameCourses.map((item) => fill(t.sameCourseItem, { course: item.courseId, mine: item.mine.map(sectionNumber).join("/"), theirs: item.theirs.map(sectionNumber).join("/") })).join(separator) })}</p>}
        {!result.sameSections.length && !result.sameCourses.length && <p className="text-[#646c68]">{t.none}</p>}
        <p className="mt-3 text-[11px] text-[#646c68]">{t.privacy}</p>
      </div>
    </div>
  </section>;
}
