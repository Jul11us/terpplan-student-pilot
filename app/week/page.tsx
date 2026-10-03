"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buildingFor, mapsUrl } from "@/lib/campus-walk";
import { classesOn, dayOf, readMyWeek, WEEK_DAYS, type MyWeek, type WeekClass } from "@/lib/my-week";
import { roomLabel } from "@/lib/room";
import { readSavedState, writeSavedState } from "@/lib/saved-state";

type Language = "en" | "zh";

const copy = {
  en: {
    title: "My week", plan: "Plan courses", today: "Today", week: "This week", noClasses: "No classes",
    now: "In class now", next: "Next class", inMinutes: "in {n} min", doneToday: "No more classes today.", freeToday: "No classes today.",
    map: "Map", saved: "{term} · saved {date}",
    empty: "No week saved yet. Build a schedule in TerpPlan, then tap “Use as my week” under the timetable.", emptyButton: "Build a schedule",
    unscheduled: "Online or time to be announced:",
    note: "Times and rooms are as they were when you saved. If a section changes, check Testudo and save your week again.",
    installTitle: "Keep it on your home screen",
    install: "iPhone (Safari): Share → Add to Home Screen. Android (Chrome): ⋮ → Add to Home screen or Install app. After one visit it opens without internet too.",
    days: { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" },
  },
  zh: {
    title: "我的一周", plan: "规划课程", today: "今天", week: "本周课表", noClasses: "没有课",
    now: "正在上课", next: "下一节课", inMinutes: "{n} 分钟后", doneToday: "今天的课都上完了。", freeToday: "今天没有课。",
    map: "地图", saved: "{term} · 保存于 {date}",
    empty: "还没有保存课表。先在 TerpPlan 排好课，再点课表下面的“设为我的一周”。", emptyButton: "去排课",
    unscheduled: "线上课程或时间待定：",
    note: "时间和教室是保存时的信息。如果班次有变化，请以 Testudo 为准，并重新保存。",
    installTitle: "放到手机主屏幕",
    install: "iPhone（Safari）：分享 → 添加到主屏幕。Android（Chrome）：⋮ → 添加到主屏幕或安装应用。打开过一次之后，没有网络也能打开。",
    days: { Mon: "周一", Tue: "周二", Wed: "周三", Thu: "周四", Fri: "周五", Sat: "周六", Sun: "周日" },
  },
} as const;

const clock = (value: number) => {
  const hour = Math.floor(value / 60), minute = value % 60;
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")}${hour < 12 ? "am" : "pm"}`;
};

function ClassRow({ item, language, highlight = false }: { item: WeekClass; language: Language; highlight?: boolean }) {
  const t = copy[language];
  const building = buildingFor(item.building);
  return <li className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 ${highlight ? "border-[#536d64] bg-[#edf3ef]" : "border-[#e7e4dc] bg-white"}`}>
    <div className="min-w-0 text-sm">
      <p className="font-semibold text-[#24312d]">{clock(item.start)}–{clock(item.end)}</p>
      <p className="mt-0.5 text-[#48534f]">{item.courseId}{item.kind ? ` · ${item.kind}` : ""} <span className="text-[#646c68]">· {item.courseTitle}</span></p>
      <p className="mt-0.5 text-xs text-[#5d6561]">{roomLabel(item.building, item.room, language)}{building ? ` · ${building.name}` : ""}</p>
    </div>
    {building && <a href={mapsUrl(building)} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg border border-[#d9d6ce] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#273c38] hover:bg-[#f7f5f0]">{t.map} ↗</a>}
  </li>;
}

export default function MyWeekPage() {
  const [language, setLanguage] = useState<Language>("en");
  const [week, setWeek] = useState<MyWeek | null | undefined>(undefined);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const load = window.setTimeout(() => {
      setLanguage(readSavedState().language ?? "en");
      setWeek(readMyWeek());
    }, 0);
    // "Next class" and "in N min" follow the clock.
    const tick = window.setInterval(() => setNow(new Date()), 30_000);
    return () => { window.clearTimeout(load); window.clearInterval(tick); };
  }, []);
  const t = copy[language];
  const switchLanguage = () => { const next = language === "en" ? "zh" : "en"; setLanguage(next); writeSavedState({ language: next }); };

  const today = dayOf(now);
  const minuteNow = now.getHours() * 60 + now.getMinutes();
  const todays = week ? classesOn(week, today) : [];
  const current = todays.find((item) => item.start <= minuteNow && minuteNow < item.end);
  const upcoming = todays.find((item) => item.start > minuteNow);
  const shownDays = WEEK_DAYS.filter((day) => (day !== "Sat" && day !== "Sun") || (week && classesOn(week, day).length));
  const savedDate = week?.savedAt ? new Date(week.savedAt).toLocaleDateString(language === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" }) : "";

  return <main className="min-h-screen bg-[#f5f3ef] text-[#202728]">
    <header className="border-b border-[#dedbd3] bg-[#fbfaf8]"><div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
      <Link href="/" className="flex items-center gap-2 font-semibold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#bd302f] font-serif text-white">T</span>TerpPlan</Link>
      <div className="flex items-center gap-2"><Link href="/" className="rounded-lg border border-[#d9d6ce] bg-white px-3 py-1.5 text-xs font-semibold text-[#273c38]">{t.plan}</Link><button type="button" onClick={switchLanguage} className="rounded-lg border border-[#dcd9d0] px-3 py-1.5 text-xs">{language === "en" ? "中文" : "English"}</button></div>
    </div></header>
    <div className="mx-auto max-w-2xl px-4 pb-12 pt-6">
      <h1 className="font-serif text-3xl">{t.title}</h1>
      {week && <p className="mt-1 text-xs text-[#5d6561]">{t.saved.replace("{term}", week.termName).replace("{date}", savedDate)}</p>}
      {week === null && <div className="mt-5 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5"><p className="text-sm leading-6 text-[#48534f]">{t.empty}</p><Link href="/" className="mt-3 inline-block rounded-lg bg-[#273c38] px-3 py-2 text-xs font-semibold text-white">{t.emptyButton}</Link></div>}
      {week && <>
        <section aria-label={t.today} className="mt-5 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#5d6561]">{t.today} · {t.days[today]}</h2>
          {current ? <p className="mt-2 text-sm font-semibold text-[#315c43]">{t.now}</p>
            : upcoming ? <p className="mt-2 text-sm font-semibold text-[#315c43]">{t.next} · {t.inMinutes.replace("{n}", String(upcoming.start - minuteNow))}</p>
            : <p className="mt-2 text-sm text-[#5d6561]">{todays.length ? t.doneToday : t.freeToday}</p>}
          {todays.length > 0 && <ul className="mt-3 space-y-2">{todays.map((item) => <ClassRow key={item.sectionId + item.start} item={item} language={language} highlight={item === (current ?? upcoming)} />)}</ul>}
        </section>
        <section aria-label={t.week} className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#5d6561]">{t.week}</h2>
          <div className="mt-2 space-y-4">{shownDays.map((day) => { const list = classesOn(week, day); return <div key={day}>
            <h3 className={`text-sm font-semibold ${day === today ? "text-[#a34a39]" : "text-[#24312d]"}`}>{t.days[day]}</h3>
            {list.length ? <ul className="mt-1.5 space-y-2">{list.map((item) => <ClassRow key={item.sectionId + item.start} item={item} language={language} />)}</ul> : <p className="mt-1 text-xs text-[#646c68]">{t.noClasses}</p>}
          </div>; })}</div>
        </section>
        {week.unscheduled.length > 0 && <p className="mt-4 text-xs text-[#5d6561]">{t.unscheduled} {week.unscheduled.join(", ")}</p>}
        <p className="mt-5 text-[11px] leading-5 text-[#646c68]">{t.note}</p>
      </>}
      <section className="mt-6 rounded-xl border border-[#e0ddd5] bg-white p-4"><h2 className="text-sm font-semibold">{t.installTitle}</h2><p className="mt-1 text-xs leading-5 text-[#5d6561]">{t.install}</p></section>
    </div>
  </main>;
}
