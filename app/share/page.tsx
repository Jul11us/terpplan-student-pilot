"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarExport, WeeklyCalendar, dayNames, displayClock, minutes, type ScheduledSection } from "@/app/components/schedule-planner";
import { roomLabel } from "@/lib/room";
import { isAsyncOnline } from "@/lib/meeting-time";
import { formatSeatReadTime } from "@/lib/seat-time";
import { parseSharedSchedule, type SharedSchedule } from "@/lib/shared-schedule";

type CoursePayload = {
  course?: { name?: string; title?: string; credits?: unknown };
  sections?: Array<Partial<ScheduledSection> & { number?: string }>;
  seatCheckedAt?: string;
};

const copy = {
  en: {
    pilot: "UNIVERSITY OF MARYLAND · STUDENT PILOT", title: "Shared schedule", home: "Plan your own schedule",
    loading: "Loading current course details…", invalid: "This schedule link is incomplete or invalid.", failed: "Course details could not be loaded. Please try again shortly.",
    missing: "These sections are no longer listed for this term:", partial: "This timetable is incomplete until those sections are checked in Testudo.",
    notPlaced: "The person who shared this could not fit these courses, so they are not in this schedule:",
    calendar: "Weekly timetable", sections: "Sections in this schedule", seats: "seats open", full: "Full", unknown: "Seats unknown", readAt: "Seat data read",
    note: "This link stores the term and section numbers. Times, rooms and seats are read again when the link opens. Confirm details in Testudo before registering.",
    lecture: "Lecture", discussion: "Discussion", lab: "Lab", timeTba: "Time TBA", onlineNoTime: "Online · no set time", instructor: "Instructor",
  },
  zh: {
    pilot: "马里兰大学 · 学生试用", title: "分享的课表", home: "规划自己的课表",
    loading: "正在读取最新课程资料…", invalid: "这个课表链接不完整或无效。", failed: "暂时无法读取课程资料，请稍后重试。",
    missing: "本学期已找不到这些班次：", partial: "请到 Testudo 核对这些班次；下方课表目前不完整。",
    notPlaced: "分享者有这些课没能排进来，所以不在这个课表里：",
    calendar: "每周课表", sections: "课表中的班次", seats: "个空位", full: "已满", unknown: "余位未知", readAt: "余位数据读取于",
    note: "链接只保存学期和班次号。打开时会重新读取时间、教室和余位；注册前请到 Testudo 核实。",
    lecture: "讲课", discussion: "讨论课", lab: "实验课", timeTba: "时间待定", onlineNoTime: "线上 · 无固定时间", instructor: "教师",
  },
} as const;

function termName(term: string, language: "en" | "zh") {
  const season = { "01": ["Spring", "春季"], "05": ["Summer", "夏季"], "08": ["Fall", "秋季"], "12": ["Winter", "冬季"] }[term.slice(4)];
  const year = Number(term.slice(0, 4)) + (term.endsWith("12") ? 1 : 0);
  return language === "zh" ? `${year} ${season?.[1] ?? ""}` : `${season?.[0] ?? ""} ${year}`;
}

function meetingText(meeting: NonNullable<ScheduledSection["meetings"]>[number], language: "en" | "zh") {
  const kind = meeting.classtype?.toLowerCase();
  const t = copy[language];
  const label = kind === "discussion" ? t.discussion : kind === "lab" ? t.lab : t.lecture;
  const days = dayNames(meeting.days);
  const start = minutes(meeting.start_time);
  const end = minutes(meeting.end_time);
  const translatedDays = language === "zh" ? days.map((day) => ({ Mon: "周一", Tue: "周二", Wed: "周三", Thu: "周四", Fri: "周五", Sat: "周六", Sun: "周日" })[day as "Mon"]) : days;
  if (isAsyncOnline(meeting)) return `${label} · ${t.onlineNoTime}`;
  const time = days.length && start !== null && end !== null && end > start
    ? `${translatedDays.join(" ")} · ${displayClock(start)}–${displayClock(end)}` : t.timeTba;
  return `${label} · ${time} · ${roomLabel(meeting.building, meeting.room, language)}`;
}

function seatLabel(value: string | number | null | undefined, language: "en" | "zh") {
  const t = copy[language];
  const count = typeof value === "number" && Number.isInteger(value) && value >= 0 ? value
    : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : null;
  return count === null ? t.unknown : count === 0 ? t.full : `${count} ${t.seats}`;
}

export default function SharedSchedulePage() {
  const [shared, setShared] = useState<SharedSchedule | null>(null);
  const [language, setLanguage] = useState<"en" | "zh">("en");
  const [sections, setSections] = useState<ScheduledSection[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "invalid" | "failed">("loading");

  useEffect(() => {
    const controller = new AbortController();
    const start = window.setTimeout(() => {
    const parsed = parseSharedSchedule(new URLSearchParams(window.location.search));
    if (!parsed) { setStatus("invalid"); return; }
    setShared(parsed);
    setLanguage(parsed.language);
    const courseIds = parsed.sectionIds.map((id) => id.split("-")[0]);
    Promise.all(courseIds.map(async (courseId) => {
      const response = await fetch(`/api/course?id=${encodeURIComponent(courseId)}&term=${parsed.term}`, { signal: controller.signal });
      if (!response.ok) throw new Error("course");
      return response.json() as Promise<CoursePayload>;
    })).then((details) => {
      if (controller.signal.aborted) return;
      const found: ScheduledSection[] = [];
      const unavailable: string[] = [];
      parsed.sectionIds.forEach((requestedId, index) => {
        const courseId = courseIds[index];
        const detail = details[index];
        const section = detail.sections?.find((item) => String(item.section_id || (item.number ? `${courseId}-${item.number}` : "")).toUpperCase() === requestedId);
        if (!section) { unavailable.push(requestedId); return; }
        const credits = Number(detail.course?.credits);
        found.push({
          course_id: courseId,
          course_title: detail.course?.name || detail.course?.title || courseId,
          section_id: requestedId,
          credits: Number.isFinite(credits) && credits > 0 ? credits : null,
          meetings: section.meetings ?? [],
          instructors: section.instructors ?? [],
          instructorRatings: [],
          open_seats: section.open_seats,
          waitlist: section.waitlist,
          seatCheckedAt: detail.seatCheckedAt,
        });
      });
      setSections(found);
      setMissing(unavailable);
      setStatus("ready");
    }).catch(() => { if (!controller.signal.aborted) setStatus("failed"); });
    }, 0);
    return () => { window.clearTimeout(start); controller.abort(); };
  }, []);

  const t = copy[language];
  return <main className="min-h-screen bg-[#f5f3ef] text-[#202728]">
    <header className="border-b border-[#e0ddd5] bg-[#fbfaf8]"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8"><Link href="/" className="flex items-center gap-3 font-semibold"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#bc262a] font-serif text-xl text-white">T</span>TerpPlan</Link><button type="button" onClick={() => setLanguage(language === "en" ? "zh" : "en")} className="rounded-lg border border-[#dedbd3] px-3 py-2 text-xs font-medium">{language === "en" ? "中文" : "English"}</button></div></header>
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[.13em] text-[#9a5040]">{t.pilot}</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-serif text-4xl">{t.title}</h1>{shared && <p className="mt-2 text-sm text-[#626c67]">{termName(shared.term, language)} · {shared.sectionIds.join(" · ")}</p>}</div><Link href="/" className="rounded-lg border border-[#d9d6ce] bg-white px-4 py-2.5 text-sm font-medium hover:bg-[#f7f5f0]">{t.home} →</Link></div>
      <p className="mt-5 max-w-3xl text-sm leading-6 text-[#68716e]">{t.note}</p>
      {status === "loading" && <p role="status" className="mt-8 rounded-xl bg-white p-5 text-sm">{t.loading}</p>}
      {status === "invalid" && <p role="alert" className="mt-8 rounded-xl border border-[#e7c6bf] bg-[#fff0ec] p-5 text-sm text-[#8c352c]">{t.invalid}</p>}
      {status === "failed" && <p role="alert" className="mt-8 rounded-xl border border-[#e7c6bf] bg-[#fff0ec] p-5 text-sm text-[#8c352c]">{t.failed}</p>}
      {status === "ready" && shared && <>
        {shared.missingCourseIds.length > 0 && <div role="alert" className="mt-7 rounded-xl border border-[#e7c6bf] bg-[#fff0ec] p-4 text-sm text-[#8c352c]"><strong>{t.notPlaced} {shared.missingCourseIds.join(", ")}</strong></div>}
        {missing.length > 0 && <div role="alert" className="mt-7 rounded-xl border border-[#ead8b5] bg-[#fff8e8] p-4 text-sm text-[#745424]"><strong>{t.missing} {missing.join(", ")}</strong><p className="mt-1">{t.partial}</p></div>}
        {sections.length > 0 && <section className="mt-8 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5 sm:p-8"><h2 className="mb-4 font-serif text-2xl">{t.calendar}</h2><CalendarExport sections={sections} term={shared.term} termName={termName(shared.term, "en")} language={language} incomplete={missing.length > 0 || shared.missingCourseIds.length > 0} /><WeeklyCalendar sections={sections} language={language} /></section>}
        {sections.length > 0 && <section className="mt-6 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5 sm:p-8"><h2 className="font-serif text-2xl">{t.sections}</h2><div className="mt-5 grid gap-3 md:grid-cols-2">{sections.map((section) => <article key={section.section_id} className="rounded-xl border border-[#e3e0d8] bg-white p-4"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{section.course_id} · {section.course_title}</h3><p className="mt-1 text-sm text-[#536d64]">{section.section_id}</p></div><span className="h-fit rounded-full bg-[#edf3ef] px-2.5 py-1 text-xs font-medium text-[#315c43]">{seatLabel(section.open_seats, language)}</span></div>{section.instructors?.length ? <p className="mt-3 text-xs text-[#626c67]">{t.instructor}: {section.instructors.join(", ")}</p> : null}<div className="mt-3 space-y-1 text-xs leading-5 text-[#626c67]">{section.meetings?.length ? section.meetings.map((meeting, index) => <p key={index}>{meetingText(meeting, language)}</p>) : <p>{t.timeTba}</p>}</div>{formatSeatReadTime(section.seatCheckedAt, language) && <p className="mt-3 text-[11px] text-[#858d89]">{t.readAt}: {formatSeatReadTime(section.seatCheckedAt, language)}</p>}</article>)}</div></section>}
      </>}
    </div>
  </main>;
}
