"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useDocumentLanguage } from "@/lib/document-language";
import { readSavedState, writeSavedState } from "@/lib/saved-state";
import { formatTermName } from "@/lib/seat-trends";
import { mapsUrl, type Building } from "@/lib/campus-walk";
import { buildingsAt, clockLabel, easternClock, NO_CLASSES_DAY, termDay, walkMinutesFrom, type Position, type Room, type RoomStatus } from "@/lib/rooms";
import type { TermCalendar } from "@/lib/term-calendar";
import { countUse } from "@/lib/usage";

type Language = "en" | "zh";
const BUILDINGS_SHOWN = 10;
const ROOMS_SHOWN = 6;
const PICK_TIMES = Array.from({ length: 31 }, (_, index) => 7 * 60 + index * 30);

const copy = {
  en: {
    home: "Back to planner", eyebrow: (term: string) => `College Park · ${term} class schedule`, title: "Find an empty classroom",
    intro: "Classrooms with no class scheduled, how long until the next one, and which are closest to you. Good for studying between classes.",
    now: "Now", pick: "Pick a time", day: "Day", time: "Time",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    search: "Search a building (name or code)", minFree: "Free for",
    minFreeOptions: [[0, "Any time"], [30, "30 min or more"], [60, "1 hour or more"], [120, "2 hours or more"]] as Array<[number, string]>,
    near: "Sort by distance from me", locating: "Finding you…", nearOn: "Nearest first", nearOff: "Stop sorting by distance",
    locationFailed: "Your location could not be read. Allow location for this site, or search a building instead.",
    summary: (rooms: number, buildings: number) => `${rooms} rooms in ${buildings} buildings have no class`,
    at: (time: string) => `at ${time}`,
    walk: (minutes: number) => `~${minutes} min walk`, counts: (free: number, busy: number) => `${free} free · ${busy} in class`,
    map: "Map", freeUntil: (time: string) => `free until ${time}`, restOfDay: "no more classes today", left: (text: string) => `${text} left`,
    seats: (n: number) => `about ${n} seats`, rare: "rarely booked, may be locked",
    showRooms: (n: number) => `Show all ${n} rooms`, fewerRooms: "Show fewer", moreBuildings: "Show more buildings",
    none: "No room matches. Try a shorter free time or another building.",
    weekend: "It's the weekend: most academic buildings are locked or have short hours.",
    late: "Outside usual building hours: many buildings may be locked.",
    noClasses: "No classes meet today (a break or holiday), so every room shows as free, but buildings may be closed.",
    outside: "The term's classes are not meeting now; these rooms follow the weekly class schedule.",
    how: "How this works",
    howBody: "Built from this term's class times in Testudo: every room that hosts a class, and when. A room listed here has no class at that time, which is not a promise it is open: rooms are also used for exams, review sessions and events, and some stay locked outside class hours. Rooms under 10 seats and buildings outside College Park are left out.",
    updated: (date: string) => `Class schedule read ${date}.`,
    hours: (h: number, m: number) => m ? `${h} h ${m} min` : `${h} h`, minutes: (m: number) => `${m} min`,
  },
  zh: {
    home: "返回排课", eyebrow: (term: string) => `College Park · ${term}课表`, title: "找空教室",
    intro: "这个时段没有排课的教室、能空到几点，以及离你最近的是哪些。适合课间找地方自习。",
    now: "现在", pick: "选时间", day: "星期", time: "时间",
    days: ["周一", "周二", "周三", "周四", "周五"],
    search: "搜索楼名或代码", minFree: "至少空",
    minFreeOptions: [[0, "不限"], [30, "30 分钟以上"], [60, "1 小时以上"], [120, "2 小时以上"]] as Array<[number, string]>,
    near: "按离我远近排序", locating: "正在定位…", nearOn: "已按距离排序", nearOff: "取消按距离排序",
    locationFailed: "读取不到你的位置。请允许本网站使用定位，或者直接搜索楼名。",
    summary: (rooms: number, buildings: number) => `${buildings} 栋楼共 ${rooms} 间教室没有排课`,
    at: (time: string) => `（${time}）`,
    walk: (minutes: number) => `步行约 ${minutes} 分钟`, counts: (free: number, busy: number) => `${free} 间空 · ${busy} 间在上课`,
    map: "地图", freeUntil: (time: string) => `空到 ${time}`, restOfDay: "今天没有课了", left: (text: string) => `还有 ${text}`,
    seats: (n: number) => `约 ${n} 座`, rare: "很少排课，可能上锁",
    showRooms: (n: number) => `显示全部 ${n} 间`, fewerRooms: "收起", moreBuildings: "显示更多楼",
    none: "没有符合条件的教室。试试缩短空闲时间，或换一栋楼。",
    weekend: "今天是周末：大部分教学楼不开门或开放时间很短。",
    late: "现在不在一般的开楼时间，很多楼可能已经锁门。",
    noClasses: "今天没有课（放假或节假日），所以所有教室都显示为空，但楼可能不开门。",
    outside: "现在不在本学期上课期间，下面按每周课表显示。",
    how: "怎么算的",
    howBody: "根据 Testudo 上本学期的上课时间：每间有课的教室、在什么时候上课。这里列出的教室只表示这个时段没有排课，不保证开着门：教室也会用来考试、习题课和办活动，有些课后会上锁。少于 10 个座位的房间和不在 College Park 校园内的楼不计入。",
    updated: (date: string) => `课表读取于 ${date}。`,
    hours: (h: number, m: number) => m ? `${h} 小时 ${m} 分` : `${h} 小时`, minutes: (m: number) => `${m} 分钟`,
  },
} as const;

export function RoomsFinder({ rooms, buildings, term, calendar, builtAt }: { rooms: Room[]; buildings: Record<string, Building>; term: string; calendar: TermCalendar | null; builtAt: string }) {
  const [language, setLanguage] = useState<Language>("en");
  useDocumentLanguage(language);
  // The clock is read after the first render, so the server and client HTML match.
  const [clock, setClock] = useState<ReturnType<typeof easternClock> | null>(null);
  const [mode, setMode] = useState<"now" | "pick">("now");
  const [pickDay, setPickDay] = useState(0);
  const [pickMinute, setPickMinute] = useState(10 * 60);
  const [minFree, setMinFree] = useState(30);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationFailed, setLocationFailed] = useState(false);
  const [buildingsShown, setBuildingsShown] = useState(BUILDINGS_SHOWN);
  const [expanded, setExpanded] = useState<string[]>([]);
  const t = copy[language];

  useEffect(() => {
    countUse("rooms");
    const saved = readSavedState().language;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (saved === "en" || saved === "zh") setLanguage(saved);
    const now = easternClock();
    setClock(now);
    // "Pick a time" starts on today (a weekday) at the next half hour.
    setPickDay(now.day <= 4 ? now.day : 0);
    setPickMinute(Math.min(22 * 60, Math.max(7 * 60, Math.ceil(now.minute / 30) * 30)));
    /* eslint-enable react-hooks/set-state-in-effect */
    const timer = window.setInterval(() => setClock(easternClock()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const day = mode === "now" ? clock?.day ?? 0 : pickDay;
  // On a break or holiday no class meets, so "now" lists every room as free (as the note above the list says).
  const holiday = mode === "now" && clock !== null && termDay(calendar, clock.date) === "noClasses";
  const minute = mode === "now" ? clock?.minute ?? 0 : pickMinute;
  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = needle ? rooms.filter((room) => room.building.toLowerCase().includes(needle) || (buildings[room.building]?.name ?? "").toLowerCase().includes(needle)) : rooms;
    return buildingsAt(matching, holiday ? NO_CLASSES_DAY : day, minute, { minFree, position, buildings });
  }, [rooms, buildings, query, day, holiday, minute, minFree, position]);
  const freeRooms = list.reduce((sum, entry) => sum + entry.free.length, 0);

  const duration = (minutes: number) => minutes < 60 ? t.minutes(minutes) : t.hours(Math.floor(minutes / 60), minutes % 60);
  const status = (item: RoomStatus) => item.until === null ? t.restOfDay : `${t.freeUntil(clockLabel(item.until, language))} · ${t.left(duration(item.until - minute))}`;
  const notes = [
    holiday ? t.noClasses : null,
    mode === "now" && clock && ["beforeTerm", "afterTerm"].includes(termDay(calendar, clock.date)) ? t.outside : null,
    day >= 5 ? t.weekend : minute < 7 * 60 || minute >= 22 * 60 ? t.late : null,
  ].filter(Boolean) as string[];

  const locate = () => {
    if (position) { setPosition(null); return; }
    setLocating(true); setLocationFailed(false);
    navigator.geolocation.getCurrentPosition(
      (found) => { setPosition({ lat: found.coords.latitude, lng: found.coords.longitude }); setLocating(false); setBuildingsShown(BUILDINGS_SHOWN); },
      () => { setLocationFailed(true); setLocating(false); },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };
  const control = "rounded-lg border border-[#d9d6ce] bg-white px-3 py-2 text-sm outline-none focus:border-[#a34a39] focus:ring-2 focus:ring-[#a34a39]/30";
  const segment = (active: boolean) => `rounded-md px-3 py-1.5 text-xs font-semibold ${active ? "bg-[#273c38] text-white" : "text-[#48534f] hover:bg-white"}`;

  return <main className="min-h-screen bg-[#f5f3ef] text-[#202728]">
    <header className="border-b border-[#dedbd3] bg-[#fbfaf8]"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4 sm:px-8"><Link href="/" className="flex items-center gap-3 font-semibold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#bd302f] font-serif text-lg text-white">T</span>TerpPlan</Link><div className="flex items-center gap-3"><Link href="/plan" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#d9d6ce] bg-white px-3 py-1.5 text-xs font-semibold text-[#273c38] shadow-sm hover:border-[#536d64] hover:bg-[#edf3ef]"><span aria-hidden="true">←</span><span className="sm:hidden">{language === "en" ? "Planner" : "排课"}</span><span className="hidden sm:inline">{t.home}</span></Link><button type="button" onClick={() => { const next = language === "en" ? "zh" : "en"; setLanguage(next); writeSavedState({ language: next }); }} className="whitespace-nowrap rounded-lg border border-[#dcd9d0] px-3 py-2 text-xs">{language === "en" ? "中文" : "English"}</button></div></div></header>
    <div className="mx-auto max-w-5xl px-5 pb-16 pt-10 sm:px-8">
      <p className="text-[11px] font-semibold uppercase tracking-[.17em] text-[#a34a39]">{t.eyebrow(formatTermName(term, language))}</p>
      <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-tight sm:text-5xl">{t.title}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-[#5d6561]">{t.intro}</p>

      <section className="mt-8 space-y-3 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div role="radiogroup" className="inline-flex rounded-lg bg-[#efece6] p-1">
            <button type="button" role="radio" aria-checked={mode === "now"} onClick={() => setMode("now")} className={segment(mode === "now")}>{t.now}{clock && mode === "now" ? ` · ${clockLabel(clock.minute, language)}` : ""}</button>
            <button type="button" role="radio" aria-checked={mode === "pick"} onClick={() => setMode("pick")} className={segment(mode === "pick")}>{t.pick}</button>
          </div>
          {mode === "pick" && <>
            <select aria-label={t.day} value={pickDay} onChange={(event) => setPickDay(Number(event.target.value))} className={control}>{t.days.map((name, index) => <option key={name} value={index}>{name}</option>)}</select>
            <select aria-label={t.time} value={pickMinute} onChange={(event) => setPickMinute(Number(event.target.value))} className={control}>{PICK_TIMES.map((value) => <option key={value} value={value}>{clockLabel(value, language)}</option>)}</select>
          </>}
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <input value={query} onChange={(event) => { setQuery(event.target.value); setBuildingsShown(BUILDINGS_SHOWN); }} aria-label={t.search} placeholder={t.search} className={control} />
          <label className="flex items-center gap-2 text-xs text-[#5d6561]">{t.minFree}<select value={minFree} onChange={(event) => setMinFree(Number(event.target.value))} className={control}>{t.minFreeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button type="button" onClick={locate} disabled={locating} aria-pressed={Boolean(position)} className={`rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${position ? "border-[#273c38] bg-[#273c38] text-white" : "border-[#536d64] bg-white text-[#273c38] hover:bg-[#edf3ef]"}`}>📍 {locating ? t.locating : position ? t.nearOn : t.near}</button>
        </div>
        {locationFailed && <p role="alert" className="text-xs text-[#8c352c]">{t.locationFailed}</p>}
      </section>

      {notes.map((note) => <p key={note} className="mt-3 rounded-xl border border-[#ead8b5] bg-[#fff8e8] px-4 py-2.5 text-xs leading-5 text-[#745424]">{note}</p>)}

      {!clock ? <p className="mt-6 text-sm text-[#646c68]">…</p> : <>
        <p className="mt-5 text-xs text-[#646c68]" aria-live="polite">{t.summary(freeRooms, list.length)} {t.at(`${mode === "pick" ? t.days[pickDay] + " " : ""}${clockLabel(minute, language)}`)}</p>
        {list.length ? <ul className="mt-3 space-y-3">{list.slice(0, buildingsShown).map((entry) => {
          const building = buildings[entry.code]!;
          const open = expanded.includes(entry.code);
          const shown = open ? entry.free : entry.free.slice(0, ROOMS_SHOWN);
          return <li key={entry.code} className="rounded-2xl border border-[#e3e0d8] bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="font-semibold">{building.name} <span className="font-normal text-[#646c68]">({entry.code})</span></h2>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-[#646c68]">
                {entry.distance !== null && <span className="font-semibold text-[#273c38]">{t.walk(walkMinutesFrom(entry.distance))}</span>}
                <span>{t.counts(entry.free.length, entry.busy)}</span>
                <a href={mapsUrl(building)} target="_blank" rel="noreferrer" className="font-medium text-[#a34a39] hover:underline">{t.map} ↗</a>
              </p>
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{shown.map((item) => <li key={item.room.room} className={`rounded-xl border px-3 py-2 ${item.room.rare ? "border-dashed border-[#d9d6ce] bg-[#fbfaf8]" : item.until === null || item.until - minute >= 60 ? "border-[#cddbd1] bg-[#f4f8f5]" : "border-[#ece9e2] bg-[#fbfaf8]"}`}>
              <p className="flex items-baseline justify-between gap-2"><span className="font-semibold">{entry.code} {item.room.room}</span><span className="text-[11px] text-[#646c68]">{t.seats(item.room.size)}</span></p>
              <p className="mt-0.5 text-xs text-[#315c43]">{status(item)}</p>
              {item.room.rare && <p className="mt-0.5 text-[11px] text-[#8a5a17]">{t.rare}</p>}
            </li>)}</ul>
            {entry.free.length > ROOMS_SHOWN && <button type="button" onClick={() => setExpanded((current) => open ? current.filter((code) => code !== entry.code) : [...current, entry.code])} className="mt-2 text-xs font-semibold text-[#273c38] hover:underline">{open ? t.fewerRooms : t.showRooms(entry.free.length)}</button>}
          </li>;
        })}</ul> : <p className="mt-4 rounded-xl border border-[#e0ddd5] bg-[#fbfaf8] px-4 py-3 text-sm text-[#5d6561]">{t.none}</p>}
        {list.length > buildingsShown && <button type="button" onClick={() => setBuildingsShown((value) => value + BUILDINGS_SHOWN)} className="mt-4 rounded-lg border border-[#d9d6ce] bg-white px-4 py-2 text-sm font-semibold text-[#273c38] hover:bg-[#edf3ef]">{t.moreBuildings}</button>}
      </>}

      <details className="mt-8 max-w-2xl rounded-xl border border-[#e0ddd5] bg-[#fbfaf8] px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold text-[#273c38]">{t.how}</summary>
        <p className="mt-2 text-xs leading-5 text-[#5d6561]">{t.howBody} {t.updated(builtAt)}</p>
      </details>
    </div>
  </main>;
}
