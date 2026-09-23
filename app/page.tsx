"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AboutDialog from "@/app/components/about-dialog";
import SchedulePlanner from "@/app/components/schedule-planner";
import SectionProfessors from "@/app/components/section-professors";
import type { ProfessorSummary } from "@/lib/planetterp";
import { readSavedState, writeSavedState } from "@/lib/saved-state";
import { formatSeatReadTime } from "@/lib/seat-time";

type Course = { course_id: string; name: string; department?: string };
type Meeting = { days?: string | null; start_time?: string | null; end_time?: string | null; building?: string | null; room?: string | null };
type Section = {
  section_id?: string;
  number?: string;
  seats?: string | number | null;
  open_seats?: string | number | null;
  waitlist?: string | number | null;
  instructors?: string[];
  meetings?: Meeting[];
};
type Watch = {
  courseId: string;
  courseTitle: string;
  term: string;
  sectionId: string;
  meetings: Meeting[];
  instructors: string[];
  seats: number | null;
  openSeats: number | null;
  waitlist: number | null;
  status: string;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
};
// instructors: the instructors whose sections may be scheduled; undefined means all of them.
type PlanCourse = { courseId: string; courseTitle: string; instructors?: string[]; pinnedSectionId?: string; excludedSectionIds?: string[] };
// Shapes of the JSON bodies returned by this app's /api routes.
type ApiError = { error?: string };
type WatchesPayload = ApiError & { authenticated?: boolean; watches?: Watch[] };
type TermsPayload = { terms?: string[]; defaultTerm?: string };
type SearchPayload = ApiError & { results?: Course[] };
type CoursePayload = ApiError & { sections?: Section[]; seatCheckedAt?: string };
type RatingsPayload = { ratings?: Record<string, ProfessorSummary> };
type CheckPayload = ApiError & { watches?: Watch[]; alerts?: { courseId: string; sectionId: string }[] };

const copy = {
  en: {
    eyebrow: "UNIVERSITY OF MARYLAND · STUDENT PILOT", title: "Plan your next semester.",
    subtitle: "Find a course, build a schedule, and keep an eye on open seats.", find: "Find a course",
    schedule: "Build a schedule", watch: "Watch seats", search: "Search course code or title",
    searchHint: "e.g. CMSC131 or Calculus", term: "Term", results: "Course matches", select: "View sections",
    noResults: "No matches yet. Search by a course code or title.", sections: "Sections", addSchedule: "Add this course to plan", courseInPlan: "Course in plan", instructorPick: "Instructors to keep", instructorHint: "Tap a name to leave out that instructor's sections.", keepOne: "Keep at least one instructor.", allInstructors: "All",
    addWatch: "Watch this section", scheduleTitle: "Your schedule", emptySchedule: "Add courses from search to generate schedule options.",
    watchesTitle: "Seat watches", emptyWatches: "Watch a section to see it here.", refresh: "Check now", remove: "Remove",
    added: "Course added to plan", watched: "Seat watch saved", conflict: "Time conflict", noConflict: "No time conflicts found", planLimit: "A plan can include up to 10 courses.",
    signIn: "Sign in to save and sync your seat watches.", email: "Email address", emailCode: "Six-digit code", sendCode: "Email me a code", verifyCode: "Verify and sign in", codeSent: "Code sent. Check your inbox.",
    emailPrivacy: "Your address is used to sign you in. Codes expire after 10 minutes.", wrongCode: "That code could not be verified.", emailSignedIn: "Signed in with email", signOut: "Sign out",
    loading: "Loading…", error: "Something went wrong. Please try again.",
    seats: "seats open", seat: "seat open", fcOnly: "Freshman Connection only", pickCourse: "Pick a course from the matches to see its sections.", waitlist: "waitlist", checked: "Last checked", status: "Status", freshness: "Seat counts come from UMD course data and may lag the official Schedule of Classes. This page checks at most once a minute while open.",
    open: "Seats available", full: "Full", unknown: "Unknown", stale: "Last check failed · showing saved count", checking: "Checking…",
    next: "Next step", back: "Back", termFallback: "Term list unavailable — showing Spring 2027",
    timeUnknown: "Some meeting times are missing, so the conflict check is incomplete.",
    pinSection: "Require this section", unpinSection: "Remove requirement", excludeSection: "Exclude from schedules", includeSection: "Allow in schedules",
    keepSection: "Keep at least one section available.", seatReadAt: "Seat data read", seatReadHint: "This is when TerpPlan read the source, not when UMD updated it.",
    pinnedInstructorHint: "Remove the required section before changing instructors.",
  },
  zh: {
    eyebrow: "马里兰大学 · 学生试用", title: "规划下一学期。", subtitle: "找课程、排进课表，并关注空余名额。",
    find: "找课程", schedule: "排课", watch: "关注余位", search: "搜索课程编号或名称", searchHint: "例如 CMSC131 或 Calculus",
    term: "学期", results: "匹配课程", select: "查看班次", noResults: "暂无匹配结果。请按课程编号或名称搜索。",
    sections: "可选班次", addSchedule: "将整门课程加入排课", courseInPlan: "课程已加入", instructorPick: "保留哪些老师", instructorHint: "点老师名字即可排除他的班次。", keepOne: "至少保留一位老师。", allInstructors: "全部", addWatch: "关注这个班次", scheduleTitle: "我的课表",
    emptySchedule: "请从找课中添加课程，再生成排课方案。", watchesTitle: "余位关注", emptyWatches: "关注一个班次后会显示在这里。",
    refresh: "立即检查", remove: "移除", added: "已将课程加入排课", watched: "已保存余位关注", conflict: "时间冲突",
    noConflict: "没有发现时间冲突", planLimit: "每个排课方案最多添加 10 门课程。", signIn: "登录后即可保存并同步余位关注。", email: "邮箱地址", emailCode: "六位验证码", sendCode: "发送验证码", verifyCode: "验证并登录", codeSent: "验证码已发送，请查收邮箱。",
    emailPrivacy: "邮箱仅用于登录。验证码将在 10 分钟后失效。", wrongCode: "验证码无法验证。", emailSignedIn: "已通过邮箱登录", signOut: "退出登录",
    loading: "加载中…",
    error: "发生错误，请重试。", seats: "个空位", seat: "个空位", fcOnly: "仅限 Freshman Connection", pickCourse: "从匹配结果中选择一门课程，查看它的班次。", waitlist: "候补人数", checked: "上次检查", status: "状态",
    freshness: "余位数据来自 UMD 课程数据，可能晚于学校官方课表。页面打开时最多每分钟检查一次。",
    open: "有空位", full: "已满", unknown: "未知", stale: "上次检查失败 · 显示已保存数据", checking: "检查中…",
    next: "下一步", back: "返回", termFallback: "无法读取学期列表，暂显示 2027 春季", timeUnknown: "部分班次缺少上课时间，无法完整检查冲突。",
    pinSection: "指定此班次", unpinSection: "取消指定", excludeSection: "排课时排除", includeSection: "重新纳入排课",
    keepSection: "请至少保留一个可排班次。", seatReadAt: "余位数据读取于", seatReadHint: "这是 TerpPlan 读取数据的时间，不代表 UMD 更新数据的时间。",
    pinnedInstructorHint: "请先取消指定班次，再修改教师筛选。",
  },
} as const;

function sectionId(section: Section, courseId: string) {
  return String(section.section_id || (section.number ? `${courseId}-${section.number}` : "")).toUpperCase();
}

const termSeasons: Record<string, { en: string; zh: string }> = {
  "01": { en: "Spring", zh: "春季" }, "05": { en: "Summer", zh: "夏季" },
  "08": { en: "Fall", zh: "秋季" }, "12": { en: "Winter", zh: "冬季" },
};

function termLabel(term: string, language: "en" | "zh") {
  const season = termSeasons[term.slice(4)];
  if (!/^\d{6}$/.test(term) || !season) return term;
  const year = Number(term.slice(0, 4)) + (term.slice(4) === "12" ? 1 : 0);
  return language === "en" ? `${season.en} ${year}` : `${year} ${season.zh}`;
}

function dayNames(raw: string | null | undefined) {
  if (!raw) return [];
  const text = raw.toUpperCase().replace(/[^A-Z]/g, "");
  const tokens: [string, string][] = [["TH", "Thu"], ["TU", "Tue"], ["SA", "Sat"], ["SU", "Sun"], ["M", "Mon"], ["W", "Wed"], ["F", "Fri"], ["T", "Tue"]];
  const found: string[] = [];
  for (let i = 0; i < text.length;) {
    const token = tokens.find(([needle]) => text.startsWith(needle, i));
    if (token) { found.push(token[1]); i += token[0].length; } else i += 1;
  }
  return found;
}

function minutes(raw: string | null | undefined): number | null {
  if (!raw || /tba/i.test(raw)) return null;
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})\s*([ap]m)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (match[3]) { if (hour === 12) hour = 0; if (match[3].toLowerCase() === "pm") hour += 12; }
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

const zhDays: Record<string, string> = { Mon: "周一", Tue: "周二", Wed: "周三", Thu: "周四", Fri: "周五", Sat: "周六", Sun: "周日" };

function displayTime(meeting: Meeting, language: "en" | "zh") {
  const start = minutes(meeting.start_time), end = minutes(meeting.end_time), days = dayNames(meeting.days);
  if (start === null || end === null || !days.length || end <= start) return language === "en" ? "Time TBA" : "时间待定";
  const clock = (value: number) => {
    const hour = Math.floor(value / 60), minute = value % 60;
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")}${hour < 12 ? "am" : "pm"}`;
  };
  return `${days.map((day) => language === "zh" ? zhDays[day] ?? day : day).join(" ")} · ${clock(start)}–${clock(end)}`;
}

function count(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return null;
}

export default function Home() {
  const [language, setLanguage] = useState<"en" | "zh">("en");
  const t = copy[language];
  const [step, setStep] = useState<"find" | "schedule" | "watch">("find");
  const [term, setTerm] = useState("202701");
  const [terms, setTerms] = useState<string[]>([]);
  const [termUnavailable, setTermUnavailable] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Course[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Course | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [courseSeatCheckedAt, setCourseSeatCheckedAt] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [planCourses, setPlanCourses] = useState<PlanCourse[]>([]);
  // Instructors left out for the course currently open in the sections panel.
  const [excludedInstructors, setExcludedInstructors] = useState<string[]>([]);
  const [professorRatings, setProfessorRatings] = useState<Record<string, ProfessorSummary>>({});
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const activeCourseRef = useRef("");
  const planCoursesRef = useRef<PlanCourse[]>([]);
  // Plans saved in this browser, one per term; kept in a ref so switching terms can restore them.
  const savedPlansRef = useRef<Record<string, PlanCourse[]>>({});
  const [restored, setRestored] = useState(false);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [alerts, setAlerts] = useState<string[]>([]);
  // Store the message key, not the text, so it re-renders in the new language after a switch.
  const [message, setMessage] = useState<"" | "added" | "watched" | "codeSent">("");
  const [aboutOpen, setAboutOpen] = useState(false);
  const closeAbout = useCallback(() => setAboutOpen(false), []);
  const [error, setError] = useState("");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [authProvider, setAuthProvider] = useState<"email" | null>(null);
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);

  const loadWatches = useCallback(async () => {
    const response = await fetch("/api/watches");
    if (response.status === 401) { setAuthenticated(false); setAuthProvider(null); return; }
    if (!response.ok) throw new Error(t.error);
    const payload = await response.json() as WatchesPayload;
    if (payload.authenticated === false) { setAuthenticated(false); setAuthProvider(null); setWatches([]); return; }
    setAuthenticated(true);
    setAuthProvider("email");
    setWatches(payload.watches ?? []);
  }, [t.error]);

  const switchTerm = useCallback((nextTerm: string) => {
    activeCourseRef.current = "";
    setTerm(nextTerm);
    setSelected(null); setSections([]); setCourseSeatCheckedAt(null); setProfessorRatings({}); setRatingsLoading(false);
    setPlanCourses(savedPlansRef.current[nextTerm] ?? []);
  }, []);

  // Runs once: restore what this browser saved, then load the term list.
  useEffect(() => {
    const restore = window.setTimeout(() => {
      const saved = readSavedState();
      savedPlansRef.current = saved.plans;
      if (saved.language) setLanguage(saved.language);
      if (saved.term) switchTerm(saved.term);
      setRestored(true);
      fetch("/api/terms").then(async (response) => {
        if (!response.ok) throw new Error("terms");
        const payload = await response.json() as TermsPayload;
        const list = payload.terms ?? [];
        setTerms(list);
        // Keep the saved term if it is still offered; otherwise fall back to the current default.
        if (payload.defaultTerm && (!saved.term || !list.includes(saved.term))) switchTerm(payload.defaultTerm);
      }).catch(() => setTermUnavailable(true));
    }, 0);
    return () => window.clearTimeout(restore);
  }, [switchTerm]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => loadWatches().catch(() => setError(t.error)), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadWatches, t.error]);

  // Save after every change, but only once the saved state has been restored so it is not overwritten.
  useEffect(() => {
    if (!restored) return;
    savedPlansRef.current = { ...savedPlansRef.current, [term]: planCourses };
    writeSavedState({ language, term, plans: savedPlansRef.current });
  }, [restored, language, term, planCourses]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    const timeout = window.setTimeout(async () => {
      setSearching(true); setError("");
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(text)}&term=${encodeURIComponent(term)}`);
        const payload = await response.json() as SearchPayload;
        if (!response.ok) throw new Error(payload.error || t.error);
        setResults(payload.results ?? []);
      } catch (cause) { setError(cause instanceof Error ? cause.message : t.error); setResults([]); }
      finally { setSearching(false); }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [query, term, t.error]);

  const openCourse = async (course: Course) => {
    const courseRequestKey = term + "|" + course.course_id;
    activeCourseRef.current = courseRequestKey;
    setSelected(course); setSections([]); setCourseSeatCheckedAt(null); setLoadingDetail(true); setError(""); setMessage(""); setProfessorRatings({});
    setExcludedInstructors([]);
    setRatingsLoading(false);
    try {
      const response = await fetch(`/api/course?id=${encodeURIComponent(course.course_id)}&term=${encodeURIComponent(term)}`);
      const payload = await response.json() as CoursePayload;
      if (!response.ok) throw new Error(payload.error || t.error);
      if (activeCourseRef.current !== courseRequestKey) return;
      setCourseSeatCheckedAt(payload.seatCheckedAt ?? null);
      setSections([...(payload.sections ?? [])].sort((a: Section, b: Section) => sectionId(a, course.course_id).localeCompare(sectionId(b, course.course_id), "en", { numeric: true })));
      const names = [...new Set((payload.sections ?? []).flatMap((section: Section) => section.instructors ?? []))];
      // Reopening a course that is already in the plan restores the instructors picked for it.
      const kept = planCoursesRef.current.find((item) => item.courseId === course.course_id)?.instructors;
      setExcludedInstructors(kept ? names.filter((name) => !kept.includes(name)) : []);
      if (names.length) {
        setRatingsLoading(true);
        void fetch("/api/professor-ratings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ names }),
        }).then(async (ratingsResponse) => {
          const ratingPayload = await ratingsResponse.json() as RatingsPayload;
          if (!ratingsResponse.ok) throw new Error("ratings");
          if (activeCourseRef.current === courseRequestKey) setProfessorRatings(ratingPayload.ratings ?? {});
        }).catch(() => {
          if (activeCourseRef.current === courseRequestKey) setProfessorRatings({});
        }).finally(() => {
          if (activeCourseRef.current === courseRequestKey) setRatingsLoading(false);
        });
      }
    } catch (cause) {
      if (activeCourseRef.current === courseRequestKey) setError(cause instanceof Error ? cause.message : t.error);
    }
    finally { if (activeCourseRef.current === courseRequestKey) setLoadingDetail(false); }
  };

  const courseInstructors = [...new Set(sections.flatMap((section) => section.instructors ?? []))].sort((a, b) => a.localeCompare(b));
  const keptInstructors = courseInstructors.filter((name) => !excludedInstructors.includes(name));
  const selectedPlan = planCourses.find((item) => item.courseId === selected?.course_id);
  const instructorFilter = excludedInstructors.length ? keptInstructors : undefined;
  const visibleSections = excludedInstructors.length
    ? sections.filter((section) => (section.instructors ?? []).some((name) => keptInstructors.includes(name)))
    : sections;

  const toggleInstructor = (name: string) => {
    if (selectedPlan?.pinnedSectionId) { setError(t.pinnedInstructorHint); return; }
    const next = excludedInstructors.includes(name) ? excludedInstructors.filter((item) => item !== name) : [...excludedInstructors, name];
    if (next.length >= courseInstructors.length) { setError(t.keepOne); return; }
    setError("");
    setExcludedInstructors(next);
    const kept = next.length ? courseInstructors.filter((item) => !next.includes(item)) : undefined;
    if (selected) setPlanCourses((current) => current.map((item) => item.courseId === selected.course_id ? { ...item, instructors: kept } : item));
  };

  useEffect(() => { planCoursesRef.current = planCourses; }, [planCourses]);

  const addToSchedule = (course: Course) => {
    if (planCourses.some((item) => item.courseId === course.course_id)) {
      setStep("schedule");
      return;
    }
    if (planCourses.length >= 10) {
      setError(t.planLimit);
      setStep("schedule");
      return;
    }
    setPlanCourses((current) => [...current, { courseId: course.course_id, courseTitle: course.name, instructors: instructorFilter }]);
    setMessage("added"); setStep("schedule");
  };

  const chooseSection = (course: Course, id: string, action: "pin" | "exclude") => {
    const existing = planCourses.find((item) => item.courseId === course.course_id);
    if (!existing && planCourses.length >= 10) { setError(t.planLimit); return; }
    const plan = existing ?? { courseId: course.course_id, courseTitle: course.name, instructors: instructorFilter };
    const pinnedSectionId = action === "pin" ? (plan.pinnedSectionId === id ? undefined : id) : (plan.pinnedSectionId === id ? undefined : plan.pinnedSectionId);
    const excludedSectionIds = action === "exclude"
      ? plan.excludedSectionIds?.includes(id) ? plan.excludedSectionIds.filter((item) => item !== id) : [...(plan.excludedSectionIds ?? []), id]
      : (plan.excludedSectionIds ?? []).filter((item) => item !== id);
    if (!pinnedSectionId && sections.length > 0 && sections.every((section) => excludedSectionIds.includes(sectionId(section, course.course_id)))) {
      setError(t.keepSection);
      return;
    }
    const next = { ...plan, pinnedSectionId, excludedSectionIds, ...(pinnedSectionId ? { instructors: undefined } : {}) };
    setPlanCourses((current) => existing ? current.map((item) => item.courseId === course.course_id ? next : item) : [...current, next]);
    if (pinnedSectionId) setExcludedInstructors([]);
    setError("");
    setMessage("added");
  };

  const addWatch = async (course: Course, section: Section) => {
    setError("");
    try {
      const response = await fetch("/api/watches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId: course.course_id, term, sectionId: sectionId(section, course.course_id) }) });
      const payload = await response.json() as ApiError;
      if (response.status === 401) { setAuthenticated(false); setAuthProvider(null); setStep("watch"); return; }
      if (!response.ok) throw new Error(payload.error || t.error);
      setMessage("watched"); setStep("watch"); await loadWatches();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.error); }
  };

  const requestEmailCode = async () => {
    setError(""); setMessage(""); setAuthBusy(true);
    try {
      const response = await fetch("/api/auth/request-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const payload = await response.json() as ApiError;
      if (!response.ok) throw new Error(payload.error || t.error);
      setCodeSent(true); setMessage("codeSent");
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.error); }
    finally { setAuthBusy(false); }
  };

  const verifyEmailCode = async () => {
    setError(""); setMessage(""); setAuthBusy(true);
    try {
      const response = await fetch("/api/auth/verify-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code: emailCode }) });
      const payload = await response.json() as ApiError;
      if (!response.ok) throw new Error(payload.error || t.wrongCode);
      setAuthenticated(true); setAuthProvider("email"); setEmailCode("");
      await loadWatches();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.wrongCode); }
    finally { setAuthBusy(false); }
  };

  const signOutEmail = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setWatches([]); setAlerts([]); setEmailCode(""); setCodeSent(false);
    await loadWatches();
  };

  const removeWatch = async (watch: Watch) => {
    const params = new URLSearchParams({ term: watch.term, section: watch.sectionId });
    const response = await fetch(`/api/watches?${params}`, { method: "DELETE" });
    if (!response.ok) { setError(t.error); return; }
    setWatches((current) => current.filter((item) => !(item.term === watch.term && item.sectionId === watch.sectionId)));
  };

  const refreshWatches = useCallback(async () => {
    if (checkingRef.current || !watches.length) return;
    checkingRef.current = true; setChecking(true); setError("");
    try {
      const response = await fetch("/api/watches/check", { method: "POST" });
      const payload = await response.json() as CheckPayload;
      if (response.status === 401) { setAuthenticated(false); setAuthProvider(null); return; }
      if (!response.ok) throw new Error(payload.error || t.error);
      setWatches(payload.watches ?? []);
      setAlerts((payload.alerts ?? []).map((item: { courseId: string; sectionId: string }) => `${item.courseId} ${item.sectionId}`));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.error); }
    finally { checkingRef.current = false; setChecking(false); }
  }, [t.error, watches.length]);

  useEffect(() => {
    if (step !== "watch" || !watches.length) return;
    const initialCheck = window.setTimeout(() => void refreshWatches(), 0);
    const interval = window.setInterval(() => void refreshWatches(), 60_000);
    return () => { window.clearTimeout(initialCheck); window.clearInterval(interval); };
  }, [step, watches.length, refreshWatches]);

  const formatMeetings = (meetings: Meeting[] | undefined) => meetings?.length ? meetings.map((meeting) => displayTime(meeting, language)).join(" · ") : language === "en" ? "Time TBA" : "时间待定";
  const seatLabel = (value: number | string | null | undefined) => {
    const open = count(value);
    if (open === null) return t.unknown;
    if (open === 0) return t.full;
    return `${open} ${open === 1 ? t.seat : t.seats}`;
  };

  return (
    <main className="min-h-screen bg-[#f5f3ef] text-[#202728]">
      <header className="border-b border-[#dedbd3] bg-[#fbfaf8]"><div className="mx-auto flex max-w-[1320px] items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2"><a href="#top" className="flex items-center gap-3 font-semibold tracking-tight"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#bd302f] font-serif text-lg text-white">T</span><span>TerpPlan</span><span className="hidden rounded-full border border-[#e5c9bd] px-2 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#8d4333] sm:inline">Student pilot</span></a>
          <button onClick={() => setAboutOpen(true)} className="ml-1 rounded-lg px-2.5 py-2 text-xs font-medium text-[#59635f] hover:bg-[#eeece6]">{language === "en" ? "About" : "关于"}</button></div>
        <div className="flex items-center gap-3"><span className="hidden text-xs text-[#707674] sm:inline">{t.eyebrow}</span><button onClick={() => setLanguage(language === "en" ? "zh" : "en")} className="rounded-lg border border-[#dcd9d0] px-3 py-2 text-xs font-medium hover:bg-white">{language === "en" ? "中文" : "English"}</button></div>
      </div></header>
      {aboutOpen && <AboutDialog language={language} onClose={closeAbout} />}

      <div id="top" className="mx-auto max-w-[1320px] px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="mb-3 text-[11px] font-semibold uppercase tracking-[.17em] text-[#a34a39]">{t.eyebrow}</p><h1 className="font-serif text-4xl leading-tight tracking-[-.03em] sm:text-5xl">{t.title}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#646d69]">{t.subtitle}</p></div>
          <nav aria-label="Planning steps" className="flex flex-wrap gap-2 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-2">{(["find", "schedule", "watch"] as const).map((item, index) => <button key={item} onClick={() => setStep(item)} aria-current={step === item ? "step" : undefined} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${step === item ? "bg-[#273c38] text-white" : "text-[#68716e] hover:bg-[#eeece6]"}`}><span className="grid h-5 w-5 place-items-center rounded-full bg-white/15 text-[10px]">0{index + 1}</span>{t[item]}</button>)}</nav>
        </div>

        {termUnavailable && <p className="mb-4 rounded-xl border border-[#ead8b5] bg-[#fff8e8] px-4 py-3 text-sm text-[#745424]">{t.termFallback}</p>}
        {message && <p role="status" className="mb-4 rounded-xl border border-[#bfd4c6] bg-[#edf6ef] px-4 py-3 text-sm text-[#315c43]">{t[message]}</p>}
        {error && <p role="alert" className="mb-4 rounded-xl border border-[#e7c6bf] bg-[#fff0ec] px-4 py-3 text-sm text-[#8c352c]">{error}</p>}

        {step === "find" && <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(330px,.85fr)]">
          <div className="rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5 sm:p-7"><div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.13em] text-[#9a5040]">01 · {t.find}</p><h2 className="mt-2 font-serif text-2xl">{t.results}</h2></div><label className="grid gap-1 text-xs text-[#737b77]">{t.term}<select value={term} onChange={(event) => switchTerm(event.target.value)} className="min-w-36 rounded-lg border border-[#dedbd3] bg-white px-3 py-2 text-sm text-[#202728]">{(terms.length ? terms : [term]).map((item) => <option key={item} value={item}>{termLabel(item, language)}</option>)}</select></label></div>
            <label className="block"><span className="sr-only">{t.search}</span><div className="flex items-center gap-3 rounded-xl border border-[#d9d6ce] bg-white px-4 py-3 focus-within:border-[#a34a39] focus-within:ring-2 focus-within:ring-[#a34a39]/10"><span aria-hidden="true" className="text-lg text-[#8a928e]">⌕</span><input value={query} onChange={(event) => { setQuery(event.target.value); if (event.target.value.trim().length < 2) setResults([]); }} placeholder={t.searchHint} className="w-full bg-transparent text-sm outline-none placeholder:text-[#a0a6a2]" /></div></label>
            <div className="mt-4 divide-y divide-[#ece9e2]">{searching && <p className="py-5 text-sm text-[#737b77]">{t.loading}</p>}{!searching && query.trim().length >= 2 && !results.length && !error && <p className="py-5 text-sm text-[#737b77]">{t.noResults}</p>}
              {results.map((course) => <button key={course.course_id} onClick={() => void openCourse(course)} className={`flex w-full items-center justify-between gap-4 py-4 text-left hover:bg-[#f6f4ef] ${selected?.course_id === course.course_id ? "text-[#9a372f]" : ""}`}><span><span className="block text-sm font-semibold">{course.course_id}<span className="ml-2 font-normal text-[#606966]">{course.name}</span></span><span className="mt-1 block text-xs text-[#89908c]">{course.department ?? course.course_id.slice(0, 4)}</span></span><span className="shrink-0 text-xs font-medium text-[#a34a39]">{t.select} →</span></button>)}
            </div>
          </div>
          <div className="rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5 sm:p-7"><div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[.13em] text-[#9a5040]">{selected ? `${selected.course_id} · ${termLabel(term, language)}` : `02 · ${t.sections}`}</p><h2 className="mt-2 font-serif text-2xl">{selected?.name ?? t.sections}</h2>{selected && sections.length > 0 && <button onClick={() => addToSchedule(selected)} disabled={planCourses.some((item) => item.courseId === selected.course_id)} className="mt-4 rounded-lg bg-[#273c38] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d302c] disabled:cursor-default disabled:opacity-60">{planCourses.some((item) => item.courseId === selected.course_id) ? t.courseInPlan : t.addSchedule}</button>}
              {selected && courseInstructors.length > 1 && <div className="mt-4"><p className="text-xs font-medium text-[#68716e]">{t.instructorPick} <span className="font-normal text-[#8a918e]">· {excludedInstructors.length ? `${keptInstructors.length}/${courseInstructors.length}` : t.allInstructors}</span></p><div className="mt-2 flex flex-wrap gap-2">{courseInstructors.map((name) => { const kept = !excludedInstructors.includes(name); return <button key={name} type="button" onClick={() => toggleInstructor(name)} disabled={Boolean(selectedPlan?.pinnedSectionId)} aria-pressed={kept} className={`rounded-full border px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${kept ? "border-[#536d64] bg-[#edf3ef] font-medium text-[#24312d]" : "border-[#e0ddd5] bg-white text-[#9aa19d] line-through"}`}>{kept ? "✓ " : ""}{name}</button>; })}</div><p className="mt-2 text-[11px] text-[#8a918e]">{selectedPlan?.pinnedSectionId ? t.pinnedInstructorHint : t.instructorHint}</p></div>}</div>
            {!selected && <p className="rounded-xl bg-[#f2f0eb] p-4 text-sm leading-6 text-[#717975]">{results.length ? t.pickCourse : t.noResults}</p>}{loadingDetail && <p className="py-8 text-sm text-[#737b77]">{t.loading}</p>}
            {selected && !loadingDetail && !sections.length && !error && <p className="rounded-xl bg-[#f2f0eb] p-4 text-sm text-[#717975]">{language === "en" ? "No sections listed for this term." : "本学期没有列出班次。"}</p>}
            <div className="space-y-3">{visibleSections.map((section) => {
              const id = sectionId(section, selected?.course_id ?? "");
              const watching = watches.some((item) => item.sectionId === id && item.term === term);
              const open = count(section.open_seats);
              const plan = planCourses.find((item) => item.courseId === selected?.course_id);
              const pinned = plan?.pinnedSectionId === id;
              const excluded = plan?.excludedSectionIds?.includes(id) ?? false;
              return <article key={id} className={`rounded-xl border bg-white p-4 ${pinned ? "border-[#536d64] ring-1 ring-[#536d64]/20" : excluded ? "border-[#e7e4dc] opacity-70" : "border-[#e7e4dc]"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="font-semibold">{id}{/-FC[A-Z0-9]*$/.test(id) && <span className="ml-2 rounded-full bg-[#f3ecdc] px-2 py-0.5 align-middle text-[10px] font-semibold text-[#7a5a24]">{t.fcOnly}</span>}</h3><p className="mt-1 text-xs text-[#626c67]">{formatMeetings(section.meetings)}</p>{section.instructors?.length ? <SectionProfessors names={section.instructors} courseId={selected?.course_id ?? ""} ratings={professorRatings} ratingsLoading={ratingsLoading} language={language} /> : null}</div>
                  <div className="text-right"><span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${open === null ? "bg-[#f1efe9] text-[#68716e]" : open > 0 ? "bg-[#eaf4ec] text-[#367047]" : "bg-[#f5e9e5] text-[#8f4538]"}`}>{seatLabel(section.open_seats)}</span></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => selected && chooseSection(selected, id, "pin")} aria-pressed={pinned} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${pinned ? "border-[#536d64] bg-[#edf3ef] text-[#24312d]" : "border-[#d9d6ce] text-[#48534f] hover:bg-[#f7f5f0]"}`}>{pinned ? t.unpinSection : t.pinSection}</button>
                  <button onClick={() => selected && chooseSection(selected, id, "exclude")} aria-pressed={excluded} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${excluded ? "border-[#cfaea5] bg-[#f9efec] text-[#8f4538]" : "border-[#d9d6ce] text-[#48534f] hover:bg-[#f7f5f0]"}`}>{excluded ? t.includeSection : t.excludeSection}</button>
                  <button onClick={() => selected && void addWatch(selected, section)} disabled={watching} className="rounded-lg border border-[#d9d6ce] px-3 py-2 text-xs font-semibold text-[#48534f] hover:bg-[#f7f5f0] disabled:cursor-default disabled:opacity-50">{watching ? (language === "en" ? "Watching" : "已关注") : t.addWatch}</button>
                </div>
              </article>;
            })}</div>
            {sections.length > 0 && formatSeatReadTime(courseSeatCheckedAt, language) && <p className="mt-4 text-xs text-[#707874]">{t.seatReadAt}: <time dateTime={courseSeatCheckedAt ?? undefined}>{formatSeatReadTime(courseSeatCheckedAt, language)}</time></p>}
            {sections.length > 0 && <p className="mt-2 text-xs leading-5 text-[#858d89]">{t.seatReadHint}</p>}
            <p className="mt-5 border-t border-[#ece9e2] pt-4 text-xs leading-5 text-[#858d89]">{t.freshness}</p>
          </div>
        </section>}

        {step === "schedule" && <SchedulePlanner courses={planCourses} term={term} language={language} onRemove={(courseId) => setPlanCourses((current) => current.filter((course) => course.courseId !== courseId))} onBack={() => setStep("find")} />}

        {step === "watch" && <section className="mx-auto max-w-4xl rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.13em] text-[#9a5040]">03 · {t.watch}</p><h2 className="mt-2 font-serif text-3xl">{t.watchesTitle}</h2></div><button onClick={() => void refreshWatches()} disabled={checking || !watches.length} className="rounded-lg bg-[#273c38] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{checking ? t.checking : t.refresh}</button></div>
          {authenticated === false && <div className="mt-6 rounded-xl border border-[#e3dfd6] bg-white p-5"><p className="text-sm font-medium">{t.signIn}</p><label className="mt-4 grid gap-1.5 text-xs font-medium text-[#68716e]">{t.email}<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-lg border border-[#dedbd3] bg-white px-3 py-2.5 text-sm text-[#202728] outline-none focus:border-[#a34a39]" /></label>{codeSent && <label className="mt-3 grid gap-1.5 text-xs font-medium text-[#68716e]">{t.emailCode}<input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))} className="rounded-lg border border-[#dedbd3] bg-white px-3 py-2.5 text-sm tracking-[.2em] text-[#202728] outline-none focus:border-[#a34a39]" /></label>}<p className="mt-2 text-xs leading-5 text-[#858d89]">{t.emailPrivacy}</p><div className="mt-4 flex flex-wrap gap-2">{!codeSent ? <button onClick={() => void requestEmailCode()} disabled={authBusy || !email.trim()} className="rounded-lg bg-[#273c38] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{authBusy ? t.loading : t.sendCode}</button> : <><button onClick={() => void verifyEmailCode()} disabled={authBusy || emailCode.length !== 6} className="rounded-lg bg-[#273c38] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{authBusy ? t.loading : t.verifyCode}</button><button onClick={() => void requestEmailCode()} disabled={authBusy} className="rounded-lg border border-[#dedbd3] px-4 py-2.5 text-sm font-medium text-[#68716e] disabled:opacity-50">{t.sendCode}</button></>}</div></div>}
          {authenticated === true && authProvider === "email" && <div className="mt-6 flex items-center justify-between rounded-xl border border-[#e3dfd6] bg-white px-4 py-3"><span className="text-xs text-[#68716e]">{t.emailSignedIn}</span><button onClick={() => void signOutEmail()} className="text-xs font-medium text-[#8b5148] hover:underline">{t.signOut}</button></div>}
          {authenticated !== false && !watches.length && <p className="mt-6 rounded-xl bg-[#f2f0eb] p-5 text-sm text-[#717975]">{t.emptyWatches}</p>}{alerts.length > 0 && <div role="status" className="mt-5 rounded-xl border border-[#bdd4c1] bg-[#edf6ef] p-4 text-sm font-semibold text-[#315c43]">{language === "en" ? "Seats opened: " : "发现空位："}{alerts.join(", ")}</div>}
          {watches.length > 0 && <div className="mt-5 space-y-3">{watches.map((watch) => <article key={`${watch.term}-${watch.sectionId}`} className="rounded-xl border border-[#e3e0d8] bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-semibold">{watch.courseId} · {watch.courseTitle}</p><p className="mt-1 text-sm text-[#626c67]">{watch.sectionId} <span className="mx-1 text-[#b5bab6]">/</span> {formatMeetings(watch.meetings)}</p><p className="mt-2 text-xs text-[#8a918e]">{t.seatReadAt}: {formatSeatReadTime(watch.lastSuccessAt, language) ?? t.unknown}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${watch.status === "ok" && (watch.openSeats ?? 0) > 0 ? "bg-[#eaf4ec] text-[#367047]" : watch.status === "stale" || watch.status === "failed" ? "bg-[#fff0ec] text-[#8c352c]" : "bg-[#f1efe9] text-[#68716e]"}`}>{watch.status === "stale" || watch.status === "failed" ? t.stale : watch.openSeats === null ? t.unknown : watch.openSeats > 0 ? t.open : t.full}</span><button onClick={() => void removeWatch(watch)} className="text-xs font-medium text-[#8b5148] hover:underline">{t.remove}</button></div></div><div className="mt-3 text-xs text-[#707874]">{t.status}: {seatLabel(watch.openSeats)}{watch.waitlist !== null ? ` · ${t.waitlist}: ${watch.waitlist}` : ""}</div></article>)}</div>}
          {watches.length > 0 && <p className="mt-3 text-xs leading-5 text-[#858d89]">{t.seatReadHint}</p>}
          <p className="mt-5 border-t border-[#ece9e2] pt-4 text-xs leading-5 text-[#858d89]">{t.freshness}</p>
        </section>}
      </div>
    </main>
  );
}
