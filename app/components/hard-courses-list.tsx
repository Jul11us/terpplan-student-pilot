"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useDocumentLanguage } from "@/lib/document-language";
import type { HardCourse } from "@/lib/hard-courses";
import { formatTermName } from "@/lib/seat-trends";
import { readSavedState, writeSavedState } from "@/lib/saved-state";

type Language = "en" | "zh";
type Level = "undergrad" | "100" | "300" | "grad" | "all";

const PAGE = 30;

const copy = {
  en: {
    home: "Back to planner", eyebrow: "From Testudo seat counts", title: "The hardest UMD courses to get",
    intro: "Courses that were still full after registration in recent semesters. If one of these is on your list, plan a backup section and turn on a seat alert before registration opens.",
    how: "How this is counted", howBody: "For each semester we read the seats left in every section once registration had settled (the current semester after add/drop). A course counts as full when at most 2% of its seats were left. Courses under 30 seats are left out. Full at the end does not mean impossible: seats open up when students drop, which is what seat alerts catch.",
    search: "Filter by course code or name", department: "Department", allDepartments: "All departments",
    level: "Level", levels: { undergrad: "Undergraduate (100–400)", "100": "100–200 level", "300": "300–400 level", grad: "Graduate (600+)", all: "All levels" } as Record<Level, string>,
    fullBadge: (full: number, total: number) => full === total ? `Full all ${total} semesters` : `Full ${full} of ${total} semesters`,
    full: "full", left: (open: number, seats: number) => `${open} of ${seats} left`, seatsAbout: (n: number) => `about ${n} seats a semester`,
    open: "Open in TerpPlan", more: "Show more", none: "No course matches these filters.",
    count: (shown: number, total: number) => `Showing ${shown} of ${total} courses`, updated: (date: string) => `Seat data read ${date}.`,
    cta: "Plan around them", ctaBody: "Add a course in TerpPlan to compare sections, keep a backup in your schedule and get an email when a seat opens.", ctaButton: "Start planning",
  },
  zh: {
    home: "返回排课", eyebrow: "数据来自 Testudo 座位数", title: "UMD 最难抢的课",
    intro: "最近几个学期注册结束后仍然满员的课程。如果你要选的课在这里，最好提前准备备选班次，并在注册开放前打开余位提醒。",
    how: "怎么算的", howBody: "每个学期在注册稳定后读取每个班次剩余的座位（本学期按加退课结束后的数据）。剩余座位不超过 2% 就算“满”。少于 30 个座位的小课不计入。学期末满员不代表完全没机会：有人退课时会空出位置，余位提醒就是帮你抓住这些位置。",
    search: "按课号或课名筛选", department: "院系", allDepartments: "全部院系",
    level: "课程级别", levels: { undergrad: "本科课程（100–400）", "100": "100–200 级", "300": "300–400 级", grad: "研究生课程（600+）", all: "全部级别" } as Record<Level, string>,
    fullBadge: (full: number, total: number) => full === total ? `${total} 个学期都满` : `${total} 个学期里 ${full} 个满`,
    full: "满", left: (open: number, seats: number) => `剩 ${open} / ${seats}`, seatsAbout: (n: number) => `每学期约 ${n} 个座位`,
    open: "在 TerpPlan 打开", more: "显示更多", none: "没有符合筛选条件的课程。",
    count: (shown: number, total: number) => `显示 ${shown} / ${total} 门课`, updated: (date: string) => `座位数据读取于 ${date}。`,
    cta: "提前做好准备", ctaBody: "在 TerpPlan 里加入课程，可以比较各个班次、在课表里留好备选，并在有空位时收到邮件提醒。", ctaButton: "开始排课",
  },
} as const;

function levelMatches(level: Level, courseLevel: number) {
  if (level === "all") return true;
  if (level === "undergrad") return courseLevel < 500;
  if (level === "100") return courseLevel < 300;
  if (level === "300") return courseLevel >= 300 && courseLevel < 500;
  return courseLevel >= 600;
}

export function HardCoursesList({ courses, terms, builtAt }: { courses: HardCourse[]; terms: string[]; builtAt: string }) {
  const [language, setLanguage] = useState<Language>("en");
  useDocumentLanguage(language);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState<Level>("undergrad");
  const [shown, setShown] = useState(PAGE);
  const t = copy[language];

  useEffect(() => {
    const saved = readSavedState().language;
    // Restoring the saved language after the first render keeps the server and client HTML the same.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "en" || saved === "zh") setLanguage(saved);
  }, []);

  const departments = useMemo(() => [...new Set(courses.map((course) => course.department))].sort(), [courses]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/\s+/g, "");
    return courses.filter((course) => levelMatches(level, course.level)
      && (!department || course.department === department)
      && (!needle || course.id.toLowerCase().includes(needle) || course.title.toLowerCase().replace(/\s+/g, "").includes(needle)));
  }, [courses, query, department, level]);
  // Ranks follow the filtered list, so "#1" is the hardest course among the ones shown.
  const visible = filtered.slice(0, shown);
  const control = "rounded-lg border border-[#d9d6ce] bg-white px-3 py-2 text-sm outline-none focus:border-[#a34a39] focus:ring-2 focus:ring-[#a34a39]/30";

  return <main className="min-h-screen bg-[#f5f3ef] text-[#202728]">
    <header className="border-b border-[#dedbd3] bg-[#fbfaf8]"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4 sm:px-8"><Link href="/" className="flex items-center gap-3 font-semibold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#bd302f] font-serif text-lg text-white">T</span>TerpPlan</Link><div className="flex items-center gap-3"><Link href="/plan" className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9d6ce] bg-white px-3 py-1.5 text-xs font-semibold text-[#273c38] shadow-sm hover:border-[#536d64] hover:bg-[#edf3ef]"><span aria-hidden="true">←</span>{t.home}</Link><button type="button" onClick={() => { const next = language === "en" ? "zh" : "en"; setLanguage(next); writeSavedState({ language: next }); }} className="rounded-lg border border-[#dcd9d0] px-3 py-2 text-xs">{language === "en" ? "中文" : "English"}</button></div></div></header>
    <div className="mx-auto max-w-5xl px-5 pb-16 pt-10 sm:px-8">
      <p className="text-[11px] font-semibold uppercase tracking-[.17em] text-[#a34a39]">{t.eyebrow}</p>
      <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-tight sm:text-5xl">{t.title}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-[#5d6561]">{t.intro}</p>
      <details className="mt-4 max-w-2xl rounded-xl border border-[#e0ddd5] bg-[#fbfaf8] px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold text-[#273c38]">{t.how}</summary>
        <p className="mt-2 text-xs leading-5 text-[#5d6561]">{t.howBody} {t.updated(builtAt)}</p>
      </details>

      <div className="mt-8 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <input value={query} onChange={(event) => { setQuery(event.target.value); setShown(PAGE); }} aria-label={t.search} placeholder={t.search} className={control} />
        <select value={department} onChange={(event) => { setDepartment(event.target.value); setShown(PAGE); }} aria-label={t.department} className={control}>
          <option value="">{t.allDepartments}</option>
          {departments.map((code) => <option key={code} value={code}>{code}</option>)}
        </select>
        <select value={level} onChange={(event) => { setLevel(event.target.value as Level); setShown(PAGE); }} aria-label={t.level} className={control}>
          {(Object.keys(t.levels) as Level[]).map((key) => <option key={key} value={key}>{t.levels[key]}</option>)}
        </select>
      </div>
      <p className="mt-3 text-xs text-[#646c68]" aria-live="polite">{t.count(visible.length, filtered.length)}</p>

      {visible.length ? <ol className="mt-3 space-y-2">{visible.map((course, index) => <li key={course.id} className="rounded-xl border border-[#e3e0d8] bg-white p-4">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <span className="w-8 shrink-0 pt-0.5 font-serif text-xl text-[#a34a39]">{index + 1}</span>
          <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-0">
            <p className="font-semibold"><span>{course.id}</span> <span className="font-normal text-[#48534f]">{course.title}</span></p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#646c68]">
              <span className={`whitespace-nowrap rounded-full px-2 py-0.5 font-semibold ${course.fullTerms === course.readings.length ? "bg-[#fff0ec] text-[#8c352c]" : "bg-[#fff8e8] text-[#745424]"}`}>{t.fullBadge(course.fullTerms, course.readings.length)}</span>
              <span>{t.seatsAbout(course.averageSeats)}</span>
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5 text-[11px]">{terms.map((term) => {
              const reading = course.readings.find((item) => item.term === term);
              if (!reading) return null;
              return <li key={term} className={`whitespace-nowrap rounded-md border px-2 py-1 ${reading.full ? "border-[#e7c6bf] bg-[#fff6f3] text-[#8c352c]" : "border-[#e3e0d8] bg-[#f8f7f4] text-[#48534f]"}`}>
                <span className="font-medium">{formatTermName(term, language)}</span> · {reading.full ? t.full : t.left(reading.open, reading.seats)}
              </li>;
            })}</ul>
          </div>
          <Link href={`/plan?course=${course.id}`} className="ml-12 shrink-0 rounded-lg border border-[#536d64] px-3 py-1.5 text-xs font-semibold text-[#273c38] hover:bg-[#edf3ef] sm:ml-0">{t.open}</Link>
        </div>
      </li>)}</ol> : <p className="mt-4 rounded-xl border border-[#e0ddd5] bg-[#fbfaf8] px-4 py-3 text-sm text-[#5d6561]">{t.none}</p>}
      {filtered.length > visible.length && <button type="button" onClick={() => setShown((value) => value + PAGE)} className="mt-4 rounded-lg border border-[#d9d6ce] bg-white px-4 py-2 text-sm font-semibold text-[#273c38] hover:bg-[#edf3ef]">{t.more}</button>}

      <section className="mt-10 rounded-2xl border border-[#cddbd1] bg-[#edf3ef] p-5 sm:p-6">
        <h2 className="font-serif text-2xl text-[#273c38]">{t.cta}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#315c43]">{t.ctaBody}</p>
        <Link href="/plan" className="mt-4 inline-block rounded-lg bg-[#273c38] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d302c]">{t.ctaButton}</Link>
      </section>
    </div>
  </main>;
}
