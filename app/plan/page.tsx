"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDocumentLanguage } from "@/lib/document-language";
import AboutDialog from "@/app/components/about-dialog";
import CourseRequirements, { type CourseRequirement } from "@/app/components/course-requirements";
import GenEdFinder, { type ReferenceSchedule } from "@/app/components/gened-finder";
import { isAsyncOnline } from "@/lib/meeting-time";
import { GEN_ED_CATEGORIES } from "@/lib/gened-categories";
import { creditMeter, creditRange, creditWarning, formatCreditTotal, totalPlanCredits, type CreditRange } from "@/lib/plan-credits";
import { planKey } from "@/lib/plan-key";
import { courseSet, describeRequirement, unmetRequirements } from "@/lib/prereq-check";
import { minimumCredits } from "@/lib/credit-standing";
import type { PrereqNode } from "@/lib/programs";
import { readTaken, TAKEN_EVENT, TAKEN_KEY, type TakenCourses } from "@/lib/taken-courses";
import { scheduleFit, type ScheduleFit } from "@/lib/result-filters";
import TakenCoursesEditor from "@/app/components/taken-courses";
import { SeasonNote, useOfferingSeasons } from "@/app/components/season-note";
import type { SeatSummary } from "@/lib/seat-summary";
import { filterResults, filtersActive, NO_FILTERS, sortResults, type CreditFilter, type ResultFilters, type ResultSort } from "@/lib/result-filters";
import SchedulePlanner from "@/app/components/schedule-planner";
import SeatEmailToggle from "@/app/components/seat-email-toggle";
import SectionProfessors from "@/app/components/section-professors";
import type { ProfessorSummary } from "@/lib/planetterp";
import { roomLabel } from "@/lib/room";
import { readSavedState, STORAGE_KEY, swapPlans, writeSavedState } from "@/lib/saved-state";
import { enterDemo, isDemo, leaveDemo, startDemoFromUrl, storageKey } from "@/lib/demo";
import { PERSONAL_KEYS } from "@/lib/plan-sync";
import { fittingSections, openingPath, parseOpening, scheduleWithout, type Opening } from "@/lib/seat-swap";
import { PlanSync } from "@/app/components/plan-sync";
import { OpeningCheck } from "@/app/components/opening-check";
import { RegistrationDayLink } from "@/app/components/registration-day-link";
import { formatSeatReadTime } from "@/lib/seat-time";
import { courseSearchView, startCourseSearch, type CourseSearchState } from "@/lib/course-search";
import { groupSections, ownMeetings } from "@/lib/section-groups";
import { reportDetails } from "@/lib/report-link";
import { openFeedback } from "@/lib/feedback";
import { applyTransfer, decodeTransfer, encodeTransfer, TRANSFER_PREFIX, transferCourseCount, type Transfer } from "@/lib/device-transfer";
import { CourseTrends } from "@/app/components/course-trends";
import { PopularCourses } from "@/app/components/popular-courses";
import { useTypingPlaceholder } from "@/app/components/typing-placeholder";
import { GenEdTags } from "@/app/components/gened-tags";
import { countUse } from "@/lib/usage";

type Course = { course_id: string; name: string; department?: string; credits?: string; ge?: string[][] };
type Meeting = { days?: string | null; start_time?: string | null; end_time?: string | null; building?: string | null; room?: string | null };
type Section = {
  section_id?: string;
  number?: string;
  seats?: string | number | null;
  open_seats?: string | number | null;
  waitlist?: string | number | null;
  holdfile?: string | number | null;
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
type ApiError = { error?: string; code?: string };
type WatchesPayload = ApiError & { authenticated?: boolean; watches?: Watch[] };
type TermsPayload = { terms?: string[]; defaultTerm?: string };
type SearchPayload = ApiError & { results?: Course[] };
type CoursePayload = ApiError & { sections?: Section[]; seatCheckedAt?: string; course?: { credits?: unknown; max_credits?: unknown; requirements?: CourseRequirement[]; description?: string | null; genEdGroups?: string[][] } };
type RatingsPayload = { ratings?: Record<string, ProfessorSummary> };
type CheckPayload = ApiError & { watches?: Watch[]; alerts?: { courseId: string; sectionId: string }[] };

const copy = {
  en: {
    eyebrow: "UNIVERSITY OF MARYLAND · STUDENT PILOT", title: "Plan your next semester",
    subtitle: "Find a course, build a schedule, and keep an eye on open seats.", find: "Find a course",
    schedule: "Build a schedule", watch: "Watch seats", search: "Search course code or title",
    searchHint: "e.g. ", term: "Term", results: "Course matches", select: "View sections",
    quickAdd: "Add", inPlanShort: "In plan", searchMode: "Search courses", genEdMode: "Find by Gen Ed", noResults: "No matches yet. Search by a course code or title.", notOffered: "{course} is not offered in {term}. It may be offered in another term — try switching the term above.", sections: "Sections", addSchedule: "Add this course to plan", courseInPlan: "Course in plan", instructorPick: "Instructors to keep", instructorHint: "Tap a name to leave out that instructor's sections.", keepOne: "Keep at least one instructor.", allInstructors: "All",
    addWatch: "Watch this section", watchShort: "Watch", watchingShort: "Watching", scheduleTitle: "Your schedule", emptySchedule: "Add courses from search to generate schedule options.",
    watchesTitle: "Seat watches", watchCadence: "With email alerts on, TerpPlan checks your watched sections about every 10 minutes (sometimes later at busy times) and emails you when a full section opens. A seat can fill again before you read the email, so register in Testudo right away.", emptyWatches: "Watch a section to see it here.", refresh: "Check now", remove: "Remove",
    added: "Course added to plan", addedNeeds: "Added, but its prerequisite is not met yet: {needs}", addedAskTaken: "This course has a prerequisite. Add the courses you've taken (under \"Courses in your plan\") and TerpPlan will check it for you.", watched: "Seat watch saved", conflict: "Time conflict", noConflict: "No time conflicts found", planLimit: "A plan can include up to 10 courses.",
    signIn: "Sign in to save and sync your seat watches.", email: "Email address", emailCode: "Six-digit code", sendCode: "Email me a code", verifyCode: "Verify and sign in", codeSent: "Code sent. Check your inbox.", resendIn: "Resend in {s}s", resendCode: "Resend code", codeSpam: "Not in your inbox? Look in Spam or Junk for an email from TerpPlan and mark it \"Not spam\", so seat alerts reach your inbox too.",
    watchLimit: "You can watch up to 10 courses (40 sections). Remove one to add another.", watchAll: "Watch all {n} sections", watchingAll: "Watching all {n} sections", watchAllHint: "One email when any of them opens. Untick instructors above to leave theirs out.", watchAllTooMany: "{n} sections is more than 20. Untick instructors above to watch fewer at once.", watchGroup: "Watching {n} sections", watchGroupOpen: "{k} open", removeAll: "Remove all", emailPrivacy: "Your address is used to sign you in. Codes expire after 10 minutes. Once you sign in, your plans, preferences (personal commitments included) and courses taken are kept in your account, so they open on any device you sign in on.", syncNote: "Your plans, preferences and courses taken are synced to this account.", syncDelete: "Delete synced data and sign out", syncDeleteConfirm: "Delete the plan saved in your account and sign out? This device keeps its copy. Another device that is still signed in will save its plan to the account again.", syncDeleteFailed: "The synced copy could not be deleted. Try again.", wrongCode: "That code could not be verified.", emailSignedIn: "Signed in with email", signOut: "Sign out", signOutClear: "Sign out and clear this device", signOutClearConfirm: "Sign out and remove your plans, personal commitments, courses taken and registration times from this browser? Your account keeps its copy.",
    loading: "Loading…", error: "Something went wrong. Please try again.",
    resultFull: "Full", resultNoSections: "No sections", resultSeatsUnknown: "Seats unknown",
    filterOpen: "Open seats", filterFits: "Fits my schedule", filterFitsNeedPlan: "Generate a schedule in step 02 first; this checks each course against it and your personal commitments.", fitSome: "{n} sections fit your schedule", fitNone: "Every section clashes with your schedule", fitTba: "Times not listed; can't check", filterPrereqs: "Prerequisites met", filterPrereqsNeedTaken: "Add the courses you've taken (above) to use this filter.", filterCredits: "Credits", filterAny: "Any", filterShowing: "Showing {n} of {m}", filterNone: "No matches with these filters.", filterClear: "Clear filters", sortLabel: "Sort", sortMatch: "Best match", sortSeats: "Most open seats", sortGpa: "Highest avg GPA", sortCredits: "Fewest credits", sortGpaShort: "avg GPA", sortGpaHint: "Historical average GPA from PlanetTerp, across every past term and instructor.", sortLoading: "Sorting as the numbers load…", showMore: "Show {n} more ({m} left)", reportCourse: "Something wrong with this course's information? Report it", planName: "Plan {x}", planSwitch: "Plan A or Plan B for this term", planCopy: "Copy this plan to Plan {x}", planHint: "Keep a backup plan for this term. Each plan has its own courses; preferences are shared.", transferButton: "Continue on another device", transferCopied: "Link copied. Open it on your other device, for example by emailing or messaging it to yourself.", transferReady: "Copy this link and open it on your other device.", transferPrivacy: "It carries your plans, schedule preferences and courses taken, but not the names of personal events. Anyone with the link can see them.", transferTitle: "Plan from another device", transferBody: "This link has {courses} planned courses{taken}. Load them here? This replaces the plan saved in this browser.", transferTaken: " and {n} courses taken", transferLoad: "Load plan", transferDismiss: "Not now", transferInvalid: "This transfer link is incomplete or damaged. Make a new one on the other device.", resultsCapped: "Showing the first {n} matches. Type more of the course code or title to narrow the search.",
    prereqNeeds: "Prerequisite not met yet: {needs}", prereqMet: "Prerequisites met by the courses you've taken.", prereqAddTaken: "Add the courses you've taken (at the top of the page) to check this prerequisite.", prereqOrHigher: " or higher", prereqSameTerm: " (same term OK)", prereqOf: "{k} of", creditNeed: "{n} credits completed (you'll have {have})", creditUnknown: "This course needs {n} completed credits. Enter your credits with the courses you've taken (top of the page) to check.", creditShort: "Needs {n} completed credits; you'll have {have} by next term.", creditMet: "Needs {n} completed credits; you'll have {have}.",
    seats: "seats open", seat: "seat open", credit: "credit", creditsUnit: "credits", openOf: "{n} / {total} open", waitlisted: "{n} waitlisted", holdfiled: "{n} on hold file", fullNoWaitlist: "Full · nobody waitlisted yet", groupSections: "{n} sections", groupShared: "Every section meets", groupOwn: "Each section adds", groupOpenIn: "across {n} sections", fcOnly: "Freshman Connection only", pickCourse: "Pick a course from the matches to see its sections.", waitlist: "waitlist", checked: "Last checked", status: "Status", freshness: "Seat counts come from UMD course data and may lag the official Schedule of Classes. This page checks at most once a minute while open.",
    open: "Seats available", full: "Full", unknown: "Unknown", stale: "Last check failed · showing saved count", checking: "Checking…",
    next: "Next step", back: "Back", termFallback: "Term list unavailable — showing Spring 2027",
    timeUnknown: "Some meeting times are missing, so the conflict check is incomplete.",
    pinSection: "Require this section", unpinSection: "Remove requirement", pinShort: "Require", unpinShort: "Required ✓", excludeSection: "Exclude from schedules", includeSection: "Allow in schedules", excludeShort: "Exclude", includeShort: "Allow",
    keepSection: "Keep at least one section available.", seatReadAt: "Seat data read", seatReadHint: "“Seat data read” is when TerpPlan read the source, not when UMD updated it.",
    pinnedInstructorHint: "Remove the required section before changing instructors.",
    selectedCourses: "Courses in your plan", noSelectedCourses: "No courses added for this term yet.",
  },
  zh: {
    eyebrow: "马里兰大学 · 学生试用", title: "规划下一学期", subtitle: "找课程、排进课表，并关注空余名额。",
    find: "找课程", schedule: "排课", watch: "关注余位", search: "搜索课程编号或名称", searchHint: "例如 ",
    term: "学期", results: "匹配课程", select: "查看班次", quickAdd: "加入", inPlanShort: "已加入", searchMode: "搜索课程", genEdMode: "按 Gen Ed 查找", noResults: "暂无匹配结果。请按课程编号或名称搜索。", notOffered: "{term}没有开设 {course}。这门课可能在其他学期开设，可以在上方切换学期查看。",
    sections: "可选班次", addSchedule: "将整门课程加入排课", courseInPlan: "课程已加入", instructorPick: "保留哪些老师", instructorHint: "点老师名字即可排除他的班次。", keepOne: "至少保留一位老师。", allInstructors: "全部", addWatch: "关注这个班次", watchShort: "关注", watchingShort: "已关注", scheduleTitle: "我的课表",
    emptySchedule: "请从找课中添加课程，再生成排课方案。", watchesTitle: "余位关注", watchCadence: "开通邮件提醒后，TerpPlan 大约每 10 分钟检查一次你关注的班次（高峰时可能更晚），满员的班次一有空位就发邮件。空位可能在你看到邮件前又被抢走，收到后请尽快去 Testudo 注册。", emptyWatches: "关注一个班次后会显示在这里。",
    refresh: "立即检查", remove: "移除", added: "已将课程加入排课", addedNeeds: "已加入，但先修课还没满足：{needs}", addedAskTaken: "这门课有先修要求。在“已选课程”里填写你修过的课程，TerpPlan 就能帮你检查。", watched: "已保存余位关注", conflict: "时间冲突",
    noConflict: "没有发现时间冲突", planLimit: "每个排课方案最多添加 10 门课程。", signIn: "登录后即可保存并同步余位关注。", email: "邮箱地址", emailCode: "六位验证码", sendCode: "发送验证码", verifyCode: "验证并登录", codeSent: "验证码已发送，请查收邮箱。", resendIn: "{s} 秒后可重新发送", resendCode: "重新发送", codeSpam: "收件箱里没有？去垃圾邮件文件夹找 TerpPlan 发来的邮件，并标记为“不是垃圾邮件”，这样之后的余位提醒也能正常收到。",
    watchLimit: "最多可以关注 10 门课（共 40 个班次），请先移除一些再添加。", watchAll: "关注全部 {n} 个班次", watchingAll: "已关注全部 {n} 个班次", watchAllHint: "任意一个班次有空位就发一封邮件。取消勾选上方的老师，就不会关注那些老师的班次。", watchAllTooMany: "{n} 个班次超过了 20 个，请先取消勾选上方的一些老师。", watchGroup: "关注了 {n} 个班次", watchGroupOpen: "{k} 个有空位", removeAll: "全部移除", emailPrivacy: "邮箱仅用于登录。验证码将在 10 分钟后失效。登录后，你的方案、偏好（包括个人日程）和已修课程会保存到账号，换设备登录就能看到。", syncNote: "你的方案、偏好和已修课程已同步到这个账号。", syncDelete: "删除同步数据并退出登录", syncDeleteConfirm: "删除账号里保存的方案并退出登录？这台设备上的副本会保留。其他仍在登录的设备会把它们的方案重新存回账号。", syncDeleteFailed: "同步数据没能删除，请重试。", wrongCode: "验证码无法验证。", emailSignedIn: "已通过邮箱登录", signOut: "退出登录", signOutClear: "退出并清除这台设备上的方案", signOutClearConfirm: "退出登录，并从这个浏览器删除你的方案、个人日程、已修课程和注册时间？账号里的副本会保留。",
    loading: "加载中…",
    resultFull: "已满", resultNoSections: "本学期无班次", resultSeatsUnknown: "余位未知",
    filterOpen: "有空位", filterFits: "放得进我的课表", filterFitsNeedPlan: "先在第 02 步生成课表；这个筛选会按课表和个人日程检查每门课。", fitSome: "{n} 个班次放得进课表", fitNone: "所有班次都和课表冲突", fitTba: "时间未公布，无法检查", filterPrereqs: "先修课已满足", filterPrereqsNeedTaken: "先在上方填写修过的课程，才能用这个筛选。", filterCredits: "学分", filterAny: "不限", filterShowing: "显示 {n} / {m} 门", filterNone: "没有符合筛选条件的课程。", filterClear: "清除筛选", sortLabel: "排序", sortMatch: "最匹配", sortSeats: "空位最多", sortGpa: "平均 GPA 最高", sortCredits: "学分最少", sortGpaShort: "平均 GPA", sortGpaHint: "PlanetTerp 上的历史平均 GPA，包括过去所有学期和所有老师。", sortLoading: "数据加载中，排序会随之更新…", showMore: "再显示 {n} 门（还有 {m} 门）", reportCourse: "这门课的信息有误？告诉我们", planName: "方案 {x}", planSwitch: "本学期的方案 A 或方案 B", planCopy: "把这个方案复制到方案 {x}", planHint: "给这学期留一个备用方案。两个方案的课程各自独立，排课偏好共用。", transferButton: "在其他设备上继续", transferCopied: "链接已复制。在另一台设备上打开它，比如用邮件或消息发给自己。", transferReady: "复制这个链接，在另一台设备上打开。", transferPrivacy: "链接里有你的排课方案、排课偏好和修过的课程，不包括个人日程的名称。拿到链接的人都能看到这些内容。", transferTitle: "来自其他设备的方案", transferBody: "这个链接里有 {courses} 门计划课程{taken}。要在这里载入吗？这会替换这个浏览器里保存的方案。", transferTaken: "和 {n} 门修过的课程", transferLoad: "载入方案", transferDismiss: "暂不", transferInvalid: "这个链接不完整或已损坏，请在另一台设备上重新生成。", resultsCapped: "只列出前 {n} 个匹配结果。输入更完整的课号或课名可以缩小范围。",
    prereqNeeds: "先修课还没满足：{needs}", prereqMet: "你修过的课程已满足先修要求。", prereqAddTaken: "在页面上方填写修过的课程，就能检查这门课的先修要求。", prereqOrHigher: " 或更高", prereqSameTerm: "（可同学期修）", prereqOf: "任选 {k} 门：", creditNeed: "修满 {n} 学分（你到时有 {have}）", creditUnknown: "这门课要求已修满 {n} 学分。在页面上方“修过的课程”里填上你的学分就能检查。", creditShort: "要求已修满 {n} 学分，你到下学期只有 {have} 学分。", creditMet: "要求已修满 {n} 学分，你到时有 {have} 学分。",
    error: "发生错误，请重试。", seats: "个空位", seat: "个空位", credit: "学分", creditsUnit: "学分", openOf: "空位 {n} / {total}", waitlisted: "候补 {n} 人", holdfiled: "Hold file {n} 人", fullNoWaitlist: "已满 · 还没有人候补", groupSections: "{n} 个班次", groupShared: "所有班次都上", groupOwn: "各班次另外的时间", groupOpenIn: "{n} 个班次合计", fcOnly: "仅限 Freshman Connection", pickCourse: "从匹配结果中选择一门课程，查看它的班次。", waitlist: "候补人数", checked: "上次检查", status: "状态",
    freshness: "余位数据来自 UMD 课程数据，可能晚于学校官方课表。页面打开时最多每分钟检查一次。",
    open: "有空位", full: "已满", unknown: "未知", stale: "上次检查失败 · 显示已保存数据", checking: "检查中…",
    next: "下一步", back: "返回", termFallback: "无法读取学期列表，暂显示 2027 春季", timeUnknown: "部分班次缺少上课时间，无法完整检查冲突。",
    pinSection: "指定此班次", unpinSection: "取消指定", pinShort: "指定", unpinShort: "已指定 ✓", excludeSection: "排课时排除", includeSection: "重新纳入排课", excludeShort: "排除", includeShort: "纳入",
    keepSection: "请至少保留一个可排班次。", seatReadAt: "余位数据读取于", seatReadHint: "“余位数据读取于”是 TerpPlan 读取数据的时间，不代表 UMD 更新数据的时间。",
    pinnedInstructorHint: "请先取消指定班次，再修改教师筛选。",
    selectedCourses: "已选课程", noSelectedCourses: "这个学期还没有添加课程。",
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

// Search results shown at a time, and the most the search API returns.
const RESULT_PAGE = 40;
const MAX_RESULTS = 120;

const zhDays: Record<string, string> = { Mon: "周一", Tue: "周二", Wed: "周三", Thu: "周四", Fri: "周五", Sat: "周六", Sun: "周日" };

function displayTime(meeting: Meeting, language: "en" | "zh") {
  const start = minutes(meeting.start_time), end = minutes(meeting.end_time), days = dayNames(meeting.days);
  if (isAsyncOnline(meeting)) return language === "en" ? "Online · no set time" : "线上 · 无固定时间";
  if (start === null || end === null || !days.length || end <= start) return language === "en" ? "Time TBA" : "时间待定";
  const clock = (value: number) => {
    const hour = Math.floor(value / 60), minute = value % 60;
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")}${hour < 12 ? "am" : "pm"}`;
  };
  return `${days.map((day) => language === "zh" ? zhDays[day] ?? day : day).join(" ")} · ${clock(start)}–${clock(end)} · ${roomLabel(meeting.building, meeting.room, language)}`;
}

function count(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return null;
}

// "4", or a range such as "1–3" for variable-credit courses. umd.io may already send a range string.
function creditsText(course: CoursePayload["course"]) {
  const raw = course?.credits;
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim().replace(/\s*-\s*/, "–") : "";
  if (!/^\d+(\.\d+)?(–\d+(\.\d+)?)?$/.test(text)) return null;
  const max = typeof course?.max_credits === "number" ? course.max_credits : null;
  return max && !text.includes("–") ? `${text}–${max}` : text;
}

// Credits and open seats under a search result, so a course can be judged before it is opened.
function ResultFacts({ credits, seats, gpa, fit, t }: { credits?: string; seats: SeatSummary | null | undefined; gpa?: number | null; fit?: ScheduleFit | null; t: (typeof copy)["en"] | (typeof copy)["zh"] }) {
  const creditText = credits ? `${credits} ${credits === "1" ? t.credit : t.creditsUnit}` : null;
  let seatText: string | null = null;
  let tone = "text-[#646c68]";
  if (seats) {
    if (!seats.sections) seatText = t.resultNoSections;
    else if (seats.openSeats > 0) { seatText = `${seats.openSeats} ${seats.openSeats === 1 ? t.seat : t.seats}`; tone = "text-[#367047]"; }
    else if (seats.unknownSections > 0) seatText = t.resultSeatsUnknown;
    else { seatText = t.resultFull; tone = "text-[#8f4538]"; }
  }
  if (!creditText && !seatText) return null;
  return <span className="mt-1 block text-xs text-[#646c68]">{creditText}{creditText && seatText ? " · " : ""}{seatText && <span className={`font-medium ${tone}`}>{seatText}</span>}{typeof gpa === "number" ? <span className="text-[#315c43]"> · {t.sortGpaShort} {gpa.toFixed(2)}</span> : null}{fit ? <span className={`block font-medium ${fit.fit ? "text-[#367047]" : fit.tba ? "text-[#646c68]" : "text-[#8f4538]"}`}>{fit.fit ? t.fitSome.replace("{n}", String(fit.fit)) : fit.tba ? t.fitTba : t.fitNone}</span> : null}</span>;
}

// ?demo=1 sets up the sample student before anything reads this browser's saved plan.
startDemoFromUrl();

const DEMO_COPY = {
  en: {
    title: "You are trying a sample plan",
    body: "A sophomore's spring plan: 5 courses, a campus job Tuesday and Thursday 1–4pm, MATH140 and CMSC131 already done. Change anything; your own plan is kept aside and comes back when you leave.",
    steps: ["Open Schedule to see ranked options", "Change a preference (no Friday classes, a longer shift) and see what changes", "Click a class in the timetable to swap sections", "See why COMM107 is worth a seat alert"],
    schedule: "Go to Schedule", leave: "Leave sample",
  },
  zh: {
    title: "你正在试用示例课表",
    body: "一位大二学生的春季计划：5 门课，周二、周四下午 1–4 点要打工，已修 MATH140 和 CMSC131。可以随便改，你自己的课表已经单独保存好，退出示例后就会回来。",
    steps: ["打开“排课”看排好序的方案", "改一个偏好（比如周五不上课、打工时间更长），看看结果怎么变", "点课表里的一门课换班次", "看看为什么 COMM107 值得开余位提醒"],
    schedule: "去排课", leave: "退出示例",
  },
} as const;

function DemoBanner({ language, onSchedule }: { language: "en" | "zh"; onSchedule: () => void }) {
  const t = DEMO_COPY[language];
  return <div role="region" aria-label={t.title} className="border-b border-[#ead8b5] bg-[#fff8e8]"><div className="mx-auto max-w-[1320px] px-5 py-3 sm:px-8">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 max-w-3xl">
        <p className="text-sm font-semibold text-[#5f4316]">{t.title}</p>
        <p className="mt-1 text-xs leading-5 text-[#745424]">{t.body}</p>
        <ol className="mt-2 grid gap-x-5 gap-y-1 text-xs text-[#5f4316] sm:grid-cols-2">{t.steps.map((step, index) => <li key={step} className="flex gap-1.5"><span className="font-semibold">{index + 1}.</span><span>{step}</span></li>)}</ol>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={onSchedule} className="rounded-lg bg-[#273c38] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d302c]">{t.schedule}</button>
        <button type="button" onClick={leaveDemo} className="rounded-lg border border-[#c99a4a] bg-white px-3 py-1.5 text-xs font-semibold text-[#5f4316] hover:bg-[#fffaf0]">{t.leave}</button>
      </div>
    </div>
  </div></div>;
}

export default function Home() {
  const [language, setLanguage] = useState<"en" | "zh">("en");
  useDocumentLanguage(language);
  const t = copy[language];
  // Shown after the first render (like the saved plan), so the server and client HTML match.
  const [demo, setDemo] = useState(false);
  // A section opened from a seat alert email, checked against this device's schedule.
  const [opening, setOpening] = useState<Opening | null>(null);
  const [step, setStep] = useState<"find" | "schedule" | "watch">("find");
  const [term, setTerm] = useState("202701");
  const [terms, setTerms] = useState<string[]>([]);
  const [termUnavailable, setTermUnavailable] = useState(false);
  const [query, setQuery] = useState("");
  const [findMode, setFindMode] = useState<"search" | "gened">("search");
  const searchPlaceholder = useTypingPlaceholder(t.searchHint, !query);
  // Gen Ed categories handed over from the degree audit page (?gened=DSHU,DVUP); key remounts the finder.
  const [genEdPreset, setGenEdPreset] = useState<{ key: number; codes: string[] } | null>(null);
  // Last schedule option viewed in the planner, kept per term, for Gen Ed conflict checks.
  const [referenceSchedule, setReferenceSchedule] = useState<ReferenceSchedule | null>(null);
  const rememberSchedule = useCallback((schedule: ReferenceSchedule) => setReferenceSchedule(schedule), []);
  const [searchState, setSearchState] = useState<CourseSearchState>({ key: "", status: "ready", results: [], error: "" });
  const { results, searching, error: searchError } = courseSearchView(searchState, query, term);
  // Seat counts for the courses in the results list, by "term|courseId"; null once a lookup failed or the
  // term has no live seat data. Kept for two minutes, then asked again the next time the course is listed.
  const [resultSeats, setResultSeats] = useState<Record<string, { at: number; summary: SeatSummary | null }>>({});
  const [resultFilters, setResultFilters] = useState<ResultFilters>(NO_FILTERS);
  const [resultLimitState, setResultLimitState] = useState({ key: "", limit: RESULT_PAGE });
  const [chosenSort, setResultSort] = useState<ResultSort>("match");
  // Historical average GPA by course (PlanetTerp), looked up only when sorting by it.
  const [courseGpa, setCourseGpa] = useState<Record<string, number | null>>({});
  const gpaRequestsRef = useRef(new Set<string>());
  const [selected, setSelected] = useState<Course | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [courseCredits, setCourseCredits] = useState<string | null>(null);
  const [courseInfo, setCourseInfo] = useState<{ requirements: CourseRequirement[]; description: string | null; genEd: string[][] } | null>(null);
  const [courseSeatCheckedAt, setCourseSeatCheckedAt] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [planCourses, setPlanCourses] = useState<PlanCourse[]>([]);
  // Instructors left out for the course currently open in the sections panel.
  const [excludedInstructors, setExcludedInstructors] = useState<string[]>([]);
  const [professorRatings, setProfessorRatings] = useState<Record<string, ProfessorSummary>>({});
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const activeCourseRef = useRef("");
  const panelScrollPendingRef = useRef(false);
  const planCoursesRef = useRef<PlanCourse[]>([]);
  // Credits per "term|courseId" for the plan total; null once a lookup failed. Filled by opening a course
  // or, for courses restored from storage or added straight from a result list, by a lookup below.
  const [planCredits, setPlanCredits] = useState<Record<string, CreditRange | null>>({});
  // Credits a course needs finished first ("24 credit hours completed"), by "term|courseId"; null for none.
  const [minCredits, setMinCredits] = useState<Record<string, number | null>>({});
  const creditRequestsRef = useRef(new Set<string>());
  // Plans saved in this browser, one per term; kept in a ref so switching terms can restore them.
  const savedPlansRef = useRef<Record<string, PlanCourse[]>>({});
  // Plan A / Plan B for the current term: which one is on screen, and how many courses the other has.
  const [showingB, setShowingB] = useState(false);
  const [otherPlanCount, setOtherPlanCount] = useState(0);
  const syncPlanSlot = useCallback((forTerm: string) => {
    const saved = readSavedState();
    setShowingB(Boolean(saved.showingB?.[forTerm]));
    setOtherPlanCount(saved.otherPlans?.[forTerm]?.length ?? 0);
  }, []);
  const [restored, setRestored] = useState(false);
  // A plan arriving in a "continue on another device" link (#move=...), waiting for the student to accept.
  const [transferOffer, setTransferOffer] = useState<Transfer | "invalid" | null>(null);
  const [transferLink, setTransferLink] = useState("");
  const [transferCopied, setTransferCopied] = useState(false);
  // A course named in the link (/?course=CMSC131, from the instructor page), opened once the page is restored.
  const linkedCourseRef = useRef("");
  const termRef = useRef("");
  const applyingOtherTabRef = useRef(false);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [alerts, setAlerts] = useState<string[]>([]);
  // Store the message key, not the text, so it re-renders in the new language after a switch.
  const [message, setMessage] = useState<"" | "added" | "watched" | "codeSent">("");
  // The course just added: with "added", a note on its prerequisite (worked out on each render, so it appears
  // as soon as the rule has loaded). The "enter your courses taken" nudge is shown once per browser.
  const [addedCourse, setAddedCourse] = useState<string | null>(null);
  const [nudgeAllowed, setNudgeAllowed] = useState(() => {
    try { return typeof window !== "undefined" && !window.localStorage.getItem("terpplan:prereq-nudged"); } catch { return true; }
  });
  // Counted once a day per browser, for the owner's usage numbers (lib/usage.ts).
  useEffect(() => { countUse(isDemo() ? "demo" : "planner"); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      setStep("find");
      setFindMode("search");
      window.setTimeout(() => document.querySelector<HTMLInputElement>("#course-search input:not([type=hidden])")?.focus(), 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [aboutOpen, setAboutOpen] = useState(false);
  const closeAbout = useCallback(() => setAboutOpen(false), []);
  const [actionError, setError] = useState("");
  const error = actionError || searchError;
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
    setSelected(null); setSections([]); setCourseSeatCheckedAt(null); setCourseInfo(null); setCourseCredits(null); setProfessorRatings({}); setRatingsLoading(false);
    setPlanCourses(savedPlansRef.current[nextTerm] ?? []);
    syncPlanSlot(nextTerm);
  }, [syncPlanSlot]);

  // A "continue on another device" link: on load, and when one is pasted into a tab already on TerpPlan
  // (only the #fragment changes then, so the page does not reload).
  const readTransferLink = useCallback(() => {
    if (!window.location.hash.startsWith(TRANSFER_PREFIX)) return;
    void decodeTransfer(window.location.hash.slice(TRANSFER_PREFIX.length)).then((transfer) => setTransferOffer(transfer ?? "invalid"));
  }, []);
  useEffect(() => {
    window.addEventListener("hashchange", readTransferLink);
    return () => window.removeEventListener("hashchange", readTransferLink);
  }, [readTransferLink]);

  // Runs once: restore what this browser saved, then load the term list.
  useEffect(() => {
    const restore = window.setTimeout(() => {
      const saved = readSavedState();
      savedPlansRef.current = saved.plans;
      setDemo(isDemo());
      if (saved.language) setLanguage(saved.language);
      if (saved.term) switchTerm(saved.term);
      // Only Gen Ed category codes travel in this link; nothing from the audit itself does.
      const presetCodes = (new URLSearchParams(window.location.search).get("gened") ?? "").split(",")
        .map((code) => code.trim().toUpperCase()).filter((code, index, list) => GEN_ED_CATEGORIES.some((item) => item.code === code) && list.indexOf(code) === index);
      if (presetCodes.length) {
        setGenEdPreset({ key: Date.now(), codes: presetCodes });
        setFindMode("gened");
        setStep("find");
        window.history.replaceState(null, "", window.location.pathname);
      }
      readTransferLink();
      // A seat alert's "Fits my schedule?" link: check the opened section against this device's plan.
      const seatOpening = parseOpening(window.location.search);
      if (seatOpening) {
        setOpening(seatOpening);
        // The term list below then keeps this term instead of falling back to the default.
        if (seatOpening.term !== saved.term) { switchTerm(seatOpening.term); saved.term = seatOpening.term; }
        window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      }
      const linked = (new URLSearchParams(window.location.search).get("course") ?? "").trim().toUpperCase();
      if (/^[A-Z]{4}\d{3}[A-Z0-9]*$/.test(linked)) {
        linkedCourseRef.current = linked;
        window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      }
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
  }, [switchTerm, readTransferLink]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => loadWatches().catch(() => setError(t.error)), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadWatches, t.error]);

  // Save after every change, but only once the saved state has been restored so it is not overwritten.
  // Only this term's plan comes from this tab; other terms are taken from storage, which another tab may have updated.
  useEffect(() => {
    if (!restored) return;
    if (applyingOtherTabRef.current) { applyingOtherTabRef.current = false; return; }
    savedPlansRef.current = { ...readSavedState().plans, [term]: planCourses };
    writeSavedState({ language, term, plans: savedPlansRef.current });
  }, [restored, language, term, planCourses]);

  // Another TerpPlan tab changed the saved plans: show its version here instead of overwriting it later.
  // The update is not written back, so two tabs on different terms do not keep rewriting each other.
  useEffect(() => { termRef.current = term; }, [term]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== storageKey(STORAGE_KEY)) return;
      const saved = readSavedState();
      savedPlansRef.current = saved.plans;
      applyingOtherTabRef.current = true;
      setPlanCourses(saved.plans[termRef.current] ?? []);
      syncPlanSlot(termRef.current);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [syncPlanSlot]);

  useEffect(() => startCourseSearch(query, term, setSearchState, t.error), [query, term, t.error]);

  const changeSearchQuery = (value: string) => {
    setQuery(value); setError("");
    // A new typed search must not keep another course's details or late detail responses.
    activeCourseRef.current = "";
    setSelected(null); setSections([]); setCourseSeatCheckedAt(null); setCourseInfo(null);
    setCourseCredits(null); setProfessorRatings({}); setRatingsLoading(false); setLoadingDetail(false);
  };


  const openCourse = async (course: Course) => {
    const courseRequestKey = term + "|" + course.course_id;
    activeCourseRef.current = courseRequestKey;
    setSelected(course); setSections([]); setCourseSeatCheckedAt(null); setCourseCredits(null); setCourseInfo(null); setLoadingDetail(true); setError(""); setMessage(""); setProfessorRatings({});
    // On a phone the sections panel sits below the results, so without this the tap seems to do nothing.
    // The effect on loadingDetail scrolls once more after the sections are in (see below).
    if (window.matchMedia("(max-width: 1023px)").matches) {
      panelScrollPendingRef.current = true;
      window.setTimeout(() => document.querySelector(".course-detail-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
      // If the student scrolls by hand while it loads, leave the page where they put it.
      const cancel = () => { panelScrollPendingRef.current = false; };
      for (const type of ["wheel", "touchstart", "keydown"]) window.addEventListener(type, cancel, { once: true, passive: true });
      window.setTimeout(() => { for (const type of ["wheel", "touchstart", "keydown"]) window.removeEventListener(type, cancel); }, 15000);
    }
    setExcludedInstructors([]);
    setRatingsLoading(false);
    try {
      const response = await fetch(`/api/course?id=${encodeURIComponent(course.course_id)}&term=${encodeURIComponent(term)}`);
      const payload = await response.json() as CoursePayload;
      if (!response.ok) throw new Error(payload.error || t.error);
      if (activeCourseRef.current !== courseRequestKey) return;
      setCourseSeatCheckedAt(payload.seatCheckedAt ?? null);
      setCourseCredits(creditsText(payload.course));
      setPlanCredits((current) => ({ ...current, [courseRequestKey]: creditRange(payload.course) }));
      setMinCredits((current) => ({ ...current, [courseRequestKey]: minimumCredits(payload.course?.requirements) }));
      setCourseInfo({ requirements: Array.isArray(payload.course?.requirements) ? payload.course.requirements : [], description: payload.course?.description ?? null, genEd: Array.isArray(payload.course?.genEdGroups) ? payload.course.genEdGroups : [] });
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
          body: JSON.stringify({ names, courseId: course.course_id }),
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

  // While the sections load the page is too short to bring the panel to the top of a phone screen, so
  // it scrolls again once they are rendered (unless the student scrolled by hand in the meantime).
  useEffect(() => {
    if (loadingDetail || !panelScrollPendingRef.current) return;
    panelScrollPendingRef.current = false;
    const frame = window.requestAnimationFrame(() => document.querySelector(".course-detail-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [loadingDetail]);

  // A course code clicked inside a prerequisite or restriction: search it in this term and open it if offered.
  // If it is not offered, the current course stays open and the search list shows the "not offered this term" note.
  const jumpToCourse = async (courseId: string) => {
    setFindMode("search");
    setQuery(courseId);
    window.setTimeout(() => document.getElementById("course-search")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(courseId)}&term=${encodeURIComponent(term)}`);
      const payload = await response.json() as SearchPayload;
      const match = (payload.results ?? []).find((item) => item.course_id === courseId);
      if (match) void openCourse(match);
    } catch {
      // The search effect still runs for the new query and shows its own error.
    }
  };
  useEffect(() => {
    if (!restored || !linkedCourseRef.current) return;
    const courseId = linkedCourseRef.current;
    linkedCourseRef.current = "";
    void jumpToCourse(courseId);
    // Runs once, when the page is restored; jumpToCourse is recreated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored]);

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

  // Courses the student has taken (this browser only) and prerequisite rules by "term|courseId", for the
  // prerequisite check. A rule is null when the course has no course-based prerequisite or the term has
  // no rules; a missing key is still loading.
  const [taken, setTaken] = useState<TakenCourses | null>(null);
  // Whether the open course only runs in fall or spring (from its offering history).
  const selectedSeason = useOfferingSeasons(selected ? [selected.course_id] : []);
  const [prereqRules, setPrereqRules] = useState<Record<string, PrereqNode | null>>({});
  const prereqRequestsRef = useRef(new Set<string>());
  useEffect(() => {
    const load = () => setTaken(readTaken());
    load();
    const onStorage = (event: StorageEvent) => { if (event.key === storageKey(TAKEN_KEY)) load(); };
    window.addEventListener(TAKEN_EVENT, load);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(TAKEN_EVENT, load); window.removeEventListener("storage", onStorage); };
  }, []);
  useEffect(() => {
    if (!restored) return;
    // Plan courses, the open course, and the search results (for the "prerequisites met" filter).
    const ids = [...new Set([...planCourses.map((course) => course.courseId), ...(selected ? [selected.course_id] : []), ...results.map((course) => course.course_id)])]
      .filter((id) => id && !((term + "|" + id) in prereqRules) && !prereqRequestsRef.current.has(term + "|" + id));
    if (!ids.length) return;
    ids.forEach((id) => prereqRequestsRef.current.add(term + "|" + id));
    for (let start = 0; start < ids.length; start += 40) {
      const batch = ids.slice(start, start + 40);
      void fetch(`/api/prereqs?term=${encodeURIComponent(term)}&ids=${batch.join(",")}`)
        .then(async (response) => response.ok ? ((await response.json()) as { rules?: Record<string, PrereqNode | null> }).rules ?? {} : {})
        .catch(() => ({} as Record<string, PrereqNode | null>))
        .then((rules) => setPrereqRules((current) => ({ ...current, ...Object.fromEntries(batch.map((id) => [term + "|" + id, rules[id] ?? null])) })));
    }
  }, [restored, planCourses, selected, term, prereqRules, results]);
  const takenCodes = useMemo(() => taken ? [...taken.completed, ...taken.inProgress] : null, [taken]);
  const takenSet = courseSet(takenCodes ?? []);
  const prereqLabels = { orHigher: t.prereqOrHigher, sameTerm: t.prereqSameTerm, of: (k: number) => t.prereqOf.replace("{k}", String(k)) };
  // What a course still needs, or null when there is nothing to say (no rule, or no courses entered yet).
  // A credit minimum is included once the student has entered their credits (the course panel words it
  // separately, so it passes withCredits = false).
  const prereqNeeds = (courseId: string, withCredits = true): string[] | null => {
    const rule = prereqRules[term + "|" + courseId];
    const creditsNeeded = withCredits ? minCredits[term + "|" + courseId] : null;
    if ((!rule && !creditsNeeded) || !taken) return null;
    const sameTerm = courseSet(planCourses.map((course) => course.courseId).filter((id) => id !== courseId));
    const needs = rule ? unmetRequirements(rule, takenSet, sameTerm).map((node) => describeRequirement(node, prereqLabels)) : [];
    if (creditsNeeded && taken.credits !== undefined && taken.credits < creditsNeeded) needs.push(t.creditNeed.replace("{n}", String(creditsNeeded)).replace("{have}", String(taken.credits)));
    if (creditsNeeded && taken.credits === undefined && !needs.length) return null;
    return needs;
  };

  // Search results with the filters applied, and how many of them are on screen ("Show more" adds 40).
  // The count resets for a new search or a filter change.
  // Seat counts are only offered for the term with live seat data, so "Most open seats" falls back there.
  const resultSort: ResultSort = chosenSort === "seats" && term !== "202701" ? "match" : chosenSort;
  const resultsKey = JSON.stringify([term, query.trim().toLowerCase(), resultFilters, resultSort]);
  // The schedule from step 02 for this plan and term (with personal commitments), for "Fits my schedule".
  const fitReference = referenceSchedule?.term === term && referenceSchedule.planKey === planKey(planCourses, term) ? referenceSchedule : null;
  // A course already in the plan is part of that schedule, so it is not checked against itself.
  const fitOf = (courseId: string): ScheduleFit | null | undefined => {
    if (!fitReference || planCourses.some((course) => course.courseId === courseId)) return null;
    const slots = resultSeats[term + "|" + courseId]?.summary?.slots;
    return slots ? scheduleFit(slots, fitReference.meetings, resultFilters.openSeats) : undefined;
  };
  const resultLimit = resultLimitState.key === resultsKey ? resultLimitState.limit : RESULT_PAGE;
  const shownResults = useMemo(() => sortResults(
    filterResults(results, { ...resultFilters, prereqsMet: resultFilters.prereqsMet && Boolean(taken), fitsSchedule: resultFilters.fitsSchedule && Boolean(fitReference) }, (id) => resultSeats[term + "|" + id]?.summary, prereqNeeds, fitOf),
    resultSort, (id) => resultSeats[term + "|" + id]?.summary, (id) => courseGpa[id]),
    // prereqNeeds reads prereqRules, planCourses and taken, which are listed instead of the function itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, resultFilters, resultSort, courseGpa, taken, resultSeats, term, prereqRules, minCredits, planCourses, fitReference]);
  const displayedResults = shownResults.slice(0, resultLimit);
  // "Open seats" and "Most open seats" need every result's seats; otherwise only the ones on screen.
  const seatTargets = resultFilters.openSeats || resultFilters.fitsSchedule || resultSort === "seats" ? results : displayedResults;
  const sortPending = resultSort === "seats" ? results.some((course) => !resultSeats[term + "|" + course.course_id])
    : resultSort === "gpa" ? results.some((course) => !(course.course_id in courseGpa)) : false;
  useEffect(() => {
    if (resultSort !== "gpa") return;
    const missing = results.map((course) => course.course_id).filter((id) => !gpaRequestsRef.current.has(id));
    if (!missing.length) return;
    missing.forEach((id) => gpaRequestsRef.current.add(id));
    for (let start = 0; start < missing.length; start += 30) {
      const batch = missing.slice(start, start + 30);
      void fetch("/api/audit/grades", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseIds: batch }) })
        .then(async (response) => { if (!response.ok) throw new Error("grades"); return ((await response.json()) as { averages?: Record<string, number | null> }).averages ?? {}; })
        .then((averages) => setCourseGpa((current) => ({ ...current, ...Object.fromEntries(batch.map((id) => [id, averages[id] ?? null])) })))
        // Not recorded, so choosing the sort again retries.
        .catch(() => batch.forEach((id) => gpaRequestsRef.current.delete(id)));
    }
  }, [resultSort, results]);

  useEffect(() => {
    const now = Date.now();
    // Seats for the results on screen; with "Open seats" on, for every result, since the filter needs them.
    const ids = seatTargets.map((course) => course.course_id).filter((id) => id && !(resultSeats[term + "|" + id] && now - resultSeats[term + "|" + id].at < 120_000));
    if (!ids.length) return;
    let cancelled = false;
    void fetch(`/api/seats?term=${encodeURIComponent(term)}&ids=${ids.slice(0, 40).join(",")}`)
      .then(async (response) => response.ok ? ((await response.json()) as { seats?: Record<string, SeatSummary> }).seats ?? {} : {})
      .catch(() => ({} as Record<string, SeatSummary>))
      .then((seats) => {
        if (cancelled) return;
        const at = Date.now();
        setResultSeats((current) => ({ ...current, ...Object.fromEntries(ids.slice(0, 40).map((id) => [term + "|" + id, { at, summary: seats[id] ?? null }])) }));
      });
    return () => { cancelled = true; };
  }, [seatTargets, term, resultSeats]);

  useEffect(() => {
    if (!restored) return;
    for (const { courseId } of planCourses) {
      const key = term + "|" + courseId;
      if (key in planCredits || creditRequestsRef.current.has(key)) continue;
      creditRequestsRef.current.add(key);
      void fetch(`/api/course?id=${encodeURIComponent(courseId)}&term=${encodeURIComponent(term)}`)
        .then(async (response) => response.ok ? ((await response.json()) as CoursePayload).course ?? null : null)
        .catch(() => null)
        .then((course) => {
          setPlanCredits((current) => key in current ? current : { ...current, [key]: creditRange(course) });
          setMinCredits((current) => key in current ? current : { ...current, [key]: minimumCredits(course?.requirements) });
        });
    }
  }, [restored, planCourses, term, planCredits]);

  const planCreditTotal = totalPlanCredits(planCourses.map((course) => course.courseId), Object.fromEntries(planCourses.map((course) => [course.courseId, planCredits[term + "|" + course.courseId]])));
  const planCreditLabel = planCourses.length ? formatCreditTotal(planCreditTotal, language) : "";
  const planCreditWarning = planCourses.length ? creditWarning(planCreditTotal, term, language) : "";
  // The bar waits for every lookup so it does not grow in steps while credits load.
  const planCreditMeter = planCourses.length && !planCreditTotal.pending.length ? creditMeter(planCreditTotal, term) : null;

  // What to say about a course's prerequisite as it is added: what is missing, or (once per browser, before any
  // courses taken are entered) that TerpPlan can check it. Nothing when it is met or the course has none.
  const addedNote = ((): { text: string; warn: boolean } | null => {
    if (message !== "added" || !addedCourse) return null;
    if (!taken) return prereqRules[term + "|" + addedCourse] && nudgeAllowed ? { text: t.addedAskTaken, warn: false } : null;
    const needs = prereqNeeds(addedCourse);
    return needs?.length ? { text: t.addedNeeds.replace("{needs}", needs.join("; ")), warn: true } : null;
  })();
  // Success notes clear themselves; errors stay until the next action.
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => {
      if (message === "added" && addedNote && !addedNote.warn) {
        try { window.localStorage.setItem("terpplan:prereq-nudged", "1"); } catch { /* shown again next time */ }
        setNudgeAllowed(false);
      }
      setMessage(""); setAddedCourse(null);
    }, message === "added" && addedNote ? 12_000 : 4000);
    return () => window.clearTimeout(timer);
  }, [message, addedNote]);

  // Adds from a result list without leaving course search; the planner regenerates options in the background.
  const quickAdd = (course: Course) => {
    if (planCourses.some((item) => item.courseId === course.course_id)) return;
    if (planCourses.length >= 10) { setError(t.planLimit); return; }
    setError("");
    setPlanCourses((current) => [...current, { courseId: course.course_id, courseTitle: course.name, instructors: selected?.course_id === course.course_id ? instructorFilter : undefined }]);
    setAddedCourse(course.course_id); setMessage("added"); countUse("course");
  };

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
    setAddedCourse(course.course_id); setMessage("added"); setStep("schedule"); countUse("course");
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

  // After the account's plan replaced this device's, start the page over from it (keeping a seat alert's
  // check open, which is the usual reason to sign in on a phone).
  const reloadAfterSync = useCallback(() => {
    if (opening) window.location.replace(openingPath(opening.term, opening.sectionId));
    else window.location.reload();
  }, [opening]);

  // "Switch to this section" from a seat alert: the course keeps only that section, and the planner rebuilds.
  const pinOpening = (courseId: string, courseTitle: string, id: string) => {
    setPlanCourses((current) => current.some((item) => item.courseId === courseId)
      ? current.map((item) => item.courseId === courseId ? { ...item, pinnedSectionId: id, excludedSectionIds: (item.excludedSectionIds ?? []).filter((other) => other !== id), instructors: undefined } : item)
      : [...current, { courseId, courseTitle, pinnedSectionId: id }]);
    setError("");
  };

  const addWatch = async (course: Course, section: Section) => {
    setError("");
    try {
      const response = await fetch("/api/watches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId: course.course_id, term, sectionId: sectionId(section, course.course_id) }) });
      const payload = await response.json() as ApiError;
      if (response.status === 401) { setAuthenticated(false); setAuthProvider(null); setStep("watch"); return; }
      if (!response.ok) throw new Error(payload.code === "watchLimit" ? t.watchLimit : payload.error || t.error);
      setMessage("watched"); setStep("watch"); countUse("alert"); await loadWatches();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.error); }
  };

  // "Any section opens": every listed section of the course (after the instructor choice) in one request.
  const addWatchAll = async (course: Course, list: Section[]) => {
    setError("");
    try {
      const response = await fetch("/api/watches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId: course.course_id, term, sectionIds: list.map((section) => sectionId(section, course.course_id)) }) });
      const payload = await response.json() as ApiError;
      if (response.status === 401) { setAuthenticated(false); setAuthProvider(null); setStep("watch"); return; }
      if (!response.ok) throw new Error(payload.code === "watchLimit" ? t.watchLimit : payload.error || t.error);
      setMessage("watched"); setStep("watch"); countUse("alert"); await loadWatches();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.error); }
  };

  const makeTransferLink = async () => {
    setTransferCopied(false);
    const link = window.location.origin + "/plan" + TRANSFER_PREFIX + await encodeTransfer(readSavedState(), readTaken());
    setTransferLink(link); countUse("share");
    try { await navigator.clipboard.writeText(link); setTransferCopied(true); } catch { /* the link is shown to copy by hand */ }
  };
  const closeTransfer = () => { window.history.replaceState(null, "", window.location.pathname + window.location.search); setTransferOffer(null); };
  const acceptTransfer = (transfer: Transfer) => {
    applyTransfer(transfer);
    // Reload so every part of the page starts from the loaded plan.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    window.location.reload();
  };

  // Swap the plan on screen with the one put aside (A <-> B). The save effect then stores the new plans[term].
  const switchPlan = () => {
    const next = swapPlans(readSavedState(), term, planCourses);
    writeSavedState(next);
    savedPlansRef.current = next.plans;
    setOtherPlanCount(planCourses.length);
    setShowingB(Boolean(next.showingB?.[term]));
    setPlanCourses(next.plans[term] ?? []);
  };
  const copyPlanToOther = () => {
    const saved = readSavedState();
    writeSavedState({ otherPlans: { ...saved.otherPlans, [term]: planCourses } });
    setOtherPlanCount(planCourses.length);
  };
  const planSwitch = <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
    <div role="group" aria-label={t.planSwitch} title={t.planHint} className="inline-flex rounded-lg border border-[#d9d6ce] bg-white p-0.5">
      {(["A", "B"] as const).map((slot) => {
        const active = (slot === "B") === showingB;
        return <button key={slot} type="button" aria-pressed={active} onClick={() => { if (!active) switchPlan(); }} className={`rounded-md px-2.5 py-1 font-semibold transition ${active ? "bg-[#273c38] text-white" : "text-[#48534f] hover:bg-[#f1efe9]"}`}>{t.planName.replace("{x}", slot)} <span className="font-normal">({active ? planCourses.length : otherPlanCount})</span></button>;
      })}
    </div>
    {otherPlanCount === 0 && planCourses.length > 0 ? <button type="button" onClick={copyPlanToOther} className="font-medium text-[#a34a39] hover:underline">{t.planCopy.replace("{x}", showingB ? "A" : "B")}</button> : null}
    {otherPlanCount === 0 && <span className="basis-full text-[11px] leading-5 text-[#646c68] sm:basis-auto">{t.planHint}</span>}
  </div>;

  // The server accepts one code a minute per address; the resend button counts that minute down.
  const [codeSentAt, setCodeSentAt] = useState(0);
  const [clock, setClock] = useState(0);
  useEffect(() => {
    if (!codeSentAt) return;
    const tick = () => setClock(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    const stop = window.setTimeout(() => window.clearInterval(timer), 61_000);
    return () => { window.clearInterval(timer); window.clearTimeout(stop); };
  }, [codeSentAt]);
  const resendWait = codeSentAt ? Math.max(0, Math.ceil((codeSentAt + 60_000 - clock) / 1000)) : 0;

  const requestEmailCode = async () => {
    setError(""); setMessage(""); setAuthBusy(true);
    try {
      const response = await fetch("/api/auth/request-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const payload = await response.json() as ApiError;
      if (!response.ok) throw new Error(payload.error || t.error);
      setCodeSent(true); setMessage("codeSent"); setCodeSentAt(Date.now());
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.error); }
    finally { setAuthBusy(false); }
  };

  const verifyEmailCode = async () => {
    setError(""); setMessage(""); setAuthBusy(true);
    try {
      const response = await fetch("/api/auth/verify-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code: emailCode }) });
      const payload = await response.json() as ApiError;
      if (!response.ok) throw new Error(payload.error || t.wrongCode);
      setAuthenticated(true); setAuthProvider("email"); setEmailCode(""); countUse("signin");
      await loadWatches();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.wrongCode); }
    finally { setAuthBusy(false); }
  };

  const deleteSynced = async () => {
    if (!window.confirm(t.syncDeleteConfirm)) return;
    const response = await fetch("/api/sync", { method: "DELETE" }).catch(() => null);
    if (!response?.ok) { setError(t.syncDeleteFailed); return; }
    await signOutEmail();
  };

  const signOutEmail = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setWatches([]); setAlerts([]); setEmailCode(""); setCodeSent(false);
    await loadWatches();
  };

  // For a shared or borrowed computer: sign out and leave nothing of the student's plan behind (the language
  // choice stays). The page reloads so every part starts empty.
  const signOutAndClear = async () => {
    if (!window.confirm(t.signOutClearConfirm)) return;
    await fetch("/api/auth/logout", { method: "POST" });
    const keepLanguage = readSavedState().language;
    try {
      for (const key of PERSONAL_KEYS) window.localStorage.removeItem(key);
      if (keepLanguage) window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ language: keepLanguage, plans: {} }));
    } catch { /* storage blocked: nothing was kept */ }
    window.location.reload();
  };

  const removeWatches = async (list: Watch[]) => { for (const watch of list) await removeWatch(watch); };

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
      <header className="border-b border-[#dedbd3] bg-[#fbfaf8]"><div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-y-3 px-5 py-4 sm:px-8">
        {/* Below lg the page links take their own row under the logo, so the header never runs off a phone. */}
        <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#bd302f] font-serif text-lg text-white">T</span><span>TerpPlan</span><span className="hidden rounded-full border border-[#e5c9bd] px-2 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#8d4333] lg:inline">Student pilot</span></Link>
          <nav aria-label={language === "en" ? "More tools" : "更多工具"} className="order-last -mx-1 flex w-full items-center gap-1.5 overflow-x-auto sm:gap-2 px-1 py-0.5 lg:order-none lg:ml-2 lg:mr-auto lg:w-auto"><Link href="/audit" aria-label={language === "en" ? "Check degree audit" : "查看学位审计"} className="ml-1 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e5c9bd] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#a34a39] shadow-sm hover:border-[#a34a39] hover:bg-[#fff5f1] sm:px-3"><span aria-hidden="true" className="hidden sm:inline">📋</span>{/* Short labels without icons on phones so the header stays on one line. */}<span className="sm:hidden">{language === "en" ? "Audit" : "审计"}</span><span className="hidden sm:inline">{language === "en" ? "Check degree audit" : "查看学位审计"}</span></Link><Link href="/minor" aria-label={language === "en" ? "Minor or double major" : "辅修 / 双专业"} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#cddbd1] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#315c43] shadow-sm hover:border-[#536d64] hover:bg-[#f4f8f5] sm:px-3"><span aria-hidden="true" className="hidden sm:inline">🎓</span><span className="sm:hidden">{language === "en" ? "Minor" : "辅修"}</span><span className="hidden sm:inline">{language === "en" ? "Minor or double major" : "辅修 / 双专业"}</span></Link><Link href="/hard-courses" aria-label={language === "en" ? "Hardest courses to get" : "最难抢的课"} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#ead8b5] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#8a5a17] shadow-sm hover:border-[#c99a4a] hover:bg-[#fffaf0] sm:px-3"><span aria-hidden="true" className="hidden sm:inline">🔥</span><span className="sm:hidden">{language === "en" ? "Hardest" : "最难抢的课"}</span><span className="hidden sm:inline">{language === "en" ? "Hardest courses to get" : "最难抢的课"}</span></Link><Link href="/rooms" className="whitespace-nowrap rounded-lg px-2 py-2 text-xs font-medium text-[#59635f] hover:bg-[#eeece6] sm:px-2.5">{language === "en" ? "Empty rooms" : "空教室"}</Link><button onClick={() => setAboutOpen(true)} className="whitespace-nowrap rounded-lg px-2 py-2 text-xs font-medium text-[#59635f] hover:bg-[#eeece6] sm:px-2.5">{language === "en" ? "About" : "关于"}</button><button type="button" onClick={() => openFeedback({ kind: "idea" })} className="whitespace-nowrap rounded-lg px-2 py-2 text-xs font-medium text-[#59635f] hover:bg-[#eeece6] sm:px-2.5">{language === "en" ? "Feedback" : "反馈"}</button>{restored && !demo && <button type="button" onClick={enterDemo} className="whitespace-nowrap rounded-lg px-2 py-2 text-xs font-medium text-[#a34a39] hover:bg-[#fff5f1] sm:px-2.5"><span className="sm:hidden">{language === "en" ? "Sample" : "示例"}</span><span className="hidden sm:inline">{language === "en" ? "Try a sample" : "试用示例"}</span></button>}</nav>
        <div className="flex items-center gap-3"><button onClick={() => setLanguage(language === "en" ? "zh" : "en")} className="whitespace-nowrap rounded-lg border border-[#dcd9d0] px-2.5 py-2 text-xs font-medium hover:bg-white sm:px-3">{language === "en" ? "中文" : "English"}</button></div>
      </div></header>
      {aboutOpen && <AboutDialog language={language} onClose={closeAbout} />}
      {demo && <DemoBanner language={language} onSchedule={() => { setStep("schedule"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}

      {/* On phones and tablets the plan summary and sharing box come after course search (order-1), so the search box
          is near the top of the screen; on wide screens they stay above it. */}
      <div id="top" className="mx-auto flex max-w-[1320px] flex-col px-5 pb-16 pt-5 sm:px-8 sm:pt-12 lg:block">
        <PlanSync active={restored && authenticated === true && !demo} language={language} onApplied={reloadAfterSync} />
        {restored && <RegistrationDayLink term={term} language={language} />}
        {opening && <OpeningCheck opening={opening} planCourseIds={opening.term === term ? planCourses.map((course) => course.courseId) : []} planFull={planCourses.length >= 10} reference={opening.term === term ? fitReference : null} language={language} onPin={pinOpening} onClose={() => setOpening(null)} />}
        <div className="mb-5 grid gap-4 sm:mb-8 sm:gap-6 lg:grid-cols-[1fr_auto] lg:items-end"><div><p className="mb-2 text-[11px] font-semibold uppercase tracking-[.17em] text-[#a34a39] sm:mb-3">{t.eyebrow}</p><h1 className="font-serif text-3xl leading-tight tracking-[-.03em] sm:text-5xl">{t.title}</h1>{/* The step buttons below say the same thing; on a phone the room goes to the search box. */}<p className="mt-3 hidden max-w-xl text-sm leading-6 text-[#5d6561] sm:block">{t.subtitle}</p>{restored && !demo && !planCourses.length && <button type="button" onClick={enterDemo} className="mt-2 block text-left text-xs font-semibold text-[#a34a39] hover:underline">{language === "en" ? "First time here? Try a sample schedule →" : "第一次来？先试试示例课表 →"}</button>}</div>
          <nav aria-label="Planning steps" className="grid grid-cols-3 gap-1 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-1.5 sm:flex sm:flex-wrap sm:gap-2 sm:p-2">{(["find", "schedule", "watch"] as const).map((item, index) => <button key={item} onClick={() => setStep(item)} aria-current={step === item ? "step" : undefined} className={`flex items-center justify-center gap-2 rounded-xl px-1.5 py-2 text-xs transition sm:justify-start sm:px-3 sm:text-sm ${step === item ? "bg-[#273c38] text-white" : "text-[#5d6561] hover:bg-[#eeece6]"}`}><span className="hidden h-5 w-5 place-items-center rounded-full bg-white/15 text-[10px] sm:grid">0{index + 1}</span>{t[item]}</button>)}</nav>
        </div>

        {transferOffer && <section role="dialog" aria-label={t.transferTitle} className="mb-5 rounded-2xl border border-[#536d64] bg-[#edf3ef] px-4 py-3 text-sm text-[#24312d] sm:px-5">
          {transferOffer === "invalid" ? <p>{t.transferInvalid}</p> : <><p className="font-semibold">{t.transferTitle}</p><p className="mt-1 text-xs leading-5">{t.transferBody.replace("{courses}", String(transferCourseCount(transferOffer))).replace("{taken}", transferOffer.taken ? t.transferTaken.replace("{n}", String(transferOffer.taken.completed.length + transferOffer.taken.inProgress.length)) : "")}</p></>}
          <div className="mt-2 flex flex-wrap gap-2">{transferOffer !== "invalid" && <button type="button" onClick={() => acceptTransfer(transferOffer)} className="rounded-lg bg-[#273c38] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d302c]">{t.transferLoad}</button>}<button type="button" onClick={closeTransfer} className="rounded-lg border border-[#536d64] bg-white px-3 py-2 text-xs font-semibold text-[#273c38]">{t.transferDismiss}</button></div>
        </section>}
        {step === "find" && restored && <section aria-label={t.selectedCourses} className="order-1 mb-5 mt-5 rounded-2xl border lg:order-none lg:mt-0 border-[#e0ddd5] bg-[#fbfaf8] px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="shrink-0 text-xs font-semibold text-[#48534f]">{t.selectedCourses} <span className="ml-1 rounded-md bg-[#ece9e2] px-1.5 py-0.5 text-[11px] text-[#5d6561]">{planCourses.length}/10</span>{planCreditLabel && <span className="ml-2 font-normal text-[#5d6561]">{planCreditLabel}</span>}</p>
            <div className="flex min-w-0 basis-full flex-wrap gap-2 sm:basis-auto sm:flex-1">
              {planCourses.length ? planCourses.map((course) => { const needs = prereqNeeds(course.courseId); const missing = Boolean(needs?.length); return <span key={course.courseId} title={`${course.courseId} · ${course.courseTitle}${missing ? " · " + t.prereqNeeds.replace("{needs}", needs!.join("; ")) : ""}`} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${missing ? "border-[#ead8b5] bg-[#fff8e8] text-[#745424]" : "border-[#cddbd1] bg-[#edf3ef] text-[#315c43]"}`}>{missing ? "⚠ " : ""}{course.courseId}</span>; }) : <p className="text-xs text-[#646c68]">{t.noSelectedCourses}</p>}
            </div>
            <Link href="/audit" className="basis-full text-xs font-medium text-[#a34a39] hover:underline sm:shrink-0 sm:basis-auto">{language === "en" ? "Not sure what you still need? Check your degree audit →" : "不确定还缺哪些课？查看学位审计 →"}</Link>
          </div>
          <div className="mt-2">{planSwitch}</div>
          {planCreditWarning && <p role="status" className="mt-2 rounded-lg bg-[#fff8e8] px-3 py-2 text-xs leading-5 text-[#745424]">⚠ {planCreditWarning}</p>}
          <div className="mt-2 border-t border-[#ece9e2] pt-2"><TakenCoursesEditor taken={taken} language={language} /></div>
          <div className="mt-2 border-t border-[#ece9e2] pt-2 text-xs"><button type="button" onClick={() => void makeTransferLink()} className="font-medium text-[#a34a39] hover:underline">{t.transferButton} →</button>
            {transferLink && <div className="mt-2"><p className="text-[#48534f]">{transferCopied ? "✓ " + t.transferCopied : t.transferReady}</p><input readOnly value={transferLink} onFocus={(event) => event.target.select()} aria-label={t.transferButton} className="mt-1 w-full rounded-lg border border-[#dedbd3] bg-white px-3 py-2 text-xs text-[#273c38]" /><p className="mt-1 text-[11px] leading-5 text-[#646c68]">{t.transferPrivacy}</p></div>}
          </div>
        </section>}

        {step === "find" && restored && <div className="order-1 lg:order-none"><PopularCourses term={term} lang={language} courseIds={planCourses.map((course) => course.courseId)} onCourseClick={(courseId) => void jumpToCourse(courseId)} /></div>}

        {termUnavailable && <p className="mb-4 rounded-xl border border-[#ead8b5] bg-[#fff8e8] px-4 py-3 text-sm text-[#745424]">{t.termFallback}</p>}
        {message && (message === "added" && addedNote
          ? <div role="status" className={`mb-4 rounded-xl border px-4 py-3 text-sm ${addedNote.warn ? "border-[#ead8b5] bg-[#fff8e8] text-[#745424]" : "border-[#bfd4c6] bg-[#edf6ef] text-[#315c43]"}`}>
            {addedNote.warn ? <p className="font-semibold">⚠ {addedNote.text}</p> : <><p>{t.added}</p><p className="mt-1 text-xs">{addedNote.text}</p></>}
          </div>
          : <p role="status" className="mb-4 rounded-xl border border-[#bfd4c6] bg-[#edf6ef] px-4 py-3 text-sm text-[#315c43]">{t[message]}</p>)}
        {error && <p role="alert" className="mb-4 rounded-xl border border-[#e7c6bf] bg-[#fff0ec] px-4 py-3 text-sm text-[#8c352c]">{error}</p>}

        {step === "find" && <section className="course-finder grid items-start gap-5 lg:grid-cols-[minmax(280px,.36fr)_minmax(0,1fr)]">
          <div className="course-search-panel min-w-0 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:overscroll-contain"><div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.13em] text-[#9a5040]">01 · {t.find}</p><h2 className="mt-2 font-serif text-2xl">{t.results}</h2></div><label className="grid w-full gap-1.5 text-xs text-[#646c68]">{t.term}<select value={term} onChange={(event) => switchTerm(event.target.value)} className="w-full rounded-lg border border-[#dedbd3] bg-white px-3 py-2 text-sm text-[#202728]">{(terms.length ? terms : [term]).map((item) => <option key={item} value={item}>{termLabel(item, language)}</option>)}</select></label></div>
            <div role="tablist" className="mb-4 inline-flex rounded-xl border border-[#e0ddd5] bg-[#f2f0eb] p-1 text-xs font-medium">{(["search", "gened"] as const).map((mode) => <button key={mode} type="button" role="tab" aria-selected={findMode === mode} onClick={() => setFindMode(mode)} className={`rounded-lg px-3 py-1.5 ${findMode === mode ? "bg-white text-[#202728] shadow-sm" : "text-[#5d6561] hover:text-[#202728]"}`}>{mode === "search" ? t.searchMode : t.genEdMode}</button>)}</div>
            {/* Kept mounted while hidden so the chosen category and loaded list survive switching modes. */}
            <div hidden={findMode !== "gened"}><GenEdFinder key={genEdPreset?.key ?? 0} takenCodes={takenCodes} initialCodes={genEdPreset?.codes} fromAudit={Boolean(genEdPreset)} onAddCourse={(course) => quickAdd(course)} term={term} language={language} reference={referenceSchedule?.planKey === planKey(planCourses, term) ? referenceSchedule : null} referenceStale={referenceSchedule?.term === term && referenceSchedule.planKey !== planKey(planCourses, term)} planCourseIds={planCourses.map((course) => course.courseId)} onOpenCourse={(course) => void openCourse(course)} /></div>
            {findMode === "search" && <>
            <label id="course-search" className="block scroll-mt-6"><span className="sr-only">{t.search}</span><div className="flex items-center gap-3 rounded-xl border border-[#d9d6ce] bg-white px-4 py-3 focus-within:border-[#a34a39] focus-within:ring-2 focus-within:ring-[#a34a39]/30"><span aria-hidden="true" className="text-lg text-[#646c68]">⌕</span><input value={query} onChange={(event) => changeSearchQuery(event.target.value)} aria-label={t.search} placeholder={searchPlaceholder} className="w-full bg-transparent text-sm outline-none placeholder:text-[#646c68]" /><kbd title={language === "en" ? "Press / to search" : "按 / 快速搜索"} className="hidden rounded border border-[#dedbd3] px-1.5 text-[11px] text-[#646c68] sm:inline">/</kbd></div></label>
            {!query && <Link href="/hard-courses" className="mt-2 inline-block text-xs font-medium text-[#a34a39] hover:underline">{language === "en" ? "See the courses that fill up every semester →" : "看看往年最难抢的课 →"}</Link>}
            {!searching && results.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {term === "202701" && <button type="button" aria-pressed={resultFilters.openSeats} onClick={() => setResultFilters((current) => ({ ...current, openSeats: !current.openSeats }))} className={`rounded-full border px-3 py-1.5 font-semibold ${resultFilters.openSeats ? "border-[#536d64] bg-[#edf3ef] text-[#273c38]" : "border-[#d9d6ce] text-[#48534f] hover:bg-[#f7f5f0]"}`}>{resultFilters.openSeats ? "✓ " : ""}{t.filterOpen}</button>}
              {term === "202701" && <button type="button" aria-pressed={Boolean(resultFilters.fitsSchedule && fitReference)} disabled={!fitReference} title={fitReference ? undefined : t.filterFitsNeedPlan} onClick={() => setResultFilters((current) => ({ ...current, fitsSchedule: !current.fitsSchedule }))} className={`rounded-full border px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${resultFilters.fitsSchedule && fitReference ? "border-[#536d64] bg-[#edf3ef] text-[#273c38]" : "border-[#d9d6ce] text-[#48534f] hover:bg-[#f7f5f0]"}`}>{resultFilters.fitsSchedule && fitReference ? "✓ " : ""}{t.filterFits}</button>}
              <button type="button" aria-pressed={resultFilters.prereqsMet} disabled={!taken} title={taken ? undefined : t.filterPrereqsNeedTaken} onClick={() => setResultFilters((current) => ({ ...current, prereqsMet: !current.prereqsMet }))} className={`rounded-full border px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${resultFilters.prereqsMet && taken ? "border-[#536d64] bg-[#edf3ef] text-[#273c38]" : "border-[#d9d6ce] text-[#48534f] hover:bg-[#f7f5f0]"}`}>{resultFilters.prereqsMet && taken ? "✓ " : ""}{t.filterPrereqs}</button>
              <label className="inline-flex items-center gap-1.5 text-[#48534f]">{t.filterCredits}<select value={resultFilters.credits} onChange={(event) => setResultFilters((current) => ({ ...current, credits: event.target.value as CreditFilter }))} className="rounded-lg border border-[#d9d6ce] bg-white px-2 py-1 text-xs">{(["any", "1", "2", "3", "4+"] as const).map((value) => <option key={value} value={value}>{value === "any" ? t.filterAny : value}</option>)}</select></label>
              <label className="inline-flex items-center gap-1.5 text-[#48534f]" title={resultSort === "gpa" ? t.sortGpaHint : undefined}>{t.sortLabel}<select value={resultSort} onChange={(event) => setResultSort(event.target.value as ResultSort)} className="rounded-lg border border-[#d9d6ce] bg-white px-2 py-1 text-xs">{([["match", t.sortMatch], ...(term === "202701" ? [["seats", t.sortSeats]] : []), ["gpa", t.sortGpa], ["credits", t.sortCredits]] as [ResultSort, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              {resultSort !== "match" && sortPending && <p className="basis-full text-[11px] text-[#646c68]">{t.sortLoading}</p>}
              {resultSort === "gpa" && !sortPending && <p className="basis-full text-[11px] text-[#646c68]">{t.sortGpaHint}</p>}
              {!taken && <p className="basis-full text-[11px] text-[#646c68]">{t.filterPrereqsNeedTaken}</p>}
              {term === "202701" && !fitReference && <p className="basis-full text-[11px] text-[#646c68]">{t.filterFitsNeedPlan}</p>}
            </div>}
            {(() => {
              // Results with the filters applied; the prerequisite filter needs the student's courses.
              const shown = shownResults;
              const active = filtersActive(resultFilters);
              return <>
            {active && !searching && results.length > 0 && <p className="mt-2 text-xs text-[#646c68]">{t.filterShowing.replace("{n}", String(shown.length)).replace("{m}", String(results.length))} · <button type="button" onClick={() => setResultFilters(NO_FILTERS)} className="font-semibold text-[#9a5040] hover:underline">{t.filterClear}</button></p>}
            <div className="mt-4 divide-y divide-[#ece9e2]">{searching && <p className="py-5 text-sm text-[#646c68]">{t.loading}</p>}{active && !searching && results.length > 0 && !shown.length && <p className="py-5 text-sm text-[#646c68]">{t.filterNone}</p>}{!searching && query.trim().length >= 2 && !results.length && !error && <p className="py-5 text-sm leading-6 text-[#646c68]">{/^[a-z]{4}\s?\d{3}[a-z]?$/i.test(query.trim())
                // A full course code with no match usually means the course is not offered this term, not a typo.
                ? t.notOffered.replace("{course}", query.trim().replace(/\s+/g, "").toUpperCase()).replace("{term}", termLabel(term, language))
                : t.noResults}</p>}
              {displayedResults.map((course) => { const inPlan = planCourses.some((item) => item.courseId === course.course_id); const courseId = course.course_id; const onAdd = () => quickAdd(course); return <div key={course.course_id} className={`flex items-center gap-2 border-l-2 pr-2 transition ${selected?.course_id === course.course_id ? "border-[#536d64] bg-[#edf3ef] text-[#273c38]" : "border-transparent hover:bg-[#f6f4ef]"}`}><button type="button" onClick={() => void openCourse(course)} aria-pressed={selected?.course_id === course.course_id} className="flex min-w-0 flex-1 flex-col items-start gap-2 px-3 py-3.5 text-left"><span className="min-w-0"><span className="flex items-start justify-between gap-2"><span className="block text-sm font-semibold">{course.course_id}</span><GenEdTags groups={course.ge} language={language} /></span><span className="mt-1 block text-sm leading-5 text-[#606966]">{course.name}</span><ResultFacts credits={course.credits} seats={resultSeats[term + "|" + course.course_id]?.summary} gpa={resultSort === "gpa" ? courseGpa[course.course_id] : undefined} fit={fitOf(course.course_id)} t={t} /></span><span className="text-xs font-medium text-[#a34a39]">{t.select} →</span></button><button type="button" onClick={() => onAdd()} disabled={inPlan} aria-label={inPlan ? t.inPlanShort : `${t.quickAdd} ${courseId}`} title={inPlan ? t.inPlanShort : t.quickAdd} className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${inPlan ? "border-[#cddbd1] bg-[#edf3ef] text-[#315c43]" : "border-[#536d64] text-[#273c38] hover:bg-[#edf3ef]"}`}>{inPlan ? `✓ ${t.inPlanShort}` : `+ ${t.quickAdd}`}</button></div>; })}
            </div>
            {!searching && shown.length > displayedResults.length && <button type="button" onClick={() => setResultLimitState({ key: resultsKey, limit: resultLimit + RESULT_PAGE })} className="mt-3 w-full rounded-lg border border-[#d9d6ce] px-3 py-2 text-xs font-semibold text-[#48534f] hover:bg-[#f7f5f0]">{t.showMore.replace("{n}", String(Math.min(RESULT_PAGE, shown.length - displayedResults.length))).replace("{m}", String(shown.length - displayedResults.length))}</button>}
            {!searching && results.length >= MAX_RESULTS && shown.length <= displayedResults.length && <p className="mt-3 text-[11px] leading-5 text-[#646c68]">{t.resultsCapped.replace("{n}", String(MAX_RESULTS))}</p>}
            </>; })()}</>}
          </div>
          <div className="course-detail-panel min-w-0 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5 sm:p-6"><div className="mb-5"><div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[.13em] text-[#9a5040]">{selected ? `${selected.course_id} · ${termLabel(term, language)}` : `02 · ${t.sections}`}</p>{selected && <GenEdTags groups={courseInfo?.genEd.length ? courseInfo.genEd : selected.ge} language={language} />}</div><h2 className="mt-2 font-serif text-2xl">{selected?.name ?? t.sections}</h2>{selected && courseCredits && <p className="mt-1 text-sm font-medium text-[#48534f]">{courseCredits} {courseCredits === "1" ? t.credit : t.creditsUnit}</p>}{selected && <SeasonNote season={selectedSeason[selected.course_id]} term={term} language={language} />}{selected && courseInfo && <CourseRequirements requirements={courseInfo.requirements} description={courseInfo.description} language={language} currentCourseId={selected.course_id} onCourseClick={(courseId) => void jumpToCourse(courseId)} />}{selected && prereqRules[term + "|" + selected.course_id] && (() => { const needs = prereqNeeds(selected.course_id, false); return <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${!needs ? "bg-[#f2f0eb] text-[#5d6561]" : needs.length ? "bg-[#fff8e8] text-[#745424]" : "bg-[#eaf4ec] text-[#367047]"}`}>{!needs ? t.prereqAddTaken : needs.length ? "⚠ " + t.prereqNeeds.replace("{needs}", needs.join("; ")) : "✓ " + t.prereqMet}</p>; })()}{selected && minCredits[term + "|" + selected.course_id] && (() => { const n = String(minCredits[term + "|" + selected.course_id]); const have = taken?.credits; const short = have !== undefined && have < Number(n); return <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${have === undefined ? "bg-[#f2f0eb] text-[#5d6561]" : short ? "bg-[#fff8e8] text-[#745424]" : "bg-[#eaf4ec] text-[#367047]"}`}>{have === undefined ? t.creditUnknown.replace("{n}", n) : (short ? "⚠ " + t.creditShort : "✓ " + t.creditMet).replace("{n}", n).replace("{have}", String(have))}</p>; })()}{selected && sections.length > 0 && <button onClick={() => addToSchedule(selected)} disabled={planCourses.some((item) => item.courseId === selected.course_id)} className="mt-4 rounded-lg bg-[#273c38] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d302c] disabled:cursor-default disabled:opacity-60">{planCourses.some((item) => item.courseId === selected.course_id) ? t.courseInPlan : t.addSchedule}</button>}
              {selected && visibleSections.length > 1 && (() => {
                const ids = visibleSections.map((section) => sectionId(section, selected.course_id));
                const all = ids.every((id) => watches.some((item) => item.term === term && item.sectionId === id));
                const tooMany = ids.length > 20;
                // With a schedule from step 02, offer to watch only the sections that would fit it (this course's
                // current section is set aside, since an opening would replace it).
                const current = fitReference ? visibleSections.find((section) => fitReference.sectionIds.includes(sectionId(section, selected.course_id))) : undefined;
                const fitting = fitReference ? fittingSections(visibleSections, scheduleWithout(fitReference.meetings, current?.meetings ?? [])).filter((section) => section !== current) : null;
                const fittingWatched = Boolean(fitting?.length) && fitting!.every((section) => watches.some((item) => item.term === term && item.sectionId === sectionId(section, selected.course_id)));
                return <div className="mt-2"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void addWatchAll(selected, visibleSections)} disabled={all || tooMany} className="rounded-lg border border-[#536d64] px-3 py-2 text-xs font-semibold text-[#273c38] hover:bg-[#edf3ef] disabled:cursor-default disabled:opacity-60">{(all ? t.watchingAll : t.watchAll).replace("{n}", String(ids.length))}</button>
                  {fitting && fitting.length > 0 && fitting.length < ids.length && <button type="button" onClick={() => void addWatchAll(selected, fitting)} disabled={fittingWatched || fitting.length > 20}className="rounded-lg border border-[#536d64] bg-[#edf3ef] px-3 py-2 text-xs font-semibold text-[#273c38] hover:bg-[#e2ece6] disabled:cursor-default disabled:opacity-60">{(fittingWatched ? (language === "en" ? "Watching the {n} that fit" : "已关注不冲突的 {n} 个班") : (language === "en" ? "Only the {n} that fit my schedule" : "只关注不冲突的 {n} 个班")).replace("{n}", String(fitting.length))}</button>}</div>
                  <p className="mt-1.5 text-[11px] leading-5 text-[#646c68]">{tooMany ? t.watchAllTooMany.replace("{n}", String(ids.length)) : t.watchAllHint}{fitting ? " " + (fitting.length === 0 ? (language === "en" ? "None of these sections fits your current schedule." : "这些班次都和你现在的课表冲突。")
                    : fitting.length > 20 ? (language === "en" ? `${fitting.length} of them fit your schedule, still more than 20.` : `其中不冲突的有 ${fitting.length} 个，仍然超过 20 个。`)
                    : fitting.length < ids.length ? (language === "en" ? "The second option leaves out sections that clash with your schedule or have no listed time." : "第二个选项会跳过和你课表冲突、或时间待定的班次。") : "") : ""}</p></div>;
              })()}
              {selected && courseInstructors.length > 1 && <div className="mt-4"><p className="text-xs font-medium text-[#5d6561]">{t.instructorPick} <span className="font-normal text-[#646c68]">· {excludedInstructors.length ? `${keptInstructors.length}/${courseInstructors.length}` : t.allInstructors}</span></p><div className="mt-2 flex flex-wrap gap-2">{courseInstructors.map((name) => { const kept = !excludedInstructors.includes(name); return <button key={name} type="button" onClick={() => toggleInstructor(name)} disabled={Boolean(selectedPlan?.pinnedSectionId)} aria-pressed={kept} className={`rounded-full border px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${kept ? "border-[#536d64] bg-[#edf3ef] font-medium text-[#24312d]" : "border-[#e0ddd5] bg-white text-[#9aa19d] line-through"}`}>{kept ? "✓ " : ""}{name}</button>; })}</div><p className="mt-2 text-[11px] text-[#646c68]">{selectedPlan?.pinnedSectionId ? t.pinnedInstructorHint : t.instructorHint}</p></div>}
              {selected && visibleSections.length > 0 && <CourseTrends courseId={selected.course_id} term={term} sectionIds={visibleSections.slice(0, 10).map((section) => sectionId(section, selected.course_id))} lang={language} />}
            </div>
            {!selected && <p className="rounded-xl bg-[#f2f0eb] p-4 text-sm leading-6 text-[#646c68]">{results.length ? t.pickCourse : t.noResults}</p>}{loadingDetail && <p className="py-8 text-sm text-[#646c68]">{t.loading}</p>}
            {selected && !loadingDetail && !sections.length && !error && <p className="rounded-xl bg-[#f2f0eb] p-4 text-sm text-[#646c68]">{language === "en" ? "No sections listed for this term." : "本学期没有列出班次。"}</p>}
            {visibleSections.length > 0 && <div aria-hidden="true" className="section-comparison-heading section-comparison-grid">
              <span>{language === "en" ? "Section & meeting times" : "班次与上课时间"}</span>
              <span>{language === "en" ? "Instructor & rating" : "教师与评分"}</span>
              <span>{language === "en" ? "Availability" : "余位"}</span>
            </div>}
            {(() => {
              const plan = planCourses.find((item) => item.courseId === selected?.course_id);
              const seatsOf = (section: Section, inline = false) => {
                const open = count(section.open_seats);
                // Open out of capacity tells "nobody registered yet" (30 / 30) apart from "one seat left".
                const total = count(section.seats), waiting = count(section.waitlist), held = count(section.holdfile);
                // For a full section, how many are already waiting says how good a waitlist spot is; "nobody yet" is worth saying.
                const queue = [waiting ? t.waitlisted.replace("{n}", String(waiting)) : open === 0 && waiting === 0 ? t.fullNoWaitlist : "", held ? t.holdfiled.replace("{n}", String(held)) : ""].filter(Boolean).join(" · ");
                return <><span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${open === null ? "bg-[#f1efe9] text-[#5d6561]" : open > 0 ? "bg-[#eaf4ec] text-[#367047]" : "bg-[#f5e9e5] text-[#8f4538]"}`}>{open !== null && open > 0 && total !== null ? t.openOf.replace("{n}", String(open)).replace("{total}", String(total)) : seatLabel(section.open_seats)}</span>{queue ? <p className={`text-[11px] text-[#646c68] ${inline ? "row-capacity" : "mt-1"}`}>{queue}</p> : null}</>;
              };
              const sectionCard = (section: Section) => {
              const id = sectionId(section, selected?.course_id ?? "");
              const watching = watches.some((item) => item.sectionId === id && item.term === term);
              const pinned = plan?.pinnedSectionId === id;
              const excluded = plan?.excludedSectionIds?.includes(id) ?? false;
              return <article key={id} className={`rounded-xl border bg-white p-4 ${pinned ? "border-[#536d64] ring-1 ring-[#536d64]/20" : excluded ? "border-[#e7e4dc] opacity-70" : "border-[#e7e4dc]"}`}>
                <div className="section-comparison-grid">
                  <div className="min-w-0"><h3 className="text-sm font-semibold">{id}{/-FC[A-Z0-9]*$/.test(id) && <span className="ml-2 rounded-full bg-[#f3ecdc] px-2 py-0.5 align-middle text-[10px] font-semibold text-[#7a5a24]">{t.fcOnly}</span>}</h3><div className="mt-2 space-y-1.5 text-xs leading-5 text-[#525d59]">{section.meetings?.length ? section.meetings.map((meeting, index) => <p key={index}>{displayTime(meeting, language)}</p>) : <p>{formatMeetings(section.meetings)}</p>}</div></div>
                  <div className="min-w-0">{section.instructors?.length ? <SectionProfessors compact term={term} panelTargetId={`reviews-${id}`} names={section.instructors} courseId={selected?.course_id ?? ""} ratings={professorRatings} ratingsLoading={ratingsLoading} language={language} /> : <p className="text-xs text-[#646c68]">{language === "en" ? "Instructor TBA" : "教师待定"}</p>}</div>
                  <div className="min-w-0">{seatsOf(section)}</div>
                </div>
                {/* Student comments open here, across the whole card, rather than in the narrow instructor column. */}
                <div id={`reviews-${id}`} />
                <div className="mt-3 flex flex-wrap gap-2 border-t border-[#ece9e2] pt-3">
                  <button onClick={() => selected && chooseSection(selected, id, "pin")} aria-pressed={pinned} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${pinned ? "border-[#536d64] bg-[#edf3ef] text-[#24312d]" : "border-[#d9d6ce] text-[#48534f] hover:bg-[#f7f5f0]"}`}><span className="sm:hidden">{pinned ? t.unpinShort : t.pinShort}</span><span className="hidden sm:inline">{pinned ? t.unpinSection : t.pinSection}</span></button>
                  <button onClick={() => selected && chooseSection(selected, id, "exclude")} disabled={Boolean(plan?.pinnedSectionId)} aria-pressed={excluded} className={`rounded-lg border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${excluded ? "border-[#cfaea5] bg-[#f9efec] text-[#8f4538]" : "border-[#d9d6ce] text-[#48534f] hover:bg-[#f7f5f0]"}`}><span className="sm:hidden">{excluded ? t.includeShort : t.excludeShort}</span><span className="hidden sm:inline">{excluded ? t.includeSection : t.excludeSection}</span></button>
                  <button onClick={() => selected && void addWatch(selected, section)} disabled={watching} className="rounded-lg border border-[#d9d6ce] px-3 py-2 text-xs font-semibold text-[#48534f] hover:bg-[#f7f5f0] disabled:cursor-default disabled:opacity-50">{watching ? (language === "en" ? "Watching" : "已关注") : <><span className="sm:hidden">{t.watchShort}</span><span className="hidden sm:inline">{t.addWatch}</span></>}</button>
                </div>
              </article>;
              };
              // One row inside a grouped card: the section's own times, its buttons and its seats.
              const sectionRow = (section: Section, shared: Meeting[]) => {
                const id = sectionId(section, selected?.course_id ?? "");
                const watching = watches.some((item) => item.sectionId === id && item.term === term);
                const pinned = plan?.pinnedSectionId === id;
                const excluded = plan?.excludedSectionIds?.includes(id) ?? false;
                const own = ownMeetings(section, shared);
                const button = "rounded-lg border px-2.5 py-1.5 text-xs font-semibold";
                return <li key={id} className={`section-row-grid -mx-2 rounded-lg px-2 py-2.5 ${pinned ? "bg-[#edf3ef]" : excluded ? "opacity-60" : ""}`}>
                  <div className="row-times flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5"><h4 className="text-sm font-semibold">{id}{/-FC[A-Z0-9]*$/.test(id) && <span className="ml-2 rounded-full bg-[#f3ecdc] px-2 py-0.5 align-middle text-[10px] font-semibold text-[#7a5a24]">{t.fcOnly}</span>}</h4>{own.length > 0 && <div className="text-xs leading-5 text-[#525d59]">{own.map((meeting, index) => <p key={index}>{displayTime(meeting, language)}</p>)}</div>}</div>
                  <div className="row-actions flex flex-wrap gap-1.5">
                    <button onClick={() => selected && chooseSection(selected, id, "pin")} aria-pressed={pinned} title={pinned ? t.unpinSection : t.pinSection} className={`${button} ${pinned ? "border-[#536d64] bg-[#edf3ef] text-[#24312d]" : "border-[#d9d6ce] bg-white text-[#48534f] hover:bg-[#f7f5f0]"}`}>{pinned ? t.unpinShort : t.pinShort}</button>
                    <button onClick={() => selected && chooseSection(selected, id, "exclude")} disabled={Boolean(plan?.pinnedSectionId)} aria-pressed={excluded} title={excluded ? t.includeSection : t.excludeSection} className={`${button} disabled:cursor-not-allowed disabled:opacity-50 ${excluded ? "border-[#cfaea5] bg-[#f9efec] text-[#8f4538]" : "border-[#d9d6ce] bg-white text-[#48534f] hover:bg-[#f7f5f0]"}`}>{excluded ? t.includeShort : t.excludeShort}</button>
                    <button onClick={() => selected && void addWatch(selected, section)} disabled={watching} title={t.addWatch} className={`${button} border-[#d9d6ce] bg-white text-[#48534f] hover:bg-[#f7f5f0] disabled:cursor-default disabled:opacity-50`}>{watching ? t.watchingShort : t.watchShort}</button>
                  </div>
                  <div className="row-seats min-w-0">{seatsOf(section, true)}</div>
                </li>;
              };
              return <div className="space-y-2">{groupSections(visibleSections).map((group) => {
                if (group.sections.length < 2) return sectionCard(group.sections[0]);
                const ids = group.sections.map((section) => sectionId(section, selected?.course_id ?? ""));
                const firstId = ids[0], lastNumber = ids[ids.length - 1].split("-").pop();
                const known = group.sections.map((section) => count(section.open_seats)).filter((value): value is number => value !== null);
                const openTotal = known.reduce((sum, value) => sum + value, 0);
                const capacities = group.sections.map((section) => count(section.seats));
                const capacityTotal = known.length === group.sections.length && capacities.every((value) => value !== null) ? capacities.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
                const instructors = group.sections[0].instructors ?? [];
                return <article key={group.key} className="rounded-xl border border-[#e7e4dc] bg-white p-4">
                  <div className="section-comparison-grid">
                    <div className="min-w-0"><h3 className="text-sm font-semibold">{firstId} – {lastNumber} <span className="ml-1 rounded-full bg-[#f1efe9] px-2 py-0.5 align-middle text-[10px] font-semibold text-[#5d6561]">{t.groupSections.replace("{n}", String(ids.length))}</span></h3>{group.shared.length > 0 && <div className="mt-2 text-xs leading-5 text-[#525d59]"><p className="text-[11px] font-medium text-[#646c68]">{t.groupShared}</p>{group.shared.map((meeting, index) => <p key={index}>{displayTime(meeting, language)}</p>)}</div>}</div>
                    <div className="min-w-0"><SectionProfessors compact term={term} panelTargetId={`reviews-${firstId}`} names={instructors} courseId={selected?.course_id ?? ""} ratings={professorRatings} ratingsLoading={ratingsLoading} language={language} /></div>
                    <div className="min-w-0">{known.length > 0 && <><span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${openTotal > 0 ? "bg-[#eaf4ec] text-[#367047]" : "bg-[#f5e9e5] text-[#8f4538]"}`}>{openTotal > 0 && capacityTotal !== null ? t.openOf.replace("{n}", String(openTotal)).replace("{total}", String(capacityTotal)) : seatLabel(openTotal)}</span><p className="mt-1 text-[11px] text-[#646c68]">{t.groupOpenIn.replace("{n}", String(ids.length))}</p></>}</div>
                  </div>
                  <div id={`reviews-${firstId}`} />
                  {group.sections.some((section) => ownMeetings(section, group.shared).length > 0) && <p className="mt-3 text-[11px] font-medium text-[#646c68]">{t.groupOwn}</p>}
                  <ul className="mt-1 divide-y divide-[#ece9e2] border-t border-[#ece9e2]">{group.sections.map((section) => sectionRow(section, group.shared))}</ul>
                </article>;
              })}</div>;
            })()}
            {sections.length > 0 && formatSeatReadTime(courseSeatCheckedAt, language) && <p className="mt-4 text-xs text-[#646c68]">{t.seatReadAt}: <time dateTime={courseSeatCheckedAt ?? undefined}>{formatSeatReadTime(courseSeatCheckedAt, language)}</time></p>}
            {sections.length > 0 && <p className="mt-2 text-xs leading-5 text-[#646c68]">{t.seatReadHint}</p>}
            {selected && <button type="button" onClick={() => openFeedback({ kind: "problem", context: reportDetails({ term: termLabel(term, "en"), courseId: selected.course_id, sectionIds: visibleSections.map((section) => sectionId(section, selected.course_id)).slice(0, 12), seatReadAt: formatSeatReadTime(courseSeatCheckedAt, "en") }) })} className="mt-3 inline-block text-xs font-medium text-[#a34a39] hover:underline">{t.reportCourse}</button>}
            <p className="mt-5 border-t border-[#ece9e2] pt-4 text-xs leading-5 text-[#646c68]">{t.freshness}</p>
          </div>
        </section>}

        {/* Mounted (hidden) outside step 02 too, so options regenerate while courses are added from search. */}
        {restored && <div hidden={step !== "schedule"}><SchedulePlanner onChosenChange={rememberSchedule} courses={planCourses} prereqNeeds={Object.fromEntries(planCourses.map((course) => [course.courseId, prereqNeeds(course.courseId) ?? []]))} takenEditor={<TakenCoursesEditor taken={taken} language={language} />} creditsLabel={planCreditLabel} creditWarning={planCreditWarning} creditMeter={planCreditMeter} planSwitch={planSwitch} term={term} termName={termLabel(term, "en")} language={language} onUpdateCourse={(courseId, patch) => setPlanCourses((current) => current.map((course) => course.courseId === courseId ? { ...course, ...patch } : course))} onRemove={(courseId) => setPlanCourses((current) => current.filter((course) => course.courseId !== courseId))} onRestoreCourse={(course, index) => setPlanCourses((current) => current.some((item) => item.courseId === course.courseId) ? current : [...current.slice(0, index), course, ...current.slice(index)])} onBack={() => setStep("find")} /></div>}

        {step === "watch" && <section className="mx-auto max-w-4xl rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.13em] text-[#9a5040]">03 · {t.watch}</p><h2 className="mt-2 font-serif text-3xl">{t.watchesTitle}</h2><p className="mt-2 max-w-xl text-xs leading-5 text-[#5d6561]">{t.watchCadence}</p></div><button onClick={() => void refreshWatches()} disabled={checking || !watches.length} className="rounded-lg bg-[#273c38] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{checking ? t.checking : t.refresh}</button></div>
          {authenticated === false && <div className="mt-6 rounded-xl border border-[#e3dfd6] bg-white p-5"><p className="text-sm font-medium">{t.signIn}</p><label className="mt-4 grid gap-1.5 text-xs font-medium text-[#5d6561]">{t.email}<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-lg border border-[#dedbd3] bg-white px-3 py-2.5 text-sm text-[#202728] outline-none focus:border-[#a34a39] focus:ring-2 focus:ring-[#a34a39]/30" /></label>{codeSent && <label className="mt-3 grid gap-1.5 text-xs font-medium text-[#5d6561]">{t.emailCode}<input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))} className="rounded-lg border border-[#dedbd3] bg-white px-3 py-2.5 text-sm tracking-[.2em] text-[#202728] outline-none focus:border-[#a34a39] focus:ring-2 focus:ring-[#a34a39]/30" /></label>}<p className="mt-2 text-xs leading-5 text-[#646c68]">{t.emailPrivacy}</p><div className="mt-4 flex flex-wrap gap-2">{!codeSent ? <button onClick={() => void requestEmailCode()} disabled={authBusy || !email.trim()} className="rounded-lg bg-[#273c38] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{authBusy ? t.loading : t.sendCode}</button> : <><button onClick={() => void verifyEmailCode()} disabled={authBusy || emailCode.length !== 6} className="rounded-lg bg-[#273c38] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{authBusy ? t.loading : t.verifyCode}</button><button onClick={() => void requestEmailCode()} disabled={authBusy || resendWait > 0} className="rounded-lg border border-[#dedbd3] px-4 py-2.5 text-sm font-medium text-[#5d6561] disabled:opacity-50">{resendWait > 0 ? t.resendIn.replace("{s}", String(resendWait)) : t.resendCode}</button></>}</div>{codeSent && <p className="mt-2 text-xs leading-5 text-[#745424]">{t.codeSpam}</p>}</div>}
          {authenticated === true && authProvider === "email" && <div className="mt-6 flex items-center justify-between rounded-xl border border-[#e3dfd6] bg-white px-4 py-3"><span className="text-xs text-[#5d6561]">{t.emailSignedIn}<span className="mt-0.5 block text-[11px] text-[#646c68]">{t.syncNote} <button type="button" onClick={() => void deleteSynced()} className="font-medium text-[#8b5148] underline underline-offset-2">{t.syncDelete}</button></span></span><span className="flex shrink-0 flex-col items-end gap-1"><button onClick={() => void signOutEmail()} className="text-xs font-medium text-[#8b5148] hover:underline">{t.signOut}</button><button type="button" onClick={() => void signOutAndClear()} className="text-[11px] text-[#646c68] hover:underline">{t.signOutClear}</button></span></div>}
          {authenticated === true && authProvider === "email" && <SeatEmailToggle language={language} defaultEmail={email} />}
          {authenticated !== false && !watches.length && <p className="mt-6 rounded-xl bg-[#f2f0eb] p-5 text-sm text-[#646c68]">{t.emptyWatches}</p>}{alerts.length > 0 && <div role="status" className="mt-5 rounded-xl border border-[#bdd4c1] bg-[#edf6ef] p-4 text-sm font-semibold text-[#315c43]">{language === "en" ? "Seats opened: " : "发现空位："}{alerts.join(", ")}</div>}
          {watches.length > 0 && <div className="mt-5 space-y-3">{[...watches.reduce((groups, watch) => groups.set(watch.term + "|" + watch.courseId, [...(groups.get(watch.term + "|" + watch.courseId) ?? []), watch]), new Map<string, Watch[]>()).values()].map((group) => {
            const watch = group[0]!;
            if (group.length === 1) return <article key={`${watch.term}-${watch.sectionId}`} className="rounded-xl border border-[#e3e0d8] bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-semibold">{watch.courseId} · {watch.courseTitle}</p><p className="mt-1 text-sm text-[#5d6561]">{watch.sectionId} <span className="mx-1 text-[#b5bab6]">/</span> {formatMeetings(watch.meetings)}</p><p className="mt-2 text-xs text-[#646c68]">{t.seatReadAt}: {formatSeatReadTime(watch.lastSuccessAt, language) ?? t.unknown}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${watch.status === "ok" && (watch.openSeats ?? 0) > 0 ? "bg-[#eaf4ec] text-[#367047]" : watch.status === "stale" || watch.status === "failed" ? "bg-[#fff0ec] text-[#8c352c]" : "bg-[#f1efe9] text-[#5d6561]"}`}>{watch.status === "stale" || watch.status === "failed" ? t.stale : watch.openSeats === null ? t.unknown : watch.openSeats > 0 ? t.open : t.full}</span><button onClick={() => void removeWatch(watch)} className="text-xs font-medium text-[#8b5148] hover:underline">{t.remove}</button></div></div><div className="mt-3 text-xs text-[#646c68]">{t.status}: {seatLabel(watch.openSeats)}{watch.waitlist !== null ? ` · ${t.waitlist}: ${watch.waitlist}` : ""}</div></article>;
            const openCount = group.filter((item) => item.status === "ok" && (item.openSeats ?? 0) > 0).length;
            return <article key={`${watch.term}-${watch.courseId}`} className="rounded-xl border border-[#e3e0d8] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-semibold">{watch.courseId} · {watch.courseTitle}</p><p className="mt-1 text-xs text-[#5d6561]">{t.watchGroup.replace("{n}", String(group.length))}{openCount ? <span className="ml-1 font-semibold text-[#367047]">· {t.watchGroupOpen.replace("{k}", String(openCount))}</span> : null}</p><p className="mt-1 text-xs text-[#646c68]">{t.seatReadAt}: {formatSeatReadTime(watch.lastSuccessAt, language) ?? t.unknown}</p></div><button onClick={() => void removeWatches(group)} className="text-xs font-medium text-[#8b5148] hover:underline">{t.removeAll}</button></div>
              <ul className="mt-3 divide-y divide-[#ece9e2] border-t border-[#ece9e2]">{group.map((item) => <li key={item.sectionId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-xs"><span className="min-w-0 text-[#48534f]"><span className="font-semibold">{item.sectionId}</span> <span className="text-[#646c68]">{formatMeetings(item.meetings)}</span></span><span className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === "ok" && (item.openSeats ?? 0) > 0 ? "bg-[#eaf4ec] text-[#367047]" : item.status === "stale" || item.status === "failed" ? "bg-[#fff0ec] text-[#8c352c]" : "bg-[#f1efe9] text-[#5d6561]"}`}>{item.status === "stale" || item.status === "failed" ? t.stale : item.openSeats === null ? t.unknown : item.openSeats > 0 ? t.open : t.full}</span><button onClick={() => void removeWatch(item)} className="font-medium text-[#8b5148] hover:underline">{t.remove}</button></span></li>)}</ul>
            </article>;
          })}</div>}
          {watches.length > 0 && <p className="mt-3 text-xs leading-5 text-[#646c68]">{t.seatReadHint}</p>}
          <p className="mt-5 border-t border-[#ece9e2] pt-4 text-xs leading-5 text-[#646c68]">{t.freshness}</p>
        </section>}
      </div>
    </main>
  );
}
