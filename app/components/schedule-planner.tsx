"use client";

import { useMemo, useState } from "react";

type Language = "en" | "zh";
type Meeting = { days?: string | null; start_time?: string | null; end_time?: string | null; classtype?: string | null; building?: string | null; room?: string | null };
type ProfessorRating = { name: string; averageRating: number | null; matched: boolean };
type ScheduledSection = {
  course_id: string;
  course_title: string;
  section_id: string;
  credits: number | null;
  meetings?: Meeting[];
  instructors?: string[];
  instructorRatings: ProfessorRating[];
  open_seats?: string | number | null;
  waitlist?: string | number | null;
};
type ScheduleOption = {
  selectedSections: ScheduledSection[];
  totalCredits: number;
  score: number;
  professorRating: number | null;
  gapMinutes: number;
  earliestStart: string | null;
  latestEnd: string | null;
  campusDays: string[];
  timeFitPercent: number | null;
  unknownSectionIds: string[];
  fullSectionIds?: string[];
};
type PlanCourse = { courseId: string; courseTitle: string; instructors?: string[] };
// Mirrors PlanWarning in lib/planner.ts.
type PlanWarning = { code: string; courseId?: string; count?: number };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const COLORS = ["#bda0d5", "#ffdadb", "#79ded4", "#ecd34e", "#a8c9ed", "#f2b98c", "#bcd7a1", "#d6bee5", "#accfce", "#e2c4a2"];
const copy = {
  en: {
    courses: "Courses in this plan", addCourse: "Add a course from search to generate options.", remove: "Remove",
    generate: "Generate schedules", generating: "Finding conflict-free schedules…", preferences: "Schedule preferences",
    earliest: "Earliest class start", excluded: "Avoid these days", window: "Preferred time window",
    start: "From", end: "To", strict: "Keep every class inside this window", options: "Top schedule options",
    option: "Option", score: "Score", rating: "Instructor rating", gaps: "Between-class gaps", days: "Campus days", firstClass: "earliest class",
    openOnly: "Only use sections with open seats", fullIn: "Full", seatsUnknown: "Seats unknown", full: "Full", seat: "seat open", seatsOpen: "seats open",
    windowHint: "Classes outside this window lower the ranking; tick the box to exclude them.",
    includeFc: "I'm in the Freshman Connection program (include FC sections)",
    onlyInstructors: "Only", minutes: "min", credits: "credits", lecture: "Lecture", discussion: "Discussion", lab: "Lab",
    select: "View this schedule", calendar: "Weekly timetable", unknown: "Times to confirm", noUnknown: "All meeting times are listed.",
    noOptions: "No conflict-free schedule was found. Remove a preference or course and try again.",
    fit: "Preferred-window fit", warning: "Some meeting times are missing, so those sections cannot be fully checked.",
    loadError: "Schedule options could not be generated. Please try again.", invalidWindow: "Enter both ends of the preferred window, with the start before the end.", back: "← Back to course search",
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  },
  zh: {
    courses: "待排课程", addCourse: "请先从找课中添加课程，再生成方案。", remove: "移除",
    generate: "生成排课方案", generating: "正在寻找无时间冲突的方案…", preferences: "排课偏好",
    earliest: "最早上课时间", excluded: "希望避开的日期", window: "偏好上课时间段",
    start: "开始", end: "结束", strict: "所有课程都必须在此时间段内", options: "推荐方案",
    option: "方案", score: "综合分", rating: "教师评分", gaps: "课间空档", days: "到校天数", firstClass: "最早上课",
    openOnly: "只使用有空位的班次", fullIn: "已满", seatsUnknown: "余位未知", full: "已满", seat: "个空位", seatsOpen: "个空位",
    windowHint: "时间段外的课程会降低排名；勾选后会直接排除。",
    includeFc: "我参加了 Freshman Connection 项目（包含 FC 班次）",
    onlyInstructors: "只排", minutes: "分钟", credits: "学分", lecture: "讲课", discussion: "讨论课", lab: "实验课",
    select: "查看此方案", calendar: "每周课表", unknown: "需要确认的时间", noUnknown: "所有班次均列出了上课时间。",
    noOptions: "没有找到无冲突方案。可以移除一项偏好或课程后重试。",
    fit: "符合时间偏好的比例", warning: "部分班次时间缺失，无法完整验证这些课程是否冲突。",
    loadError: "暂时无法生成排课方案，请重试。", invalidWindow: "请填写完整的偏好时间段，并确保开始时间早于结束时间。", back: "← 返回找课",
    weekdays: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
  },
} as const;

type Props = {
  courses: PlanCourse[];
  term: string;
  language: Language;
  onRemove: (courseId: string) => void;
  onBack: () => void;
};

function dayNames(raw: string | null | undefined) {
  if (!raw || /^(TBA|TBD|ARRANGED)$/i.test(raw.trim())) return [] as string[];
  const text = raw.toUpperCase().replace(/[^A-Z]/g, "");
  const tokens: Array<[string, string]> = [
    ["MONDAY", "Mon"], ["MON", "Mon"], ["MO", "Mon"], ["TUESDAY", "Tue"], ["TUES", "Tue"], ["TUE", "Tue"], ["TU", "Tue"],
    ["WEDNESDAY", "Wed"], ["WED", "Wed"], ["WE", "Wed"], ["THURSDAY", "Thu"], ["THURS", "Thu"], ["THUR", "Thu"], ["THU", "Thu"], ["TH", "Thu"],
    ["FRIDAY", "Fri"], ["FRI", "Fri"], ["FR", "Fri"], ["SATURDAY", "Sat"], ["SAT", "Sat"], ["SA", "Sat"], ["SUNDAY", "Sun"], ["SUN", "Sun"], ["SU", "Sun"], ["M", "Mon"], ["T", "Tue"], ["W", "Wed"], ["F", "Fri"],
  ];
  const result: string[] = [];
  for (let index = 0; index < text.length;) {
    const match = tokens.find(([token]) => text.startsWith(token, index));
    if (match) { if (!result.includes(match[1])) result.push(match[1]); index += match[0].length; }
    else index += 1;
  }
  return result;
}

function minutes(raw: string | null | undefined) {
  if (!raw || /tba|tbd/i.test(raw)) return null;
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})\s*([ap]m)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (match[3]) { if (hour === 12) hour = 0; if (match[3].toLowerCase() === "pm") hour += 12; }
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function displayClock(value: number) {
  const hour = Math.floor(value / 60);
  return (hour % 12 || 12) + ":" + String(value % 60).padStart(2, "0") + (hour < 12 ? "am" : "pm");
}

function seatCount(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function seatText(value: string | number | null | undefined, t: (typeof copy)[Language]) {
  const open = seatCount(value);
  if (open === null) return t.seatsUnknown;
  if (open === 0) return t.full;
  return open + " " + (open === 1 ? t.seat : t.seatsOpen);
}

function warningText(warning: PlanWarning, language: Language) {
  const course = warning.courseId ?? "";
  const count = warning.count ?? 0;
  if (language === "zh") {
    switch (warning.code) {
      case "courseNotFound": return course + " 在本学期找不到。";
      case "noSectionsListed": return course + " 本学期没有开设班次。";
      case "sectionsSkipped": return course + "：有 " + count + " 个班次因课程数据缺少可用的班号而未纳入排课。";
      case "noValidSections": return course + " 本学期没有可用班号的班次。";
      case "courseLoadFailed": return course + " 加载失败，已从方案中略去。";
      case "ratingsLimited": return "有 " + count + " 位教师的评分未查询，因为本次请求达到了查询上限。";
      case "noEligibleSections": return course + " 没有符合当前排课偏好的班次。";
      case "noSelectedInstructors": return course + " 本学期没有你选中的老师开的班次。";
      case "someCoursesOmitted": return "部分课程无法排入，方案只包含有可选班次的课程。";
      case "noConflictFree": return "这些课程找不到没有时间冲突的组合。";
      case "searchLimit": return "搜索达到了安全上限。结果是已找到的最佳方案，但不保证是完整排名。";
      case "allOptionsFull": return "每个方案都至少包含一个已满的班次。可以关注这些班次的余位，或换其他课程。";
      case "tbaTimes": return "部分班次的上课时间待定或不完整，方案中可能仍有未能核实的时间冲突。";
    }
  }
  switch (warning.code) {
    case "courseNotFound": return course + " was not found for this term.";
    case "noSectionsListed": return course + " has no sections listed for this term.";
    case "sectionsSkipped": return course + ": " + count + (count === 1 ? " section was" : " sections were") + " left out because the course data did not include a usable section number.";
    case "noValidSections": return course + " has no sections with valid section IDs for this term.";
    case "courseLoadFailed": return course + " could not be loaded. It was left out of the options.";
    case "ratingsLimited": return count + " instructor ratings were not looked up because the request reached the lookup safety limit.";
    case "noEligibleSections": return course + " has no sections that satisfy the selected schedule preferences.";
    case "noSelectedInstructors": return course + " has no sections taught by the instructors you kept.";
    case "someCoursesOmitted": return "Some requested courses could not be included; the options cover only courses with eligible sections.";
    case "noConflictFree": return "No conflict-free combination was found for these courses.";
    case "searchLimit": return "The search reached its safety limit. Results are the best options found, not a proven complete ranking.";
    case "allOptionsFull": return "Every option includes at least one full section. Watch those sections or try different courses.";
    case "tbaTimes": return "Some selected sections have TBA or incomplete meeting times; the schedule may still contain an unverified conflict.";
    default: return language === "zh" ? "排课时出现了一个问题。" : "Something needs attention in this schedule.";
  }
}

function meetingType(raw: string | null | undefined) {
  const type = raw?.trim().toLowerCase();
  if (type === "discussion") return "discussion";
  if (type === "lab") return "lab";
  if (!type || type === "lecture") return "lecture";
  return null;
}

function WeeklyCalendar({ sections, language }: { sections: ScheduledSection[]; language: Language }) {
  const t = copy[language];
  const firstMinute = 8 * 60;
  const lastMinute = 22 * 60;
  const pixelsPerMinute = 1;
  const height = (lastMinute - firstMinute) * pixelsPerMinute;
  const unknown = new Set<string>();
  for (const section of sections) if (!section.meetings?.length) unknown.add(section.section_id);
  const colors = new Map([...new Set(sections.map((section) => section.course_id))].map((courseId, index) => [courseId, COLORS[index % COLORS.length]]));
  const columnClass = "relative border-l border-[#e6e4de] bg-[linear-gradient(to_bottom,transparent_59px,#e7e4dc_60px)] bg-[length:100%_60px]";
  return <div className="overflow-x-auto rounded-xl border border-[#e0ddd5] bg-white">
    <div className="grid min-w-[900px] grid-cols-[58px_repeat(7,minmax(0,1fr))]">
      <div className="sticky top-0 z-10 bg-white p-3 text-center text-[11px] text-[#8a918e]">ET</div>
      {DAYS.map((day, index) => <div key={day} className="sticky top-0 z-10 border-l border-[#e6e4de] bg-white p-3 text-center text-xs font-semibold text-[#59635f]">{t.weekdays[index]}</div>)}
      <div className="relative" style={{ height }}>
        {Array.from({ length: 15 }, (_, index) => <span key={index} className="absolute right-2 -translate-y-1/2 text-[10px] text-[#858d89]" style={{ top: index * 60 }}>{displayClock(firstMinute + index * 60)}</span>)}
      </div>
      {DAYS.map((day) => <div key={day} className={columnClass} style={{ height }}>
        {sections.flatMap((section) => (section.meetings ?? []).flatMap((meeting, index) => {
          const start = minutes(meeting.start_time);
          const end = minutes(meeting.end_time);
          const meetingDays = dayNames(meeting.days);
          if (start === null || end === null || end <= start || !meetingDays.length) {
            unknown.add(section.section_id);
            return [];
          }
          if (!meetingDays.includes(day)) return [];
          const clippedStart = Math.max(start, firstMinute);
          const clippedEnd = Math.min(end, lastMinute);
          if (clippedEnd <= clippedStart) return [];
          const kind = meetingType(meeting.classtype);
          const type = kind ? t[kind] : null;
          return [<article key={section.section_id + "-" + day + "-" + index} className="absolute inset-x-1 overflow-hidden rounded-md border border-white/80 px-1.5 py-1 text-center text-[10px] leading-tight text-[#24312d] shadow-sm" style={{ top: (clippedStart - firstMinute) * pixelsPerMinute, height: Math.max(type ? 44 : 28, (clippedEnd - clippedStart) * pixelsPerMinute), backgroundColor: colors.get(section.course_id) }} title={section.course_id + " " + section.section_id + (type ? " · " + type : "") + " · " + displayClock(start) + "–" + displayClock(end)}>
            <div className="flex items-center justify-center gap-1"><strong className="truncate">{section.course_id}</strong>{type && <span className="shrink-0 rounded bg-white/55 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide">{type}</span>}</div><span>{section.section_id}</span><span className="block">{displayClock(start)}–{displayClock(end)}</span>
          </article>];
        }))}
      </div>)}
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-[#e6e4de] px-4 py-3 text-[11px] text-[#59635f]">
      {[...colors].map(([courseId, color]) => <span key={courseId} className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />{courseId}</span>)}
    </div>
    {unknown.size > 0 ? <p className="border-t border-[#e6e4de] bg-[#fff8e8] px-4 py-3 text-xs text-[#745424]">{t.warning} {t.unknown}: {[...unknown].join(", ")}</p> : <p className="border-t border-[#e6e4de] px-4 py-3 text-xs text-[#737b77]">{t.noUnknown}</p>}
  </div>;
}

export default function SchedulePlanner({ courses, term, language, onRemove, onBack }: Props) {
  const t = copy[language];
  const [generated, setGenerated] = useState<{ requestKey: string; options: ScheduleOption[]; warnings: PlanWarning[] }>({ requestKey: "", options: [], warnings: [] });
  const [selectedOption, setSelectedOption] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [excludedDays, setExcludedDays] = useState<string[]>([]);
  const [earliestStart, setEarliestStart] = useState("");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [strictTime, setStrictTime] = useState(false);
  const [openSeatsOnly, setOpenSeatsOnly] = useState(false);
  const [includeFreshmanConnection, setIncludeFreshmanConnection] = useState(false);
  const courseKey = useMemo(() => courses.map((course) => course.courseId + (course.instructors ? ":" + course.instructors.join("+") : "")).join("|"), [courses]);

  // Results belong to the course list and term they were generated for; hide them once either changes.
  const requestKey = courseKey + "@" + term;
  const options = generated.requestKey === requestKey ? generated.options : [];
  const warnings = generated.requestKey === requestKey ? generated.warnings : [];

  const generate = async () => {
    if (!courses.length) return;
    if ((windowStart || windowEnd || strictTime) && (!windowStart || !windowEnd || windowStart >= windowEnd)) {
      setError(t.invalidWindow);
      return;
    }
    setLoading(true);
    setError("");
    setGenerated((current) => ({ ...current, warnings: [] }));
    try {
      const response = await fetch("/api/schedules/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          courseIds: courses.map((course) => course.courseId),
          instructorFilters: Object.fromEntries(courses.filter((course) => course.instructors?.length).map((course) => [course.courseId, course.instructors])),
          term,
          preferences: { earliestStart: earliestStart || null, excludedDays, windowStart: windowStart || null, windowEnd: windowEnd || null, strictTime, openSeatsOnly, includeFreshmanConnection },
        }),
      });
      const payload = await response.json() as { error?: string; options?: ScheduleOption[]; warnings?: PlanWarning[] };
      if (!response.ok) throw new Error(payload.error || t.loadError);
      setGenerated({ requestKey, options: payload.options ?? [], warnings: payload.warnings ?? [] });
      setSelectedOption(0);
    } catch {
      setError(t.loadError);
      setGenerated({ requestKey, options: [], warnings: [] });
    } finally {
      setLoading(false);
    }
  };

  const chosen = options[selectedOption];
  return <section className="mx-auto max-w-6xl rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5 sm:p-8">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[.13em] text-[#9a5040]">02 · {t.preferences}</p><h2 className="mt-2 font-serif text-3xl">{t.courses}</h2></div>
      <button onClick={onBack} className="rounded-lg border border-[#d9d6ce] px-3 py-2 text-sm font-medium hover:bg-white">{t.back}</button>
    </div>
    {!courses.length ? <p className="mt-6 rounded-xl bg-[#f2f0eb] p-5 text-sm text-[#717975]">{t.addCourse}</p> : <>
      <div className="mt-6 space-y-2">{courses.map((course) => <article key={course.courseId} className="flex items-center justify-between gap-4 rounded-xl border border-[#e3e0d8] bg-white px-4 py-3"><div><p className="font-semibold">{course.courseId}</p><p className="mt-0.5 text-xs text-[#737b77]">{course.courseTitle}</p>{course.instructors?.length ? <p className="mt-1 text-xs text-[#536d64]">{t.onlyInstructors}: {course.instructors.join(", ")}</p> : null}</div><button onClick={() => onRemove(course.courseId)} className="rounded-lg border border-[#dedbd3] px-3 py-2 text-xs font-medium text-[#6a736f] hover:bg-[#f6f4ef]">{t.remove}</button></article>)}</div>
      <div className="mt-5 rounded-xl border border-[#e3e0d8] bg-white p-4 sm:p-5">
        <h3 className="font-semibold">{t.preferences}</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1.5 text-xs font-medium text-[#68716e]">{t.earliest}<input type="time" value={earliestStart} onChange={(event) => setEarliestStart(event.target.value)} className="rounded-lg border border-[#dedbd3] bg-white px-3 py-2 text-sm text-[#202728]" /></label>
          <label className="grid gap-1.5 text-xs font-medium text-[#68716e]">{t.window} · {t.start}<input type="time" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} className="rounded-lg border border-[#dedbd3] bg-white px-3 py-2 text-sm text-[#202728]" /></label>
          <label className="grid gap-1.5 text-xs font-medium text-[#68716e]">{t.window} · {t.end}<input type="time" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} className="rounded-lg border border-[#dedbd3] bg-white px-3 py-2 text-sm text-[#202728]" /></label>
          <label className="flex items-end gap-2 pb-2 text-xs text-[#68716e]"><input type="checkbox" checked={strictTime} disabled={!windowStart || !windowEnd} onChange={(event) => setStrictTime(event.target.checked)} />{t.strict}</label>
        </div>
        <div className="mt-4"><p className="mb-2 text-xs font-medium text-[#68716e]">{t.excluded}</p><div className="flex flex-wrap gap-2">{DAYS.map((day, index) => <label key={day} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#e3e0d8] bg-[#fbfaf8] px-3 py-2 text-xs"><input type="checkbox" checked={excludedDays.includes(day)} onChange={(event) => setExcludedDays((current) => event.target.checked ? [...current, day] : current.filter((item) => item !== day))} />{t.weekdays[index]}</label>)}</div></div>
        <label className="mt-4 inline-flex items-center gap-2 text-xs text-[#68716e]"><input type="checkbox" checked={openSeatsOnly} onChange={(event) => setOpenSeatsOnly(event.target.checked)} />{t.openOnly}</label>
        <label className="mt-2 flex items-center gap-2 text-xs text-[#68716e]"><input type="checkbox" checked={includeFreshmanConnection} onChange={(event) => setIncludeFreshmanConnection(event.target.checked)} />{t.includeFc}</label>
        <p className="mt-3 text-xs leading-5 text-[#858d89]">{t.windowHint}</p>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-[#e7c6bf] bg-[#fff0ec] px-4 py-3 text-sm text-[#8c352c]">{error}</p>}
      <div className="mt-5 flex justify-end"><button onClick={() => void generate()} disabled={loading} className="rounded-lg bg-[#273c38] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1d302c] disabled:opacity-60">{loading ? t.generating : t.generate}</button></div>
    </>}
    {warnings.length > 0 && <ul className="mt-5 space-y-2 rounded-xl border border-[#ead8b5] bg-[#fff8e8] p-4 text-sm text-[#745424]">{warnings.map((warning, index) => <li key={index}>{warningText(warning, language)}</li>)}</ul>}
    {courses.length > 0 && options.length === 0 && !loading && !error && warnings.length > 0 && <p className="mt-4 text-sm text-[#68716e]">{t.noOptions}</p>}
    {options.length > 0 && <div className="mt-8">
      <h3 className="font-serif text-2xl">{t.options}</h3>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">{options.map((option, index) => <button type="button" key={option.selectedSections.map((section) => section.section_id).join("|")} onClick={() => setSelectedOption(index)} aria-pressed={selectedOption === index} className={`rounded-xl border p-4 text-left transition ${selectedOption === index ? "border-[#536d64] bg-[#edf3ef] ring-2 ring-[#536d64]/15" : "border-[#e3e0d8] bg-white hover:border-[#b9c5be]"}`}>
        <span className="flex items-center justify-between"><strong>{t.option} {index + 1}</strong><span className="text-xs text-[#737b77]">{t.score} {option.score.toFixed(2)}</span></span>
        <span className="mt-3 block text-xs leading-5 text-[#626c67]">{option.selectedSections.map((section) => section.section_id).join(" · ")}</span>
        {option.fullSectionIds?.length ? <span className="mt-2 inline-block rounded-full bg-[#f5e9e5] px-2 py-0.5 text-[11px] font-semibold text-[#8f4538]">{t.fullIn}: {option.fullSectionIds.join(", ")}</span> : null}
        <span className="mt-3 block text-xs text-[#737b77]">{t.rating}: {option.professorRating === null ? "—" : option.professorRating.toFixed(2) + " / 5"} · {t.gaps}: {option.gapMinutes} {t.minutes}</span>
        <span className="mt-1 block text-xs text-[#737b77]">{t.days}: {option.campusDays.map((day) => t.weekdays[DAYS.indexOf(day as (typeof DAYS)[number])] ?? day).join(", ") || "—"}{option.earliestStart ? " · " + t.firstClass + " " + option.earliestStart : ""}</span>
        {option.timeFitPercent !== null && <span className="mt-1 block text-xs text-[#737b77]">{t.fit}: {Math.round(option.timeFitPercent)}%</span>}
      </button>)}</div>
      {chosen && <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h4 className="font-semibold">{t.calendar}</h4><p className="mt-1 text-xs text-[#737b77]">{chosen.selectedSections.map((section) => section.section_id).join(" · ")}</p></div><span className="text-xs text-[#737b77]">{t.rating}: {chosen.professorRating === null ? "—" : chosen.professorRating.toFixed(2) + " / 5"}{chosen.totalCredits ? " · " + chosen.totalCredits + " " + t.credits : ""}</span></div>
        <WeeklyCalendar sections={chosen.selectedSections} language={language} />
        <div className="mt-4 space-y-2">{chosen.selectedSections.map((section) => <article key={section.section_id} className="rounded-xl border border-[#e3e0d8] bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{section.course_id} · {section.course_title}</p><p className="mt-1 text-sm text-[#626c67]">{section.section_id}{(section.meetings ?? []).length ? " · " + (section.meetings ?? []).map((meeting) => {
          const start = minutes(meeting.start_time), end = minutes(meeting.end_time);
          const kind = meetingType(meeting.classtype);
          const type = kind ? t[kind] : null;
          const days = dayNames(meeting.days).map((day) => t.weekdays[DAYS.indexOf(day as (typeof DAYS)[number])] ?? day);
          return start === null || end === null || !days.length ? (language === "zh" ? "时间待定" : "Time TBA") : (type ? type + " · " : "") + days.join(" ") + " " + displayClock(start) + "–" + displayClock(end);
        }).join(" · ") : language === "zh" ? " · 时间待定" : " · Time TBA"}</p>
        {section.instructorRatings.length > 0 && <p className="mt-2 text-xs text-[#737b77]">{section.instructorRatings.map((item) => item.name + (item.averageRating === null ? "" : " · " + item.averageRating.toFixed(2) + " / 5")).join(" · ")}</p>}
        </div><span className={`rounded-full px-2.5 py-1 text-xs ${seatCount(section.open_seats) === 0 ? "bg-[#f5e9e5] font-semibold text-[#8f4538]" : "bg-[#f1efe9] text-[#68716e]"}`}>{seatText(section.open_seats, t)}</span></div></article>)}</div>
      </div>}
    </div>}
  </section>;
}
