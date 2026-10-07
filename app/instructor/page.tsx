"use client";

import { useEffect, useState } from "react";
import { useDocumentLanguage } from "@/lib/document-language";
import Link from "next/link";
import { dayNames, displayClock, minutes } from "@/app/components/schedule-planner";
import type { InstructorCourse } from "@/lib/instructor";
import type { GpaSummary } from "@/lib/planetterp";
import { isAsyncOnline } from "@/lib/meeting-time";
import { roomLabel } from "@/lib/room";
import { readSavedState, writeSavedState } from "@/lib/saved-state";
import { formatSeatReadTime } from "@/lib/seat-time";

type Language = "en" | "zh";
type Payload = {
  status?: "ok" | "unmatched"; name?: string; term?: string; averageRating?: number | null; reviewCount?: number | null; sourceUrl?: string | null;
  overallGpa?: GpaSummary | null; pastCourses?: number; courses?: InstructorCourse[]; checkedAt?: string; error?: string;
};

const TERM_NAMES: Record<string, string> = { "01": "Spring", "05": "Summer", "08": "Fall", "12": "Winter" };
const ZH_TERMS: Record<string, string> = { "01": "春季", "05": "夏季", "08": "秋季", "12": "冬季" };
const termName = (term: string, language: Language) => language === "zh" ? `${term.slice(0, 4)} ${ZH_TERMS[term.slice(4)] ?? ""}` : `${TERM_NAMES[term.slice(4)] ?? ""} ${term.slice(0, 4)}`;
const zhDays: Record<string, string> = { Mon: "周一", Tue: "周二", Wed: "周三", Thu: "周四", Fri: "周五", Sat: "周六", Sun: "周日" };

const copy = {
  en: {
    plan: "Plan courses", loading: "Loading this instructor's sections…", failed: "This instructor's sections could not be loaded. Try again shortly.",
    missingName: "Choose an instructor from a course's sections.", unmatched: "PlanetTerp does not list an instructor by this name, so TerpPlan cannot find their courses.", search: "Search PlanetTerp",
    rating: "PlanetTerp average {r} / 5", reviews: "{n} reviews", gpa: "Avg GPA {g} across all their courses ({n} students)", allReviews: "All reviews on PlanetTerp",
    teaching: "Teaching in {term}", none: "No {term} sections found in the courses PlanetTerp lists for this instructor.",
    open: "Open in planner →", openOf: "{n} / {total} open", full: "Full", waitlist: "{n} waitlisted", seatsUnknown: "Seats unknown", timeTba: "Time TBA", online: "Online · no set time",
    readAt: "Seat data read", note: "Courses come from this instructor's PlanetTerp history, plus the course you came from. A course they teach for the first time elsewhere may be missing; check Testudo to be sure.",
  },
  zh: {
    plan: "规划课程", loading: "正在读取这位老师的班次…", failed: "暂时无法读取这位老师的班次，请稍后再试。",
    missingName: "请从课程的班次列表里选择一位老师。", unmatched: "PlanetTerp 上没有这个名字的老师，所以 TerpPlan 找不到这位老师教的课。", search: "在 PlanetTerp 搜索",
    rating: "PlanetTerp 平均分 {r} / 5", reviews: "{n} 条评价", gpa: "所有课程平均 GPA {g}（{n} 名学生）", allReviews: "在 PlanetTerp 查看全部评价",
    teaching: "{term}开的课", none: "在 PlanetTerp 记录的这位老师的课程里，没有找到{term}的班次。",
    open: "在排课页打开 →", openOf: "空位 {n} / {total}", full: "已满", waitlist: "候补 {n} 人", seatsUnknown: "余位未知", timeTba: "时间待定", online: "线上 · 无固定时间",
    readAt: "余位数据读取于", note: "课程列表来自这位老师在 PlanetTerp 上的记录，再加上你刚才看的那门课。第一次开的课可能不在里面，请以 Testudo 为准。",
  },
} as const;

export default function InstructorPage() {
  const [language, setLanguage] = useState<Language>("en");
  useDocumentLanguage(language);
  const [query, setQuery] = useState<{ name: string; term: string; course: string } | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const start = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      setLanguage(readSavedState().language ?? "en");
      setQuery({ name: (params.get("name") ?? "").trim(), term: /^\d{6}$/.test(params.get("term") ?? "") ? params.get("term")! : "202701", course: params.get("course") ?? "" });
    }, 0);
    return () => window.clearTimeout(start);
  }, []);
  useEffect(() => {
    if (!query?.name) return;
    let cancelled = false;
    const params = new URLSearchParams({ name: query.name, term: query.term, ...(query.course ? { course: query.course } : {}) });
    fetch(`/api/instructor?${params}`)
      .then(async (response) => { const payload = await response.json() as Payload; if (!response.ok) throw new Error(payload.error); if (!cancelled) setData(payload); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [query]);
  const t = copy[language];
  const switchLanguage = () => { const next = language === "en" ? "zh" : "en"; setLanguage(next); writeSavedState({ language: next }); };
  const meetingText = (meeting: { days?: string | null; start_time?: string | null; end_time?: string | null; building?: string | null; room?: string | null }) => {
    if (isAsyncOnline(meeting)) return t.online;
    const start = minutes(meeting.start_time), end = minutes(meeting.end_time), days = dayNames(meeting.days);
    if (start === null || end === null || !days.length) return t.timeTba;
    return `${days.map((day) => language === "zh" ? zhDays[day] ?? day : day).join(" ")} · ${displayClock(start)}–${displayClock(end)} · ${roomLabel(meeting.building, meeting.room, language)}`;
  };
  const term = query ? termName(query.term, language) : "";

  return <main className="min-h-screen bg-[#f5f3ef] text-[#202728]">
    <header className="border-b border-[#dedbd3] bg-[#fbfaf8]"><div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
      <Link href="/" className="flex items-center gap-2 font-semibold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#bd302f] font-serif text-white">T</span>TerpPlan</Link>
      <div className="flex items-center gap-2"><Link href="/plan" className="rounded-lg border border-[#d9d6ce] bg-white px-3 py-1.5 text-xs font-semibold text-[#273c38]">{t.plan}</Link><button type="button" onClick={switchLanguage} className="rounded-lg border border-[#dcd9d0] px-3 py-1.5 text-xs">{language === "en" ? "中文" : "English"}</button></div>
    </div></header>
    <div className="mx-auto max-w-3xl px-4 pb-12 pt-6">
      {query && !query.name && <p className="text-sm text-[#5d6561]">{t.missingName}</p>}
      {query?.name && <h1 className="font-serif text-3xl">{data?.status === "ok" ? data.name : query.name}</h1>}
      {query?.name && !data && !failed && <p className="mt-4 text-sm text-[#5d6561]">{t.loading}</p>}
      {failed && <p role="alert" className="mt-4 text-sm text-[#8c352c]">{t.failed}</p>}
      {data?.status === "unmatched" && <p className="mt-4 text-sm leading-6 text-[#48534f]">{t.unmatched} <a href={`https://planetterp.com/search?query=${encodeURIComponent(query?.name ?? "")}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#a34a39] hover:underline">{t.search} ↗</a></p>}
      {data?.status === "ok" && <>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {typeof data.averageRating === "number" && <span className="rounded-full bg-[#f5efe2] px-2.5 py-1 text-[#795f2d]">{t.rating.replace("{r}", data.averageRating.toFixed(2))}{data.reviewCount ? ` · ${t.reviews.replace("{n}", String(data.reviewCount))}` : ""}</span>}
          {data.overallGpa && <span className="rounded-full bg-[#edf3ef] px-2.5 py-1 text-[#315c43]">{t.gpa.replace("{g}", data.overallGpa.gpa.toFixed(2)).replace("{n}", String(data.overallGpa.students))}</span>}
          {data.sourceUrl && <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#a34a39] hover:underline">{t.allReviews} ↗</a>}
        </div>
        <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-[#5d6561]">{t.teaching.replace("{term}", term)}</h2>
        {!data.courses?.length && <p className="mt-2 rounded-xl bg-[#f2f0eb] p-4 text-sm text-[#5d6561]">{t.none.replace("{term}", term)}</p>}
        <div className="mt-2 space-y-3">{data.courses?.map((course) => <article key={course.courseId} className="rounded-xl border border-[#e7e4dc] bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold">{course.courseId}{course.title ? <span className="font-normal text-[#5d6561]"> · {course.title}</span> : null}</h3><Link href={`/plan?course=${course.courseId}`} className="text-xs font-semibold text-[#a34a39] hover:underline">{t.open}</Link></div>
          <ul className="mt-2 divide-y divide-[#ece9e2]">{course.sections.map((section) => {
            const open = section.openSeats;
            const badge = open === null ? t.seatsUnknown : open > 0 ? (section.seats !== null ? t.openOf.replace("{n}", String(open)).replace("{total}", String(section.seats)) : String(open)) : t.full;
            return <li key={section.sectionId} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2 text-xs">
              <div className="min-w-0"><p className="font-semibold text-[#24312d]">{section.sectionId}</p>{(section.meetings ?? []).map((meeting, index) => <p key={index} className="text-[#48534f]">{meetingText(meeting)}</p>)}</div>
              <div className="text-right"><span className={`inline-block rounded-full px-2.5 py-1 font-semibold ${open === null ? "bg-[#f1efe9] text-[#5d6561]" : open > 0 ? "bg-[#eaf4ec] text-[#367047]" : "bg-[#f5e9e5] text-[#8f4538]"}`}>{badge}</span>{section.waitlist ? <p className="mt-1 text-[11px] text-[#646c68]">{t.waitlist.replace("{n}", String(section.waitlist))}</p> : null}</div>
            </li>;
          })}</ul>
        </article>)}</div>
        {data.checkedAt && <p className="mt-4 text-xs text-[#646c68]">{t.readAt}: {formatSeatReadTime(data.checkedAt, language)}</p>}
        <p className="mt-2 text-[11px] leading-5 text-[#646c68]">{t.note}</p>
      </>}
    </div>
  </main>;
}
