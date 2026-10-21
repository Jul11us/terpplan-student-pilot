"use client";

import { examEvents, examPlan, type CourseExam, type ExamCourse, type ExamTime } from "@/lib/final-exams";
import { buildEventsIcs } from "@/lib/ics";
import { formatTermName } from "@/lib/seat-trends";
import { countUse } from "@/lib/usage";

type Language = "en" | "zh";

const REGISTRAR = "https://registrar.umd.edu/registration/register-classes/final-exams";

const copy = {
  en: {
    title: "Final exams", estimated: "estimate", clear: "No clashes", incomplete: "Some times unknown", clash: "{n} clash", clashes: "{n} clashes", busy: "3+ on one day",
    show: "Exam times", common: "common exam", evening: "at class time",
    online: "No set class time: the instructor arranges the exam.", unknown: "This class time fits no standard slot. Check Testudo.",
    clashNote: "{a} and {b} have exams at the same time. If you keep both, ask the instructors early; common exams usually have a make-up time.",
    busyNote: "{day}: {n} exams. With four or more on one day you can ask to move one (start with the instructor).",
    incompleteNote: "Exam times are unknown for {courses}. Conflicts can only be checked for the times shown; confirm the others in Testudo or with the instructor.",
    official: "Worked out from the Registrar's {term} exam schedule. Testudo lists each exact time and room six weeks before the term ends; go by that.",
    estimate: "{term} exams are not posted yet. These estimates use {from} rules; the current term's dates, time slots and common exams may differ. Confirm in Testudo when posted.",
    days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Mon"], estimateDays: ["1st Mon", "Tue", "Wed", "Thu", "Fri", "2nd Mon"],
    source: "Registrar exam rules",
    exportExams: "Add exams to calendar", exportNote: "Each exam with a reminder a day and an hour before. The times follow the Registrar rules; when Testudo posts exact times, check them there and edit any that differ.",
    eventSummary: "Final exam: {course}", eventDescription: "Worked out from the Registrar's final exam rules. The exact time and room are in Testudo's final exam lookup; go by that.",
    testudo: "Look up in Testudo",
  },
  zh: {
    title: "期末考试", estimated: "估计", clear: "没有冲突", incomplete: "部分时间未确定", clash: "{n} 处冲突", clashes: "{n} 处冲突", busy: "一天 3 门以上",
    show: "各科期末时间", common: "统一考试", evening: "按上课时间",
    online: "没有固定上课时间，期末由老师安排。", unknown: "上课时间不在常规时段里，以 Testudo 为准。",
    clashNote: "{a} 和 {b} 的期末时间重叠。两门都要上的话，尽早问老师；统一考试通常有补考时间。",
    busyNote: "{day}有 {n} 门期末。同一天 4 门及以上可以申请调一门（先找老师）。",
    incompleteNote: "{courses} 的期末时间未确定。这里只能核对已列出时间的冲突，其余请在 Testudo 确认或询问老师。",
    official: "按教务处公布的{term}期末安排推算。学期结束前六周，Testudo 会列出每门课确切的时间和教室，以那里为准。",
    estimate: "{term}的期末安排还没公布，这里按{from}的规则估计；本学期的日期、时段和统一考试课程名单可能不同。公布后请在 Testudo 确认。",
    days: ["周一", "周二", "周三", "周四", "周五", "周一"], estimateDays: ["第一个周一", "周二", "周三", "周四", "周五", "第二个周一"],
    source: "教务处期末规则",
    exportExams: "期末加入日历", exportNote: "每门期末都带提前一天和提前一小时的提醒。时间按教务处规则推算；Testudo 公布确切时间后请去核对，有不同就在日历里改一下。",
    eventSummary: "期末考试：{course}", eventDescription: "按教务处期末规则推算。确切时间和教室见 Testudo 的期末查询，以那里为准。",
    testudo: "在 Testudo 查询",
  },
} as const;

const clock = (value: number) => {
  const hour = Math.floor(value / 60), minute = value % 60;
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")}${hour < 12 ? "am" : "pm"}`;
};

export function examDayLabel(day: number, dates: string[], official: boolean, language: Language) {
  const t = copy[language];
  if (!official) return t.estimateDays[day];
  const date = new Date(`${dates[day]}T12:00:00`);
  return language === "zh" ? `${date.getMonth() + 1}月${date.getDate()}日 ${t.days[day]}` : `${t.days[day]}, ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

const timeText = (time: ExamTime) => `${clock(time.start)}–${clock(time.end)}`;

export function FinalExamsCard({ term, courses, language }: { term: string; courses: ExamCourse[]; language: Language }) {
  const t = copy[language];
  const plan = examPlan(term, courses);
  if (!plan) return null;
  const clashing = new Set(plan.clashes.flat());
  const busy = new Set(plan.busyDays.flatMap((entry) => entry.courseIds));
  const untimed = plan.exams.filter((exam) => !("time" in exam));
  const incomplete = untimed.length > 0;
  const problem = plan.clashes.length > 0 || plan.busyDays.length > 0 || incomplete;
  const tone = plan.clashes.length ? "border-[#e7c6bf] bg-[#fff0ec] text-[#8c352c]" : plan.busyDays.length ? "border-[#ead8b5] bg-[#fff8e8] text-[#745424]" : incomplete ? "border-[#d9dcd9] bg-[#f3f4f2] text-[#5d6561]" : "border-[#cddbd1] bg-[#edf3ef] text-[#315c43]";
  // Only a term's own posted table goes on a calendar; estimates stay on the page.
  const events = examEvents(plan, { summary: t.eventSummary, description: t.eventDescription });
  const download = () => {
    const ics = buildEventsIcs(events, `TerpPlan · ${formatTermName(term, language)} · ${t.title}`);
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `terpplan-final-exams-${term}.ics`;
    link.click(); countUse("examCalendar");
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const verdict = plan.clashes.length ? (plan.clashes.length === 1 ? t.clash : t.clashes).replace("{n}", String(plan.clashes.length)) : plan.busyDays.length ? t.busy : incomplete ? t.incomplete : t.clear;
  const row = (exam: CourseExam) => {
    if (!("time" in exam)) return <li key={exam.courseId} className="flex flex-wrap gap-x-2 text-[#5d6561]"><span className="font-semibold text-[#48534f]">{exam.courseId}</span><span>{exam.kind === "online" ? t.online : t.unknown}</span></li>;
    const flagged = clashing.has(exam.courseId);
    // Phones: the course, then its day and time under it. Wider screens: day, time and course in columns.
    return <li key={exam.courseId} className={`grid gap-x-2 sm:grid-cols-[6.5rem_7.5rem_minmax(0,1fr)] sm:items-baseline ${flagged ? "font-semibold text-[#8c352c]" : busy.has(exam.courseId) ? "text-[#745424]" : "text-[#48534f]"}`}>
      <span className="sm:order-last"><span className="font-semibold">{exam.courseId}</span>{exam.kind !== "standard" && <span className="ml-1.5 text-[11px] font-normal text-[#646c68]">{exam.kind === "common" ? t.common : t.evening}</span>}</span>
      <span className="flex gap-2 sm:contents"><span>{examDayLabel(exam.time.day, plan.dates, plan.official, language)}</span><span className="tabular-nums">{timeText(exam.time)}</span></span>
    </li>;
  };
  return <div className="mb-3 rounded-xl border border-[#e3e0d8] bg-white px-4 py-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-semibold text-[#273c38]">{t.title}{!plan.official && <span className="ml-1.5 font-normal text-[#646c68]">· {t.estimated}</span>}</p>
      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{verdict}</span>
    </div>
    {incomplete && <p className="mt-1.5 text-xs leading-5 text-[#5d6561]">{t.incompleteNote.replace("{courses}", untimed.map((exam) => exam.courseId).join(", "))}</p>}
    {plan.clashes.map(([a, b]) => <p key={a + b} className="mt-1.5 text-xs leading-5 text-[#8c352c]">{t.clashNote.replace("{a}", a).replace("{b}", b)}</p>)}
    {plan.busyDays.map((entry) => <p key={entry.day} className="mt-1.5 text-xs leading-5 text-[#745424]">{t.busyNote.replace("{day}", examDayLabel(entry.day, plan.dates, plan.official, language)).replace("{n}", String(entry.courseIds.length))}</p>)}
    {/* Open from the start when something needs a look; counted only when the student opens it. */}
    <details open={problem} className="mt-1.5">
      <summary onClick={(event) => { if (!(event.currentTarget.parentElement as HTMLDetailsElement).open) countUse("exams"); }} className="min-h-6 cursor-pointer text-xs font-medium text-[#48534f]">{t.show}</summary>
      <ul className="mt-1.5 space-y-1.5 text-xs leading-5 sm:space-y-1">{plan.exams.map(row)}</ul>
      {events.length > 0 && <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" onClick={download} className="rounded-lg border border-[#536d64] px-3 py-1.5 text-xs font-semibold text-[#273c38] hover:bg-[#edf3ef]">{t.exportExams}</button>
        <a href="https://app.testudo.umd.edu/soc/exam/" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[#a34a39] hover:underline">{t.testudo} ↗</a>
        <p className="basis-full text-[11px] leading-4 text-[#646c68]">{t.exportNote}</p>
      </div>}
      <p className="mt-2 text-[11px] leading-4 text-[#646c68]">{(plan.official ? t.official : t.estimate).replace("{term}", formatTermName(term, language)).replace("{from}", formatTermName(plan.from, language))} <a href={REGISTRAR} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#a34a39] hover:underline">{t.source} ↗</a></p>
    </details>
  </div>;
}
