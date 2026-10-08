"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReferenceSchedule } from "@/app/components/gened-finder";
import RegistrationChecklist from "@/app/components/registration-checklist";
import { buildIcs, type IcsMeeting } from "@/lib/ics";
import { reportDetails } from "@/lib/report-link";
import { openFeedback } from "@/lib/feedback";
import { roomLabel } from "@/lib/room";
import { TERM_CALENDARS } from "@/lib/term-calendar";
import { readSavedState, writeSavedState } from "@/lib/saved-state";
import { formatSeatReadTime } from "@/lib/seat-time";
import { isAsyncOnline } from "@/lib/meeting-time";
import { buildingFor, CAMPUS_AREA_KEYS, mapsUrl, tightWalks } from "@/lib/campus-walk";
import ProfessorDetailCard from "@/app/components/professor-card";
import { optionHighlights } from "@/lib/option-highlights";
import { optionKey, OPTION_SORTS, sortOptions, type OptionSort } from "@/lib/option-sort";
import { PRESET_KEYS, presetActive, togglePreset, type PresetFields, type PresetKey } from "@/lib/schedule-presets";
import { planKey } from "@/lib/plan-key";
import { sharePath } from "@/lib/shared-schedule";
import { weekFromSections, writeMyWeek } from "@/lib/my-week";
import { anonymousBusyBlocks, type BusyBlock } from "@/lib/personal-schedule";
import type { ScheduleOption, ScheduledSection, PlanDiagnosis, PlanRepair } from "@/lib/planner";
import { PersonalSchedule, repairText, ScheduleRecovery, SectionSwap } from "@/app/components/schedule-tools";
import { SeasonNote, useOfferingSeasons } from "@/app/components/season-note";
import { PrintSchedule } from "@/app/components/print-sheet";
import { WorkloadCard } from "@/app/components/workload-card";
import { CreditMeter, WeekLoadChart } from "@/app/components/plan-insights";
import type { CreditMeter as CreditMeterData } from "@/lib/plan-credits";
import { countUse } from "@/lib/usage";
export type { ScheduledSection } from "@/lib/planner";

type Language = "en" | "zh";
type PlanCourse = { courseId: string; courseTitle: string; instructors?: string[]; pinnedSectionId?: string; excludedSectionIds?: string[] };
// Mirrors PlanWarning in lib/planner.ts.
type PlanWarning = { code: string; courseId?: string; sectionId?: string; count?: number };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const COLORS = ["#bda0d5", "#ffdadb", "#79ded4", "#ecd34e", "#a8c9ed", "#f2b98c", "#bcd7a1", "#d6bee5", "#accfce", "#e2c4a2"];
const copy = {
  en: {
    courses: "Courses in this plan", addCourse: "Add a course from search to generate options.", remove: "Remove",
    generate: "Generate schedules", generating: "Finding conflict-free schedules…", preferences: "Schedule preferences",
    earliest: "Earliest class start", excluded: "Avoid these days", window: "Preferred time window",
    start: "From", end: "To", strict: "Keep every class inside this window", options: "Top schedule options",
    ranking: "Ordered by instructor ratings, early starts and walks between buildings. Breaks between classes do not lower the score. Options with full sections come last.",
    scoreHow: "How this score is built", scoreTotal: "Score", scoreNote: "Higher is better. The score only compares these options with each other.",
    scorePart: { base: "Starting points", rating: "Average instructor rating", gpa: "Average GPA instructors gave (±0.2 per 0.1 from 3.0)", longWalks: "Walks over 10 min ({count} extra min a week × −0.10)", early: "Classes before {time} ({count} × −0.70)", unknown: "Unknown times or unrated instructors ({count} × −0.35)", window: "Time outside your preferred window ({count} min)", full: "Full sections ({count} × −2.50)", walks: "Hard-to-reach classes ({count} a week)", days: "Days on campus ({count} × −1.20)", walkTime: "Walking between buildings ({count} min a week × −0.025)" },
    highlight: { noRush: "No rushing between buildings", rating: "Highest-rated instructors", days: "Fewest days on campus", gaps: "Fewest gaps between classes", lateStart: "Latest first class", window: "Best fit for your time window", balanced: "Best overall balance", onlyOne: "The only schedule that fits", nearby: "Least walking between classes" },
    option: "Option", score: "Score", rating: "Instructor rating", gaps: "Between-class gaps", days: "Campus days", firstClass: "earliest class",
    sortLabel: "Order",
    presetsTitle: "Quick setups",
    presetsNote: "Each button fills in the preferences below, so you can adjust or undo any part of it. Tap again to turn it off.",
    preset: { noFriday: "No Friday classes", noEarly: "No classes before 10am", noEvening: "Nothing after 5pm", fewerDays: "Fewest days on campus", nearby: "Keep classes close together" },
    presetHint: {
      noFriday: "Adds Friday to the days to avoid. Sections that meet on Friday are left out.",
      noEarly: "Sets the earliest class start to 10:00. Sections starting earlier are left out.",
      noEvening: "Keeps every class inside 8:00–17:00. Sections that run past 5pm are left out.",
      fewerDays: "Ranks schedules that fit into fewer days higher. It does not leave any section out.",
      nearby: "Ranks schedules with less walking between buildings higher. It does not leave any section out.",
    },
    preferFewerDays: "Prefer fewer days on campus (ranking only, no section is left out)",
    preferNearby: "Prefer less walking between buildings (ranking only, no section is left out)",
    areasTitle: "Parts of campus to stay in",
    areasNote: "With none ticked, classes anywhere on campus are used. Ticking some leaves out sections that meet elsewhere; online classes and rooms with no listed building are always kept.",
    area: { engineering: "Engineering & sciences", north: "North campus", mall: "McKeldin Mall & libraries", south: "South campus", west: "West campus" },
    areaExample: { engineering: "Iribe, Kim, Chemistry, Math", north: "Public Health, the hill, recreation", mall: "Tydings, McKeldin, St. John, Union", south: "Van Munching, Architecture, LeFrak", west: "UMUC, Knight Hall" },
    walkWeek: "Walking between classes", perWeek: "a week",
    areasLabel: "Campus areas",
    sortedNote: "Same options, in the order you chose. Options without a value for it come last.",
    optionSort: { best: "Best overall", fewestDays: "Fewest days on campus", latestStart: "Latest first class", fewestGaps: "Fewest gaps", highestRating: "Highest instructor rating", leastWalking: "Least walking" },
    openOnly: "Only use sections with open seats", preferGpa: "Prefer instructors who give higher grades (PlanetTerp average GPA in the course)", avgGpa: "Avg GPA", fullIn: "Full", seatsUnknown: "Seats unknown", full: "Full", seat: "seat open", seatsOpen: "seats open", waitlisted: "{n} waitlisted", holdfiled: "{n} on hold file", noWaitlist: "nobody waitlisted yet",
    windowHint: "Classes outside this window lower the ranking; tick the box to exclude them.",
    oddTime: "{field} is set to {time}, which looks like a typo: UMD classes run between about 7am and 10pm.", clearTime: "Clear it",
    earlyLabel: "Early classes lose points if they start before", earlyOff: "Don't count early classes", earlyDefault: "(default)",
    earlyHint: "Each class that starts earlier costs 0.7 points. Pick an earlier time if you don't mind 8am classes.",
    resetPrefs: "Clear preferences", resetDone: "Preferences cleared.", undo: "Undo",
    resetHint: "Clears the preferences above. Your personal schedule and class buffer stay.",
    includeFc: "I'm in the Freshman Connection program (include FC sections)",
    exportCalendar: "Export to calendar (.ics)",
    shareSchedule: "Copy share link", shareCopied: "Link copied", shareReady: "Share link", shareCopyFailed: "Copy the link below to share this schedule.",
    shareHint: "Anyone with this link can see these sections. Times and seats are refreshed when they open it.",
    exportHelp: "Apple Calendar / Outlook: open the downloaded file. Google Calendar: on a computer, Settings → Import & export → Import.",
    exportUnavailable: "Calendar export is not available for this term yet.",
    exportSkipped: "Left out (time TBA):",
    exportNote: "Regular class weeks only, without holidays or final exams. Confirm times and rooms in Testudo.",
    onlineAsync: "Online, no set time (not shown on the grid):", onlineNoTime: "Online · no set time",
    incompleteTag: "Missing", incompleteTitle: "This schedule is incomplete",
    incompleteBody: "These courses could not be placed and are not in this schedule, its share link, calendar file, or registration checklist:",
    updating: "Updating options for your latest changes…", autoNote: "Options update automatically when you change courses or preferences.",
    staleOptions: "Your preferences changed since these options were generated. Generate again to apply them.",
    pinnedNote: "Sections you required are kept even when they are full or Freshman Connection.",
    onlyInstructors: "Only", minutes: "min", credits: "credits", credit: "credit", lecture: "Lecture", discussion: "Discussion", lab: "Lab",
    // Short forms for the narrow timetable blocks.
    lectureShort: "LEC", discussionShort: "DIS", labShort: "LAB",
    select: "View this schedule", calendar: "Weekly timetable", unknown: "Times to confirm", noUnknown: "All meeting times are listed.", useWeek: "Use as my week", weekSaved: "Saved. Open My week →", weekHint: "My week lists each day's classes with building map links and works without internet. You can add it to your phone's home screen.", reportSchedule: "Something wrong in this schedule (a time, room or map link)? Report it",
    noOptions: "No conflict-free schedule was found. Remove a preference or course and try again.",
    fit: "Preferred-window fit", warning: "Some meeting times are missing, so those sections cannot be fully checked.",
    loadError: "Schedule options could not be generated. Please try again.", invalidWindow: "Enter both ends of the preferred window, with the start before the end.", back: "← Back to course search",
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    pinned: "Required section", excludedSections: "Excluded sections", changeSections: "Change in course search",
    seatReadAt: "Seat data read", seatReadHint: "“Seat data read” is when TerpPlan read the source, not when UMD updated it.",
    tightWalks: "Hard-to-reach classes", times: "a week",
    prereqNeeds: "Prerequisite not met yet: {needs}",
    prefsSet: "{n} set", prefsShow: "Show all", prefsHide: "Hide",
    openMap: "Open in Google Maps", walkTitle: "Classes that may be hard to reach in time",
    walkLine: "{day}: {from} ({fromBuilding}) ends {end}, {to} ({toBuilding}) starts {start}. {gap} min between them, about {walk} min walk.",
    walkNote: "Walking time is a rough estimate from the distance between buildings (about 80 m a minute along paths), not a route. Tap a building in the timetable to see it on a map.",
  },
  zh: {
    courses: "待排课程", addCourse: "请先从找课中添加课程，再生成方案。", remove: "移除",
    generate: "生成排课方案", generating: "正在寻找无时间冲突的方案…", preferences: "排课偏好",
    earliest: "最早上课时间", excluded: "希望避开的日期", window: "偏好上课时间段",
    start: "开始", end: "结束", strict: "所有课程都必须在此时间段内", options: "推荐方案",
    ranking: "按教师评分、早课和换楼步行时间排序；课间休息不扣分，有已满班次的方案排在最后。",
    scoreHow: "分数是怎么算的", scoreTotal: "综合分", scoreNote: "分数越高越好，只用来比较这几个方案。",
    scorePart: { base: "基础分", rating: "教师平均评分", gpa: "老师给出的平均 GPA（比 3.0 每高 / 低 0.1，加 / 减 0.2 分）", longWalks: "走路超过 10 分钟（每周多走 {count} 分钟 × −0.10）", early: "{time} 前的课（{count} 节 × −0.70）", unknown: "时间待定或没有评分的老师（{count} 项 × −0.35）", window: "超出时间偏好（{count} 分钟）", full: "已满班次（{count} 个 × −2.50）", walks: "课间来不及走（每周 {count} 处）", days: "到校天数（{count} 天 × −1.20）", walkTime: "楼之间的步行时间（每周 {count} 分钟 × −0.025）" },
    highlight: { noRush: "不用赶场换楼", rating: "教师评分最高", days: "到校天数最少", gaps: "课间空档最少", lateStart: "第一节课最晚", window: "最符合时间偏好", balanced: "综合最均衡", onlyOne: "唯一能排下的方案", nearby: "课间步行最少" },
    option: "方案", score: "综合分", rating: "教师评分", gaps: "课间空档", days: "到校天数", firstClass: "最早上课",
    sortLabel: "排序",
    presetsTitle: "快捷设置",
    presetsNote: "每个按钮都会填进下面的偏好，你可以再逐项调整或撤销。再点一次即可关闭。",
    preset: { noFriday: "周五无课", noEarly: "上午 10 点前无课", noEvening: "下午 5 点后无课", fewerDays: "到校天数最少", nearby: "上课地点集中" },
    presetHint: {
      noFriday: "把周五加入“避开这些日期”，周五上课的班次会被排除。",
      noEarly: "把“最早上课时间”设为 10:00，更早开始的班次会被排除。",
      noEvening: "把所有课限制在 8:00–17:00，超过 17:00 的班次会被排除。",
      fewerDays: "让到校天数更少的方案排在前面，不会排除任何班次。",
      nearby: "让楼之间步行更少的方案排在前面，不会排除任何班次。",
    },
    preferFewerDays: "优先到校天数少的方案（只影响排序，不排除班次）",
    preferNearby: "优先楼之间步行少的方案（只影响排序，不排除班次）",
    areasTitle: "希望集中的校园区域",
    areasNote: "不勾选时使用全校的班次。勾选后，在其他区域上课的班次会被排除；线上课程和没有标注楼的教室始终保留。",
    area: { engineering: "工程与理科区", north: "北校区", mall: "McKeldin 草坪与图书馆", south: "南校区", west: "西校区" },
    areaExample: { engineering: "Iribe、Kim、化学楼、数学楼", north: "公共卫生、宿舍山、体育中心", mall: "Tydings、McKeldin、St. John、学生会", south: "Van Munching、建筑楼、LeFrak", west: "UMUC、Knight Hall" },
    walkWeek: "课间步行", perWeek: "每周",
    areasLabel: "校园区域",
    sortedNote: "方案不变，只是换了顺序。该指标没有数据的方案排在最后。",
    optionSort: { best: "综合最佳", fewestDays: "到校天数最少", latestStart: "第一节课最晚", fewestGaps: "课间空档最少", highestRating: "教师评分最高", leastWalking: "课间步行最少" },
    openOnly: "只使用有空位的班次", preferGpa: "优先选给分高的老师（按 PlanetTerp 上该课的平均 GPA）", avgGpa: "平均 GPA", fullIn: "已满", seatsUnknown: "余位未知", full: "已满", seat: "个空位", seatsOpen: "个空位", waitlisted: "候补 {n} 人", holdfiled: "Hold file {n} 人", noWaitlist: "还没有人候补",
    windowHint: "时间段外的课程会降低排名；勾选后会直接排除。",
    oddTime: "{field}设成了 {time}，看起来像输错了：UMD 的课一般在早上 7 点到晚上 10 点之间。", clearTime: "清除",
    earlyLabel: "几点前开始的课算早课并扣分", earlyOff: "早课不扣分", earlyDefault: "（默认）",
    earlyHint: "每节早课扣 0.7 分。不介意早八的话，可以选更早的时间。",
    resetPrefs: "清空偏好", resetDone: "偏好已清空。", undo: "撤销",
    resetHint: "清空上面的偏好设置，个人日程和课间缓冲不变。",
    includeFc: "我参加了 Freshman Connection 项目（包含 FC 班次）",
    exportCalendar: "导出到日历（.ics）",
    shareSchedule: "复制分享链接", shareCopied: "链接已复制", shareReady: "分享链接", shareCopyFailed: "请复制下方链接分享这个课表。",
    shareHint: "拿到链接的人可以查看这些班次；打开时会重新读取上课时间与余位。",
    exportHelp: "Apple 日历 / Outlook：直接打开下载的文件。Google 日历：在电脑上进入 设置 → 导入和导出 → 导入。",
    exportUnavailable: "这个学期的校历还没配置，暂时无法导出。",
    exportSkipped: "未导出（时间待定）：",
    exportNote: "只包含正常上课周，已去掉假期，不含期末考试。请以 Testudo 的时间和教室为准。",
    onlineAsync: "线上、无固定时间（不显示在课表格子里）：", onlineNoTime: "线上 · 无固定时间",
    incompleteTag: "缺少", incompleteTitle: "这个方案不完整",
    incompleteBody: "下面这些课没能排进来，不在这个方案里，也不会出现在分享链接、日历文件和选课清单中：",
    updating: "正在根据最新的改动更新方案…", autoNote: "修改课程或排课偏好后，方案会自动更新。",
    staleOptions: "排课偏好在生成这些方案后改过了。请重新生成，新的偏好才会生效。",
    pinnedNote: "你指定的班次即使已满或属于 FC，也会保留在方案里。",
    onlyInstructors: "只排", minutes: "分钟", credits: "学分", credit: "学分", lecture: "讲课", discussion: "讨论课", lab: "实验课",
    lectureShort: "讲课", discussionShort: "讨论课", labShort: "实验课",
    select: "查看此方案", calendar: "每周课表", unknown: "需要确认的时间", noUnknown: "所有班次均列出了上课时间。", useWeek: "设为我的一周", weekSaved: "已保存，打开“我的一周” →", weekHint: "“我的一周”按天列出每节课和楼的地图链接，没有网络也能看，可以添加到手机主屏幕。", reportSchedule: "课表里有信息不对（时间、教室或地图链接）？告诉我们",
    noOptions: "没有找到无冲突方案。可以移除一项偏好或课程后重试。",
    fit: "符合时间偏好的比例", warning: "部分班次时间缺失，无法完整验证这些课程是否冲突。",
    loadError: "暂时无法生成排课方案，请重试。", invalidWindow: "请填写完整的偏好时间段，并确保开始时间早于结束时间。", back: "← 返回找课",
    weekdays: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
    pinned: "指定班次", excludedSections: "已排除班次", changeSections: "返回找课修改班次",
    seatReadAt: "余位数据读取于", seatReadHint: "“余位数据读取于”是 TerpPlan 读取数据的时间，不代表 UMD 更新数据的时间。",
    tightWalks: "课间来不及走", times: "处/周",
    prereqNeeds: "先修课还没满足：{needs}",
    prefsSet: "已设 {n} 项", prefsShow: "展开全部", prefsHide: "收起",
    openMap: "在 Google 地图中打开", walkTitle: "这些课之间可能来不及走过去",
    walkLine: "{day}：{from}（{fromBuilding}）{end} 下课，{to}（{toBuilding}）{start} 上课。课间 {gap} 分钟，步行约 {walk} 分钟。",
    walkNote: "步行时间是按楼与楼之间的距离粗略估算的（沿路约每分钟 80 米），不是实际路线。点课表里的教学楼可以在地图上查看。",
  },
} as const;

type Props = {
  courses: PlanCourse[];
  term: string;
  // English term name such as "Spring 2027", used for the calendar name and file name.
  termName: string;
  language: Language;
  onRemove: (courseId: string) => void;
  // Running credit total for the plan, before any option is generated.
  creditsLabel?: string;
  creditWarning?: string;
  creditMeter?: CreditMeterData | null;
  // Unmet prerequisites per course, already worded (empty when met or not checked).
  prereqNeeds?: Record<string, string[]>;
  // Where the student enters the courses they've taken, shown above the course list.
  takenEditor?: React.ReactNode;
  // The Plan A / Plan B switch, owned by the page.
  planSwitch?: React.ReactNode;
  onBack: () => void;
  onUpdateCourse: (courseId: string, patch: Partial<PlanCourse>) => void;
  // Puts a course back at its place in the plan (undoing "remove this course" from a fix).
  onRestoreCourse?: (course: PlanCourse, index: number) => void;
  // Reports the option being viewed so the Gen Ed finder can check conflicts against it.
  onChosenChange?: (schedule: ReferenceSchedule) => void;
};

// Day names as Testudo writes them, so meeting-time parsing reads personal commitments like classes.
const BUSY_DAY_CODES: Record<string, string> = { Mon: "M", Tue: "Tu", Wed: "W", Thu: "Th", Fri: "F", Sat: "Sa", Sun: "Su" };

export function dayNames(raw: string | null | undefined) {
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

export function minutes(raw: string | null | undefined) {
  if (!raw || /tba|tbd/i.test(raw)) return null;
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})\s*([ap]m)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (match[3]) { if (hour === 12) hour = 0; if (match[3].toLowerCase() === "pm") hour += 12; }
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function displayClock(value: number) {
  const hour = Math.floor(value / 60);
  return (hour % 12 || 12) + ":" + String(value % 60).padStart(2, "0") + (hour < 12 ? "am" : "pm");
}

// Hour lines on the timetable: "9am", "12pm". Short enough not to be cut off when text is enlarged.
function hourLabel(value: number) {
  const hour = Math.floor(value / 60);
  return (hour % 12 || 12) + (hour < 12 || hour === 24 ? "am" : "pm");
}

function seatCount(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
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
      case "pinnedSectionUnavailable": return (warning.sectionId ?? course) + " 已不在本学期班次列表中，请重新指定。";
      case "pinnedSectionPreferenceConflict": return "你指定的 " + (warning.sectionId ?? course) + " 和你的日期或时间偏好冲突。请调整偏好或指定其他班次。";
      case "allSectionsExcluded": return course + " 的所有班次均被排除，请重新纳入至少一个班次。";
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
    case "pinnedSectionUnavailable": return (warning.sectionId ?? course) + " is no longer listed for this term. Choose another required section.";
    case "pinnedSectionPreferenceConflict": return "Your required section " + (warning.sectionId ?? course) + " conflicts with your day or time preferences. Adjust your preferences or choose another section.";
    case "allSectionsExcluded": return "All sections of " + course + " are excluded. Allow at least one section.";
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

// The parts of one option's score, as the planner computed them; they add up to the score shown.
function ScoreBreakdown({ option, language }: { option: ScheduleOption; language: Language }) {
  const t = copy[language];
  const parts = (option.scoreParts ?? []).filter((part) => part.key === "base" || part.key === "rating" || Math.abs(part.points) >= 0.005);
  const signed = (value: number) => (value < 0 ? "−" : "+") + Math.abs(value).toFixed(2);
  return <div className="mt-3 rounded-lg border border-[#dfe5e1] bg-white/80 p-3 text-[11px] leading-5 text-[#48534f]">
    <p className="font-semibold text-[#273c38]">{t.scoreHow}</p>
    <ul className="mt-1">{parts.map((part) => <li key={part.key} className="flex justify-between gap-3"><span>{fill(t.scorePart[part.key], { count: part.count ?? 0, time: part.at ?? "" })}</span><span className="tabular-nums">{signed(part.points)}</span></li>)}</ul>
    <p className="mt-1 flex justify-between gap-3 border-t border-[#e6e4de] pt-1 font-semibold text-[#273c38]"><span>{t.scoreTotal}</span><span className="tabular-nums">{option.score.toFixed(2)}</span></p>
    <p className="mt-1 text-[#646c68]">{t.scoreNote}</p>
  </div>;
}

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

// A meeting's room label; the building opens in Google Maps when TerpPlan knows where it is.
function RoomLink({ building, room, language, className = "" }: { building?: string | null; room?: string | null; language: Language; className?: string }) {
  const label = roomLabel(building, room, language);
  const place = /online|tba|tbd/i.test(label) ? null : buildingFor(building);
  if (!place) return <span className={className}>{label}</span>;
  return <a href={mapsUrl(place)} target="_blank" rel="noopener noreferrer" title={`${place.name} · ${copy[language].openMap}`} className={`pointer-events-auto relative z-10 underline decoration-dotted underline-offset-2 hover:text-[#a34a39] ${className}`}>{label}</a>;
}

export function WeeklyCalendar({ sections: courseSections, language, busyBlocks = [], onSelectSection }: { sections: ScheduledSection[]; language: Language; busyBlocks?: BusyBlock[]; onSelectSection?: (section: ScheduledSection) => void }) {
  const t = copy[language];
  const personalIds = new Set(busyBlocks.map((block) => `personal-${block.id}`));
  const sections: ScheduledSection[] = [...courseSections, ...busyBlocks.map((block) => ({ course_id: `personal-${block.id}`, section_id: `personal-${block.id}`, course_title: block.label || (language === "zh" ? "固定日程" : "Commitment"), credits: null, instructorRatings: [], meetings: [{ days: block.days.join(" "), start_time: block.start, end_time: block.end }] }))];
  const knownStarts = sections.flatMap((section) => (section.meetings ?? []).flatMap((meeting) => minutes(meeting.start_time) === null ? [] : [minutes(meeting.start_time)!]));
  const knownEnds = sections.flatMap((section) => (section.meetings ?? []).flatMap((meeting) => minutes(meeting.end_time) === null ? [] : [minutes(meeting.end_time)!]));
  // The grid covers the hours that have classes (at least five), not a fixed 8am–10pm, so a schedule of
  // late-morning classes is not a short strip above a tall empty column.
  const firstMinute = knownStarts.length ? Math.floor(Math.min(...knownStarts) / 60) * 60 : 8 * 60;
  const lastMinute = Math.min(24 * 60, Math.max(firstMinute + 5 * 60, knownEnds.length ? Math.ceil(Math.max(...knownEnds) / 60) * 60 : 17 * 60));
  // Saturday and Sunday columns only when something meets then.
  const weekend = new Set(sections.flatMap((section) => (section.meetings ?? []).flatMap((meeting) => isAsyncOnline(meeting) ? [] : dayNames(meeting.days))));
  const gridDays = DAYS.filter((day) => (day !== "Sat" && day !== "Sun") || weekend.has(day));
  // 75px an hour, so a 50-minute class has room for its two lines even with enlarged text.
  const pixelsPerMinute = 1.25;
  const height = (lastMinute - firstMinute) * pixelsPerMinute;
  const unknown = new Set<string>();
  const online = new Set<string>();
  const walks = tightWalks(courseSections);
  for (const section of sections) if (!section.meetings?.length) unknown.add(section.section_id);
  const colors = new Map([...new Set(sections.map((section) => section.course_id))].map((courseId, index) => [courseId, personalIds.has(courseId) ? "#dce2df" : COLORS[index % COLORS.length]]));
  const columnClass = "relative border-l border-[#e6e4de] bg-[linear-gradient(to_bottom,transparent_74px,#e7e4dc_75px)] bg-[length:100%_75px]";
  // Phones show the week as a list by day; the 900px grid would need sideways scrolling there.
  const byDay = DAYS.map((day, dayIndex) => ({
    day,
    label: t.weekdays[dayIndex],
    items: sections.flatMap((section) => (section.meetings ?? []).flatMap((meeting, index) => {
      const start = minutes(meeting.start_time), end = minutes(meeting.end_time);
      if (isAsyncOnline(meeting) || start === null || end === null || end <= start || !dayNames(meeting.days).includes(day)) return [];
      const kind = meetingType(meeting.classtype);
      return [{ key: `${section.section_id}-${index}`, section, start, end, type: kind ? t[kind] : null, meeting }];
    })).sort((a, b) => a.start - b.start),
  })).filter((entry) => entry.items.length);
  return <div className="overflow-x-auto rounded-xl border border-[#e0ddd5] bg-white">
    <div className="divide-y divide-[#ece9e2] sm:hidden">{byDay.map((entry) => <div key={entry.day} className="px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#59635f]">{entry.label}</p>
      <div className="mt-2 space-y-2">{entry.items.map((item) => <div key={item.key} className="relative flex w-full gap-3 rounded-lg border border-[#ece9e2] p-2.5 text-left">
        {/* The whole card opens the section swap; the building is a separate link on top of it. */}
        <button type="button" disabled={!onSelectSection || personalIds.has(item.section.section_id)} onClick={() => onSelectSection?.(item.section)} aria-label={`${item.section.section_id} · ${displayClock(item.start)}–${displayClock(item.end)}`} className="absolute inset-0 rounded-lg enabled:hover:bg-[#f4f8f5]" />
        <span aria-hidden="true" className="pointer-events-none relative w-1 shrink-0 rounded-full" style={{ backgroundColor: colors.get(item.section.course_id) }} />
        <span className="pointer-events-none relative min-w-0 text-xs leading-5">
          <strong className="block text-[#24312d]">{displayClock(item.start)}–{displayClock(item.end)}</strong>
          <span className="block text-[#48534f]">{personalIds.has(item.section.section_id) ? item.section.course_title : item.section.section_id}{!personalIds.has(item.section.section_id) && item.type ? ` · ${item.type}` : ""}</span>
          {!personalIds.has(item.section.section_id) && <RoomLink building={item.meeting.building} room={item.meeting.room} language={language} className="block w-fit text-[#646c68]" />}
        </span>
      </div>)}</div>
    </div>)}</div>
    <div className="hidden sm:grid" style={{ gridTemplateColumns: `58px repeat(${gridDays.length}, minmax(0, 1fr))`, minWidth: 58 + gridDays.length * 120 }}>
      <div className="sticky top-0 z-10 bg-white p-3 text-center text-[11px] text-[#646c68]">ET</div>
      {gridDays.map((day) => <div key={day} className="sticky top-0 z-10 border-l border-[#e6e4de] bg-white p-3 text-center text-xs font-semibold text-[#59635f]">{t.weekdays[DAYS.indexOf(day)]}</div>)}
      <div className="relative" style={{ height }}>
        {/* Labels sit centred on their hour line, except the first and last, which would be half hidden under the day header or past the bottom edge. */}
        {Array.from({ length: (lastMinute - firstMinute) / 60 + 1 }, (_, index) => <span key={index} className={`absolute right-2 text-[10px] text-[#646c68] ${index === 0 ? "translate-y-0.5" : index === (lastMinute - firstMinute) / 60 ? "-translate-y-full" : "-translate-y-1/2"}`} style={{ top: index * 60 * pixelsPerMinute }}>{hourLabel(firstMinute + index * 60)}</span>)}
      </div>
      {gridDays.map((day) => <div key={day} className={columnClass} style={{ height }}>
        {sections.flatMap((section) => (section.meetings ?? []).flatMap((meeting, index) => {
          const start = minutes(meeting.start_time);
          const end = minutes(meeting.end_time);
          const meetingDays = dayNames(meeting.days);
          if (isAsyncOnline(meeting)) { online.add(section.section_id); return []; }
          if (start === null || end === null || end <= start || !meetingDays.length) {
            unknown.add(section.section_id);
            return [];
          }
          if (!meetingDays.includes(day)) return [];
          const clippedStart = Math.max(start, firstMinute);
          const clippedEnd = Math.min(end, lastMinute);
          if (clippedEnd <= clippedStart) return [];
          const kind = meetingType(meeting.classtype);
          const shortType = kind ? t[`${kind}Short`] : null;
          const sectionNumber = section.section_id.slice(section.course_id.length + 1) || section.section_id;
          const room = roomLabel(meeting.building, meeting.room, language);
          const personal = personalIds.has(section.section_id);
          const title = (personal ? section.course_title : section.section_id) + " · " + displayClock(start) + "–" + displayClock(end) + (personal ? "" : " · " + room);
          return [<div key={section.section_id + "-" + day + "-" + index} className="absolute inset-x-1 flex flex-col justify-center-safe overflow-hidden rounded-md border border-white/80 text-center text-[10px] leading-tight text-[#24312d] shadow-sm" style={{ top: (clippedStart - firstMinute) * pixelsPerMinute, height: Math.max(30, (clippedEnd - clippedStart) * pixelsPerMinute), backgroundColor: colors.get(section.course_id) }}>
            {/* The block opens the section swap; the building is a separate link on top of it. */}
            <button type="button" disabled={!onSelectSection || personal} onClick={() => onSelectSection?.(section)} title={title} aria-label={title} className="absolute inset-0 rounded-md enabled:hover:ring-2 enabled:hover:ring-inset enabled:hover:ring-[#536d64]" />
            <div className="pointer-events-none relative px-1.5 py-1"><strong className="block truncate">{personal ? section.course_title : `${section.course_id} · ${sectionNumber}`}</strong>{/* Every block reads the same three lines: course, time, room · type. Enlarged text that does not fit
                loses the last line first (the room is also in the tooltip and the list below). */}<span className="block truncate">{displayClock(start)}–{displayClock(end)}</span>{!personal && <span className="block truncate"><RoomLink building={meeting.building} room={meeting.room} language={language} />{shortType ? " · " + shortType : ""}</span>}</div>
          </div>];
        }))}
      </div>)}
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-[#e6e4de] px-4 py-3 text-[11px] text-[#59635f]">
      {[...colors].filter(([courseId]) => !personalIds.has(courseId)).map(([courseId, color]) => <span key={courseId} className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />{courseId}</span>)}
      {busyBlocks.length > 0 && <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-[#dce2df]" />{language === "zh" ? "个人日程" : "Personal commitments"}</span>}
    </div>
    {unknown.size > 0 ? <p className="border-t border-[#e6e4de] bg-[#fff8e8] px-4 py-3 text-xs text-[#745424]">{t.warning} {t.unknown}: {[...unknown].join(", ")}</p> : <p className="border-t border-[#e6e4de] px-4 py-3 text-xs text-[#646c68]">{t.noUnknown}</p>}
    {online.size > 0 && <p className="border-t border-[#e6e4de] px-4 py-3 text-xs text-[#536d64]">{t.onlineAsync} {[...online].join(", ")}</p>}
    {walks.length > 0 && <div className="border-t border-[#e6e4de] bg-[#fff8e8] px-4 py-3 text-xs text-[#745424]">
      <p className="font-semibold">{t.walkTitle}</p>
      <ul className="mt-1 list-disc space-y-1 pl-4">{walks.map((walk) => <li key={walk.day + walk.from.sectionId + walk.to.sectionId}>{fill(t.walkLine, { day: t.weekdays[DAYS.indexOf(walk.day as (typeof DAYS)[number])] ?? walk.day, from: walk.from.sectionId, fromBuilding: walk.from.building, end: displayClock(walk.from.end), to: walk.to.sectionId, toBuilding: walk.to.building, start: displayClock(walk.to.start), gap: walk.gapMinutes, walk: walk.walkMinutes })}</li>)}</ul>
      <p className="mt-2 text-[11px] text-[#8a6a35]">{t.walkNote}</p>
    </div>}
  </div>;
}

export function CalendarExport({ sections, term, termName, language, incomplete, children }: { sections: ScheduledSection[]; term: string; termName: string; language: Language; incomplete: boolean; children?: React.ReactNode }) {
  const t = copy[language];
  const calendar = TERM_CALENDARS[term];
  const [skipped, setSkipped] = useState<string[]>([]);

  const download = () => {
    if (!calendar) return;
    const meetings: IcsMeeting[] = [];
    const tba: string[] = [];
    for (const section of sections) {
      (section.meetings ?? []).forEach((meeting, index) => {
        const start = minutes(meeting.start_time), end = minutes(meeting.end_time), days = dayNames(meeting.days);
        // Asynchronous online work has no slot to put on a calendar and is not missing information.
        if (isAsyncOnline(meeting)) return;
        if (start === null || end === null || end <= start || !days.length) { tba.push(section.section_id); return; }
        const kind = meetingType(meeting.classtype);
        meetings.push({
          uid: `${term}-${section.section_id}-${index}@terpplan.com`,
          summary: `${section.course_id} ${kind ? t[kind] : ""}`.trim(),
          location: roomLabel(meeting.building, meeting.room, language),
          description: [`${section.section_id} · ${section.course_title}`, (section.instructors ?? []).join(", "), t.exportNote].filter(Boolean).join("\n"),
          days,
          start,
          end,
        });
      });
      if (!section.meetings?.length) tba.push(section.section_id);
    }
    setSkipped([...new Set(tba)]);
    const ics = buildIcs(meetings, calendar, `TerpPlan · ${termName}${incomplete ? (language === "zh" ? "（不完整）" : " (incomplete)") : ""}`);
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `terpplan-${termName.toLowerCase().replace(/\s+/g, "-")}.ics`;
    link.click(); countUse("calendar");
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="mb-3 rounded-xl border border-[#e3e0d8] bg-white p-3 sm:p-4">
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={download} disabled={!calendar} className="rounded-lg bg-[#273c38] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d302c] disabled:opacity-50">{t.exportCalendar}</button>
      <p className="w-full text-[11px] leading-5 text-[#646c68] sm:w-auto sm:min-w-0 sm:flex-1">{calendar ? t.exportHelp : t.exportUnavailable}</p>
    </div>
    {calendar && <p className="mt-2 text-[11px] leading-5 text-[#646c68]">{t.exportNote}</p>}
    {skipped.length > 0 && <p className="mt-2 text-[11px] text-[#745424]">{t.exportSkipped} {skipped.join(", ")}</p>}
    {children && <div className="mt-3 border-t border-[#eeeae3] pt-3">{children}</div>}
  </div>;
}

export default function SchedulePlanner({ courses, term, termName, language, creditsLabel, creditWarning, creditMeter, prereqNeeds = {}, takenEditor, planSwitch, onRemove, onBack, onChosenChange, onUpdateCourse, onRestoreCourse }: Props) {
  const t = copy[language];
  const [generated, setGenerated] = useState<{ requestKey: string; prefsKey: string; options: ScheduleOption[]; warnings: PlanWarning[]; diagnostics?: PlanDiagnosis[]; repairs?: PlanRepair[] }>({ requestKey: "", prefsKey: "", options: [], warnings: [] });
  // The option being viewed, kept by its section ids so re-sorting the list does not move the selection.
  const [selectedKey, setSelectedKey] = useState("");
  const [optionSort, setOptionSort] = useState<OptionSort>("best");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  // Which option was last saved as "My week", so the button can say so until another option is chosen.
  const [weekSavedFor, setWeekSavedFor] = useState("");
  // This panel only mounts after the page has loaded in the browser, so it can read saved preferences directly.
  const [savedPreferences] = useState(() => readSavedState().preferences);
  const [excludedDays, setExcludedDays] = useState<string[]>(savedPreferences?.excludedDays ?? []);
  const [earliestStart, setEarliestStart] = useState(savedPreferences?.earliestStart ?? "");
  const [earlyBefore, setEarlyBefore] = useState(savedPreferences?.earlyBefore ?? "");
  const courseSeasons = useOfferingSeasons(courses.map((course) => course.courseId));
  const [windowStart, setWindowStart] = useState(savedPreferences?.windowStart ?? "");
  const [windowEnd, setWindowEnd] = useState(savedPreferences?.windowEnd ?? "");
  const [strictTime, setStrictTime] = useState(savedPreferences?.strictTime ?? false);
  const [openSeatsOnly, setOpenSeatsOnly] = useState(savedPreferences?.openSeatsOnly ?? false);
  const [preferGpa, setPreferGpa] = useState(savedPreferences?.preferGpa ?? false);
  const [preferFewerDays, setPreferFewerDays] = useState(savedPreferences?.preferFewerDays ?? false);
  const [preferNearbyClasses, setPreferNearbyClasses] = useState(savedPreferences?.preferNearbyClasses ?? false);
  const [campusAreas, setCampusAreas] = useState<string[]>(savedPreferences?.campusAreas ?? []);
  const [includeFreshmanConnection, setIncludeFreshmanConnection] = useState(savedPreferences?.includeFreshmanConnection ?? false);
  const [busyBlocks, setBusyBlocks] = useState<BusyBlock[]>(savedPreferences?.busyBlocks ?? []);
  const [bufferMinutes, setBufferMinutes] = useState(savedPreferences?.bufferMinutes ?? 0);
  // Phones show the preferences folded; this counts what is set, so a folded form still says something.
  // Folded by default; each browser remembers whether the student keeps it open.
  const [prefsOpen, setPrefsOpen] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (window.localStorage.getItem("terpplan:prefs-open") === "1") setPrefsOpen(true);
    } catch { /* storage blocked: stays folded */ }
  }, []);
  const togglePrefs = (open: boolean) => {
    setPrefsOpen(open);
    try { window.localStorage.setItem("terpplan:prefs-open", open ? "1" : "0"); } catch { /* not remembered */ }
  };
  const prefsSet = [earliestStart, earlyBefore, windowStart || windowEnd, excludedDays.length, openSeatsOnly, preferGpa, preferFewerDays, preferNearbyClasses, campusAreas.length, includeFreshmanConnection, busyBlocks.length, bufferMinutes].filter(Boolean).length;
  // The preferences form (not the personal schedule or buffer), so "Clear preferences" can reset and undo it.
  const formPrefs = { excludedDays, earliestStart, earlyBefore, windowStart, windowEnd, strictTime, openSeatsOnly, preferGpa, preferFewerDays, preferNearbyClasses, campusAreas, includeFreshmanConnection };
  const formPrefsSet = Object.values(formPrefs).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value));
  const [clearedPrefs, setClearedPrefs] = useState<typeof formPrefs | null>(null);
  const setFormPrefs = (value: typeof formPrefs) => {
    setExcludedDays(value.excludedDays); setEarliestStart(value.earliestStart); setEarlyBefore(value.earlyBefore); setWindowStart(value.windowStart); setWindowEnd(value.windowEnd); setStrictTime(value.strictTime);
    setOpenSeatsOnly(value.openSeatsOnly); setPreferGpa(value.preferGpa); setPreferFewerDays(value.preferFewerDays); setPreferNearbyClasses(value.preferNearbyClasses); setCampusAreas(value.campusAreas); setIncludeFreshmanConnection(value.includeFreshmanConnection);
  };
  const clearPrefs = () => {
    setClearedPrefs(formPrefs);
    setFormPrefs({ excludedDays: [], earliestStart: "", earlyBefore: "", windowStart: "", windowEnd: "", strictTime: false, openSeatsOnly: false, preferGpa: false, preferFewerDays: false, preferNearbyClasses: false, campusAreas: [], includeFreshmanConnection: false });
  };

  useEffect(() => {
    writeSavedState({ preferences: { excludedDays, earliestStart, earlyBefore, windowStart, windowEnd, strictTime, openSeatsOnly, preferGpa, preferFewerDays, preferNearbyClasses, campusAreas, includeFreshmanConnection, busyBlocks, bufferMinutes } });
  }, [excludedDays, earliestStart, earlyBefore, windowStart, windowEnd, strictTime, openSeatsOnly, preferGpa, preferFewerDays, preferNearbyClasses, campusAreas, includeFreshmanConnection, busyBlocks, bufferMinutes]);
  // Results belong to the course list and term they were generated for; hide them once either changes.
  const requestKey = useMemo(() => planKey(courses, term), [courses, term]);
  // Preferences only mark results as out of date: the options stay visible with a notice to regenerate.
  const preferences = { earliestStart: earliestStart || null, earlyBefore: earlyBefore || null, excludedDays, windowStart: windowStart || null, windowEnd: windowEnd || null, strictTime, openSeatsOnly, preferGpa, preferFewerDays, preferNearbyClasses, campusAreas, includeFreshmanConnection, busyBlocks: anonymousBusyBlocks(busyBlocks), bufferMinutes };
  const prefsKey = JSON.stringify(preferences);
  const scheduleRequest = { courseIds: courses.map((course) => course.courseId), term, preferences,
    instructorFilters: Object.fromEntries(courses.filter((course) => course.instructors?.length).map((course) => [course.courseId, course.instructors])),
    sectionFilters: Object.fromEntries(courses.filter((course) => course.pinnedSectionId || course.excludedSectionIds?.length).map((course) => [course.courseId, { pinnedSectionId: course.pinnedSectionId, excludedSectionIds: course.excludedSectionIds }])) };
  const options = useMemo(() => generated.requestKey === requestKey ? generated.options : [], [generated, requestKey]);
  // Reasons are worked out on the planner's own order (where the first option is the balanced one), then
  // looked up by option, so changing the sort never moves a reason onto a different schedule.
  const highlightFor = useMemo(() => new Map(optionHighlights(options).map((list, index) => [optionKey(options[index]), list])), [options]);
  const sortedOptions = useMemo(() => sortOptions(options, optionSort), [options, optionSort]);
  // Which card's score explanation is open, for this set of options only.
  const [scoreHelpFor, setScoreHelpFor] = useState<{ requestKey: string; key: string } | null>(null);
  const scoreHelp = scoreHelpFor?.requestKey === requestKey ? scoreHelpFor.key : null;
  const warnings = generated.requestKey === requestKey ? generated.warnings : [];

  const presetFields: PresetFields = { excludedDays, earliestStart, windowStart, windowEnd, strictTime, preferFewerDays, preferNearbyClasses };
  // A preset writes the same fields the form below writes, so the form always shows what is in effect.
  const applyPreset = (key: PresetKey) => {
    const patch = togglePreset(key, presetFields);
    if (patch.excludedDays !== undefined) setExcludedDays(patch.excludedDays);
    if (patch.earliestStart !== undefined) setEarliestStart(patch.earliestStart);
    if (patch.windowStart !== undefined) setWindowStart(patch.windowStart);
    if (patch.windowEnd !== undefined) setWindowEnd(patch.windowEnd);
    if (patch.strictTime !== undefined) setStrictTime(patch.strictTime);
    if (patch.preferFewerDays !== undefined) setPreferFewerDays(patch.preferFewerDays);
    if (patch.preferNearbyClasses !== undefined) setPreferNearbyClasses(patch.preferNearbyClasses);
  };

  const windowValid = !((windowStart || windowEnd || strictTime) && (!windowStart || !windowEnd || windowStart >= windowEnd));
  // Each run gets a number; a slower, older response is ignored so it cannot replace newer options.
  const generationSeq = useRef(0);
  const generate = async () => {
    if (!courses.length) return;
    if (!windowValid) {
      setError(t.invalidWindow);
      return;
    }
    const seq = ++generationSeq.current;
    setLoading(true);
    setError("");
    setGenerated((current) => ({ ...current, warnings: [] }));
    try {
      const response = await fetch("/api/schedules/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(scheduleRequest),
      });
      const payload = await response.json() as { error?: string; options?: ScheduleOption[]; warnings?: PlanWarning[]; diagnostics?: PlanDiagnosis[]; repairs?: PlanRepair[] };
      if (seq !== generationSeq.current) return;
      if (!response.ok) throw new Error(payload.error || t.loadError);
      setGenerated({ requestKey, prefsKey, options: payload.options ?? [], warnings: payload.warnings ?? [], diagnostics: payload.diagnostics ?? [], repairs: payload.repairs ?? [] });
      if (payload.options?.length) countUse("schedule");
      setSelectedKey("");
      setShareUrl("");
      setShareCopied(false);
    } catch {
      if (seq !== generationSeq.current) return;
      setError(t.loadError);
      setGenerated({ requestKey, prefsKey, options: [], warnings: [] });
    } finally {
      if (seq === generationSeq.current) setLoading(false);
    }
  };

  // Regenerate on its own shortly after the plan or preferences change (this panel stays mounted while hidden,
  // so edits made in course search update the options too). A failed run is recorded, so it does not retry in a loop.
  const upToDate = generated.requestKey === requestKey && generated.prefsKey === prefsKey;
  const generateRef = useRef(generate);
  useEffect(() => { generateRef.current = generate; });
  useEffect(() => {
    if (!courses.length || upToDate || !windowValid) return;
    const timer = window.setTimeout(() => void generateRef.current(), 600);
    return () => window.clearTimeout(timer);
  }, [courses.length, upToDate, windowValid, requestKey, prefsKey]);

  // Falls back to the first card when nothing is picked yet, or when new options replaced the picked one.
  const chosen = options.find((option) => optionKey(option) === selectedKey) ?? options[0];
  const prefsChanged = options.length > 0 && generated.prefsKey !== prefsKey;
  // Courses in the plan that an option could not place; an option missing any is incomplete.
  const missingFrom = (option: ScheduleOption) => courses.map((course) => course.courseId).filter((courseId) => !option.selectedSections.some((section) => section.course_id === courseId));
  const chosenMissing = chosen ? missingFrom(chosen) : [];
  // The last fix applied from "What is blocking this schedule?", with what it changed, so it can be undone.
  const [undo, setUndo] = useState<{ label: string; restore: () => void } | null>(null);
  const pinned = Object.fromEntries(courses.map((course) => [course.courseId, course.pinnedSectionId]));
  const applyRepair = (repair: PlanRepair) => {
    generationSeq.current++;
    setShareUrl(""); setShareCopied(false);
    const before = { excludedDays, earliestStart, strictTime, bufferMinutes, busyBlocks, openSeatsOnly, campusAreas };
    const index = courses.findIndex((course) => course.courseId === repair.courseId);
    const course = courses[index];
    setUndo({ label: repairText(repair, busyBlocks, language, pinned), restore: () => {
      generationSeq.current++;
      setExcludedDays(before.excludedDays); setEarliestStart(before.earliestStart); setStrictTime(before.strictTime); setBufferMinutes(before.bufferMinutes);
      setBusyBlocks(before.busyBlocks); setOpenSeatsOnly(before.openSeatsOnly); setCampusAreas(before.campusAreas);
      if (course && repair.kind === "removeCourse") onRestoreCourse?.(course, index);
      else if (course) onUpdateCourse(course.courseId, { pinnedSectionId: course.pinnedSectionId, excludedSectionIds: course.excludedSectionIds, instructors: course.instructors });
    } });
    switch (repair.kind) {
      case "allowDay": setExcludedDays((current) => current.filter((day) => day !== repair.day)); break;
      case "clearEarliest": setEarliestStart(""); break;
      case "relaxWindow": setStrictTime(false); break;
      case "clearBuffer": setBufferMinutes(0); break;
      case "removeBlock": setBusyBlocks((current) => current.filter((block) => block.id !== repair.blockId)); break;
      case "allowFull": setOpenSeatsOnly(false); break;
      case "clearCampusAreas": setCampusAreas([]); break;
      // "Switch to section 0201": pin the section the preview showed, so the result is what was promised.
      case "unpin": onUpdateCourse(repair.courseId!, { pinnedSectionId: repair.preview?.find((item) => item.courseId === repair.courseId)?.sectionId }); break;
      case "resetFilters": onUpdateCourse(repair.courseId!, { pinnedSectionId: undefined, excludedSectionIds: [], instructors: undefined }); break;
      case "removeCourse": onRemove(repair.courseId!); break;
    }
  };
  const applySwap = (option: ScheduleOption, courseId: string) => {
    const replacement = option.selectedSections.find((section) => section.course_id === courseId);
    if (!replacement || !chosen || loading || !upToDate || missingFrom(option).length) return;
    const originalIds = chosen.selectedSections.filter((section) => section.course_id !== courseId).map((section) => section.section_id).sort();
    const nextIds = option.selectedSections.filter((section) => section.course_id !== courseId).map((section) => section.section_id).sort();
    if (JSON.stringify(originalIds) !== JSON.stringify(nextIds)) return;
    generationSeq.current++;
    onUpdateCourse(courseId, { pinnedSectionId: replacement.section_id });
    const nextCourses = courses.map((course) => course.courseId === courseId ? { ...course, pinnedSectionId: replacement.section_id } : course);
    setGenerated({ requestKey: planKey(nextCourses, term), prefsKey, options: [option], warnings: [], diagnostics: [], repairs: [] });
    setSelectedKey(""); setShareUrl(""); setShareCopied(false);
  };
  useEffect(() => {
    if (!chosen || !onChosenChange) return;
    // Personal commitments are taken time too; only their days and times are passed on, never their names.
    const busyMeetings = busyBlocks.map((block) => ({ days: block.days.map((day) => BUSY_DAY_CODES[day] ?? "").join(""), start_time: block.start, end_time: block.end }));
    onChosenChange({ term, planKey: requestKey, sectionIds: chosen.selectedSections.map((section) => section.section_id), meetings: [...chosen.selectedSections.flatMap((section) => section.meetings ?? []), ...busyMeetings] });
  }, [chosen, term, requestKey, onChosenChange, busyBlocks]);
  const shareSchedule = async () => {
    if (!chosen) return;
    const url = window.location.origin + sharePath(term, chosen.selectedSections.map((section) => section.section_id), language, chosenMissing);
    setShareUrl(url); countUse("share");
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
    } catch {
      setShareCopied(false);
    }
  };
  return <section className="mx-auto max-w-6xl rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5 sm:p-8">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[.13em] text-[#9a5040]">02 · {t.preferences}</p><h2 className="mt-2 font-serif text-3xl">{t.courses}</h2></div>
      <button onClick={onBack} className="rounded-lg border border-[#d9d6ce] px-3 py-2 text-sm font-medium hover:bg-white">{t.back}</button>
    </div>
    {planSwitch && <div className="mt-4">{planSwitch}</div>}
    {!courses.length ? <p className="mt-6 rounded-xl bg-[#f2f0eb] p-5 text-sm text-[#646c68]">{t.addCourse}</p> : <>
      {creditMeter && <CreditMeter meter={creditMeter} language={language} />}
      {creditsLabel && <p className={`${creditMeter ? "mt-2" : "mt-6"} text-xs font-medium text-[#48534f]`}>{creditsLabel}</p>}
      {creditWarning && <p role="status" className="mt-2 rounded-lg bg-[#fff8e8] px-3 py-2 text-xs leading-5 text-[#745424]">⚠ {creditWarning}</p>}
      {takenEditor && <div className="mt-2">{takenEditor}</div>}
      <div className={`${creditsLabel ? "mt-2" : "mt-6"} space-y-2`}>{courses.map((course) => <article key={course.courseId} className="flex items-center justify-between gap-4 rounded-xl border border-[#e3e0d8] bg-white px-4 py-3"><div><p className="font-semibold">{course.courseId}</p><p className="mt-0.5 text-xs text-[#646c68]">{course.courseTitle}</p><SeasonNote season={courseSeasons[course.courseId]} term={term} language={language} />{prereqNeeds[course.courseId]?.length ? <p className="mt-1 text-xs font-medium text-[#745424]">⚠ {t.prereqNeeds.replace("{needs}", prereqNeeds[course.courseId].join("; "))}</p> : null}{course.instructors?.length ? <p className="mt-1 text-xs text-[#536d64]">{t.onlyInstructors}: {course.instructors.join(", ")}</p> : null}{course.pinnedSectionId && <p className="mt-1 text-xs font-medium text-[#315c43]">{t.pinned}: {course.pinnedSectionId}</p>}{course.excludedSectionIds?.length ? <p className="mt-1 text-xs text-[#8f4538]">{t.excludedSections}: {course.excludedSectionIds.join(", ")}</p> : null}{(course.pinnedSectionId || course.excludedSectionIds?.length) && <button onClick={onBack} className="mt-1 text-xs font-medium text-[#536d64] underline underline-offset-2">{t.changeSections}</button>}</div><button onClick={() => onRemove(course.courseId)} className="rounded-lg border border-[#dedbd3] px-3 py-2 text-xs font-medium text-[#5d6561] hover:bg-[#f6f4ef]">{t.remove}</button></article>)}</div>
      <div className="mt-5 rounded-xl border border-[#e3e0d8] bg-white p-4 sm:p-5">
        {/* The full form is long enough to push the schedules far down, so it folds; the quick settings stay out. */}
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => togglePrefs(!prefsOpen)} aria-expanded={prefsOpen} aria-controls="schedule-preferences-form" className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-left"><span className="whitespace-nowrap font-semibold">{t.preferences}</span>{prefsSet ? <span className="whitespace-nowrap text-xs text-[#5d6561]">· {t.prefsSet.replace("{n}", String(prefsSet))}</span> : null}<span className="whitespace-nowrap rounded-md border border-[#d9d6ce] px-2 py-0.5 text-[11px] font-medium text-[#48534f]">{prefsOpen ? t.prefsHide : t.prefsShow} <span aria-hidden="true">{prefsOpen ? "▲" : "▼"}</span></span></button>
          {formPrefsSet && <button type="button" onClick={clearPrefs} title={t.resetHint} className="shrink-0 rounded-lg border border-[#d9d6ce] px-3 py-1.5 text-xs font-semibold text-[#48534f] hover:bg-[#f7f5f0]">{t.resetPrefs}</button>}
        </div>
        {clearedPrefs && !formPrefsSet && <p role="status" className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-[#edf3ef] px-3 py-2 text-xs text-[#315c43]">{t.resetDone}<button type="button" onClick={() => { setFormPrefs(clearedPrefs); setClearedPrefs(null); }} className="font-semibold underline underline-offset-2">{t.undo}</button></p>}
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-[#5d6561]">{t.presetsTitle}</p>
          <div className="flex flex-wrap gap-2">{PRESET_KEYS.map((key) => { const on = presetActive(key, presetFields); return <button key={key} type="button" aria-pressed={on} onClick={() => applyPreset(key)} title={t.presetHint[key]} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${on ? "border-[#536d64] bg-[#edf3ef] text-[#273c38]" : "border-[#d9d6ce] bg-white text-[#48534f] hover:bg-[#f7f5f0]"}`}>{on ? "✓ " : ""}{t.preset[key]}</button>; })}</div>
          <p className="mt-2 text-[11px] leading-5 text-[#646c68]">{t.presetsNote}</p>
        </div>
        <div id="schedule-preferences-form" hidden={!prefsOpen}>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1.5 text-xs font-medium text-[#5d6561]">{t.earliest}<input type="time" value={earliestStart} onChange={(event) => setEarliestStart(event.target.value)} className="rounded-lg border border-[#dedbd3] bg-white px-3 py-2 text-sm text-[#202728]" /></label>
          <label className="grid gap-1.5 text-xs font-medium text-[#5d6561]">{t.window} · {t.start}<input type="time" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} className="rounded-lg border border-[#dedbd3] bg-white px-3 py-2 text-sm text-[#202728]" /></label>
          <label className="grid gap-1.5 text-xs font-medium text-[#5d6561]">{t.window} · {t.end}<input type="time" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} className="rounded-lg border border-[#dedbd3] bg-white px-3 py-2 text-sm text-[#202728]" /></label>
          <label className="flex items-end gap-2 pb-2 text-xs text-[#5d6561]"><input type="checkbox" checked={strictTime} disabled={!windowStart || !windowEnd} onChange={(event) => setStrictTime(event.target.checked)} />{t.strict}</label>
        </div>
        {/* A time no class meets at (a slip of the time picker, like 02:06) quietly filters everything, so it is pointed out. */}
        {([[t.earliest, earliestStart, setEarliestStart], [`${t.window} · ${t.start}`, windowStart, setWindowStart], [`${t.window} · ${t.end}`, windowEnd, setWindowEnd]] as const)
          .filter(([, value]) => value && (value < "06:00" || value > "23:00"))
          .map(([field, value, clear]) => <p key={field} role="status" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-[#fff8e8] px-3 py-2 text-xs text-[#745424]">⚠ {fill(t.oddTime, { field, time: displayClock(minutes(value) ?? 0) })}<button type="button" onClick={() => clear("")} className="font-semibold underline underline-offset-2">{t.clearTime}</button></p>)}
        <div className="mt-4">
          <label className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#5d6561]">{t.earlyLabel}
            <select value={earlyBefore} onChange={(event) => setEarlyBefore(event.target.value)} className="rounded-lg border border-[#dedbd3] bg-white px-3 py-1.5 text-sm text-[#202728]">
              <option value="off">{t.earlyOff}</option>
              <option value="08:00">8:00am</option>
              <option value="08:30">8:30am</option>
              <option value="">9:00am {t.earlyDefault}</option>
              <option value="09:30">9:30am</option>
              <option value="10:00">10:00am</option>
              <option value="11:00">11:00am</option>
            </select>
          </label>
          <p className="mt-1 text-[11px] leading-5 text-[#646c68]">{t.earlyHint}</p>
        </div>
        <div className="mt-4"><p className="mb-2 text-xs font-medium text-[#5d6561]">{t.excluded}</p><div className="flex flex-wrap gap-2">{DAYS.map((day, index) => <label key={day} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#e3e0d8] bg-[#fbfaf8] px-3 py-2 text-xs"><input type="checkbox" checked={excludedDays.includes(day)} onChange={(event) => setExcludedDays((current) => event.target.checked ? [...current, day] : current.filter((item) => item !== day))} />{t.weekdays[index]}</label>)}</div></div>
        <label className="mt-4 inline-flex items-center gap-2 text-xs text-[#5d6561]"><input type="checkbox" checked={openSeatsOnly} onChange={(event) => setOpenSeatsOnly(event.target.checked)} />{t.openOnly}</label>
        <label className="mt-2 flex items-start gap-2 text-xs text-[#5d6561]"><input type="checkbox" className="mt-0.5" checked={preferGpa} onChange={(event) => setPreferGpa(event.target.checked)} />{t.preferGpa}</label>
        <label className="mt-2 flex items-start gap-2 text-xs text-[#5d6561]"><input type="checkbox" className="mt-0.5" checked={preferFewerDays} onChange={(event) => setPreferFewerDays(event.target.checked)} />{t.preferFewerDays}</label>
        <label className="mt-2 flex items-start gap-2 text-xs text-[#5d6561]"><input type="checkbox" className="mt-0.5" checked={preferNearbyClasses} onChange={(event) => setPreferNearbyClasses(event.target.checked)} />{t.preferNearby}</label>
        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-medium text-[#5d6561]">{t.areasTitle}</legend>
          <div className="flex flex-wrap gap-2">{CAMPUS_AREA_KEYS.map((area) => <label key={area} className="inline-flex cursor-pointer items-start gap-2 rounded-lg border border-[#e3e0d8] bg-[#fbfaf8] px-3 py-2 text-xs">
            <input type="checkbox" className="mt-0.5" checked={campusAreas.includes(area)} onChange={(event) => setCampusAreas((current) => event.target.checked ? [...current, area] : current.filter((item) => item !== area))} />
            <span>{t.area[area]}<span className="block text-[11px] text-[#646c68]">{t.areaExample[area]}</span></span>
          </label>)}</div>
          <p className="mt-2 text-[11px] leading-5 text-[#646c68]">{t.areasNote}</p>
        </fieldset>
        <label className="mt-2 flex items-center gap-2 text-xs text-[#5d6561]"><input type="checkbox" checked={includeFreshmanConnection} onChange={(event) => setIncludeFreshmanConnection(event.target.checked)} />{t.includeFc}</label>
        <p className="mt-3 text-xs leading-5 text-[#646c68]">{t.windowHint}</p>
        {courses.some((course) => course.pinnedSectionId) && <p className="mt-1 text-xs leading-5 text-[#646c68]">{t.pinnedNote}</p>}
        <PersonalSchedule blocks={busyBlocks} buffer={bufferMinutes} onBlocks={setBusyBlocks} onBuffer={setBufferMinutes} language={language} />
        </div>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-[#e7c6bf] bg-[#fff0ec] px-4 py-3 text-sm text-[#8c352c]">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-3"><p className="text-xs text-[#646c68]">{t.autoNote}</p><button onClick={() => void generate()} disabled={loading} className="rounded-lg bg-[#273c38] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1d302c] disabled:opacity-60">{loading ? t.generating : t.generate}</button></div>
    </>}
    {undo && <div role="status" className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[#cddbd1] bg-[#edf3ef] px-4 py-3 text-sm text-[#273c38]">
      <span className="min-w-0 flex-1">{language === "zh" ? `已应用：${undo.label}` : `Applied: ${undo.label}`}</span>
      <button type="button" onClick={() => { undo.restore(); setUndo(null); }} className="rounded-lg border border-[#536d64] bg-white px-3 py-1.5 text-xs font-semibold hover:bg-[#f4f8f5]">{language === "zh" ? "撤销" : "Undo"}</button>
      <button type="button" onClick={() => setUndo(null)} aria-label={language === "zh" ? "关闭" : "Dismiss"} className="rounded-lg px-2 py-1 text-xs text-[#5d6561] hover:bg-white">✕</button>
    </div>}
    {warnings.length > 0 && <ul className="mt-5 space-y-2 rounded-xl border border-[#ead8b5] bg-[#fff8e8] p-4 text-sm text-[#745424]">{warnings.map((warning, index) => <li key={index}>{warningText(warning, language)}</li>)}</ul>}
    {generated.requestKey === requestKey && <ScheduleRecovery diagnostics={generated.diagnostics ?? []} repairs={generated.repairs ?? []} blocks={busyBlocks} pinned={pinned} language={language} disabled={loading || !upToDate} onRepair={applyRepair} onBack={onBack} />}
    {courses.length > 0 && options.length === 0 && !loading && !error && warnings.length > 0 && <p className="mt-4 text-sm text-[#5d6561]">{t.noOptions}</p>}
    {options.length > 0 && <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-serif text-2xl">{t.options}</h3>
        {options.length > 1 && <label className="inline-flex items-center gap-1.5 text-xs text-[#48534f]">{t.sortLabel}<select value={optionSort} onChange={(event) => setOptionSort(event.target.value as OptionSort)} className="rounded-lg border border-[#d9d6ce] bg-white px-2 py-1 text-xs">{OPTION_SORTS.map((value) => <option key={value} value={value}>{t.optionSort[value]}</option>)}</select></label>}
      </div>
      <p className="mt-1 text-xs text-[#646c68]">{optionSort === "best" ? t.ranking : t.sortedNote}</p>
      {prefsChanged && windowValid && <p role="status" className="mt-3 rounded-xl border border-[#d9e3dc] bg-[#f4f8f5] px-4 py-3 text-sm text-[#315c43]">{t.updating}</p>}
      {prefsChanged && !windowValid && <p role="status" className="mt-3 rounded-xl border border-[#ead8b5] bg-[#fff8e8] px-4 py-3 text-sm text-[#745424]">{t.staleOptions}</p>}
      <div className="mt-4 grid gap-3 lg:grid-cols-3">{sortedOptions.map((option, index) => { const key = optionKey(option); const picked = key === (chosen ? optionKey(chosen) : ""); return <div key={key} className={`relative rounded-xl border p-4 text-left transition ${picked ? "border-[#536d64] bg-[#edf3ef] ring-2 ring-[#536d64]/15" : "border-[#e3e0d8] bg-white hover:border-[#b9c5be]"}`}>
        {/* The card selects the option; the score's info button sits above it and only opens the explanation. */}
        <button type="button" onClick={() => { setSelectedKey(key); setShareUrl(""); setShareCopied(false); }} aria-pressed={picked} aria-label={`${t.option} ${index + 1}`} className="absolute inset-0 rounded-xl" />
        <div className="pointer-events-none relative">
        <span className="flex items-center justify-between gap-2"><strong>{t.option} {index + 1}</strong><span className="flex items-center gap-1.5 text-xs text-[#646c68]">{t.score} {option.score.toFixed(2)}<button type="button" onClick={() => setScoreHelpFor(scoreHelp === key ? null : { requestKey, key })} aria-expanded={scoreHelp === key} aria-label={t.scoreHow} title={t.scoreHow} className="pointer-events-auto grid h-4 w-4 place-items-center rounded-full border border-[#9aa59f] text-[10px] font-bold leading-none text-[#59635f] hover:border-[#536d64] hover:text-[#273c38]">i</button></span></span>
        {scoreHelp === key && <ScoreBreakdown option={option} language={language} />}
        {highlightFor.get(key)?.length ? <span className="mt-2 flex flex-wrap gap-1.5">{highlightFor.get(key)!.map((reason) => <span key={reason} className="rounded-full bg-[#e6efe9] px-2 py-0.5 text-[11px] font-semibold text-[#315c43]">{t.highlight[reason]}</span>)}</span> : null}
        <span className="mt-3 block text-xs leading-5 text-[#5d6561]">{option.selectedSections.map((section) => section.section_id).join(" · ")}</span>
        {missingFrom(option).length ? <span className="mt-2 mr-1 inline-block rounded-full bg-[#8f4538] px-2 py-0.5 text-[11px] font-semibold text-white">{t.incompleteTag}: {missingFrom(option).join(", ")}</span> : null}
        {option.fullSectionIds?.length ? <span className="mt-2 inline-block rounded-full bg-[#f5e9e5] px-2 py-0.5 text-[11px] font-semibold text-[#8f4538]">{t.fullIn}: {option.fullSectionIds.join(", ")}</span> : null}
        <span className="mt-3 block text-xs text-[#646c68]">{t.rating}: {option.professorRating === null ? "—" : option.professorRating.toFixed(2) + " / 5"}{option.averageGpa !== null && option.averageGpa !== undefined ? ` · ${t.avgGpa} ${option.averageGpa.toFixed(2)}` : ""} · {t.gaps}: {option.gapMinutes} {t.minutes}{option.tightWalkCount ? <span className="text-[#8f4538]"> · {t.tightWalks}: {option.tightWalkCount} {t.times}</span> : null}</span>
        <span className="mt-1 block text-xs text-[#646c68]">{t.days}: {option.campusDays.map((day) => t.weekdays[DAYS.indexOf(day as (typeof DAYS)[number])] ?? day).join(", ") || "—"}{option.earliestStart ? " · " + t.firstClass + " " + option.earliestStart : ""}</span>
        {option.campusAreas?.length ? <span className="mt-1 block text-xs text-[#646c68]">{t.areasLabel}: {option.campusAreas.map((area) => t.area[area]).join(", ")}{option.walkMinutes ? ` · ${t.walkWeek} ${option.walkMinutes} ${t.minutes} ${t.perWeek}` : ""}</span> : null}
        {option.timeFitPercent !== null && <span className="mt-1 block text-xs text-[#646c68]">{t.fit}: {Math.round(option.timeFitPercent)}%</span>}
        </div>
      </div>; })}</div>
      {chosen && <div className="mt-6">
        {chosenMissing.length > 0 && <div role="alert" className="mb-4 rounded-xl border border-[#e7c6bf] bg-[#fff0ec] px-4 py-3 text-sm text-[#8c352c]"><p className="font-semibold">{t.incompleteTitle}</p><p className="mt-1 text-xs leading-5">{t.incompleteBody} <strong>{chosenMissing.join(", ")}</strong></p></div>}
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h4 className="font-semibold">{t.calendar}</h4><p className="mt-1 text-xs text-[#646c68]">{chosen.selectedSections.map((section) => section.section_id).join(" · ")}</p></div><span className="text-xs text-[#646c68]">{t.rating}: {chosen.professorRating === null ? "—" : chosen.professorRating.toFixed(2) + " / 5"}{chosen.totalCredits ? " · " + chosen.totalCredits + " " + (chosen.totalCredits === 1 ? t.credit : t.credits) : ""}</span></div>
        <p className="mb-2 text-xs leading-5 text-[#646c68]">{language === "zh" ? "点击课表中的课程可查看备选班次。个人日程仅显示在这里，不包含在分享链接或日历导出中。" : "Click a class to review alternative sections. Personal commitments appear here and are excluded from share links and calendar exports."}</p>
        <WeekLoadChart sections={chosen.selectedSections} language={language} />
        <WorkloadCard courses={chosen.selectedSections.map((section) => ({ courseId: section.course_id, credits: section.credits }))} language={language} />
        <WeeklyCalendar sections={chosen.selectedSections} language={language} busyBlocks={busyBlocks} onSelectSection={(section) => { const control = document.getElementById(`section-swap-${section.section_id}`); control?.scrollIntoView({ block: "center", behavior: "smooth" }); control?.click(); }} />
        <button type="button" onClick={() => openFeedback({ kind: "problem", context: reportDetails({ term: termName, sectionIds: chosen.selectedSections.map((section) => section.section_id) }) })} className="mt-2 inline-block text-xs font-medium text-[#a34a39] hover:underline">{t.reportSchedule}</button>
        {/* Saving and sharing come after the timetable, once the student has looked the schedule over. */}
        <div className="mt-5"><h4 className="mb-2 font-semibold">{language === "zh" ? "保存和分享这份课表" : "Save or share this schedule"}</h4>
        <CalendarExport key={chosen.selectedSections.map((section) => section.section_id).join("|")} sections={chosen.selectedSections} term={term} termName={termName} language={language} incomplete={chosenMissing.length > 0}>
          <PrintSchedule option={chosen} busyBlocks={busyBlocks} request={{ ...scheduleRequest, selectedSectionIds: chosen.selectedSections.map((item) => item.section_id) }} termName={termName} language={language} canLoadBackups={!loading && upToDate && chosenMissing.length === 0} />
        </CalendarExport>
        <div className="mb-3 rounded-xl border border-[#e3e0d8] bg-white p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3"><button type="button" onClick={() => void shareSchedule()} className="rounded-lg border border-[#536d64] px-3 py-2 text-xs font-semibold text-[#273c38] hover:bg-[#edf3ef]">{shareCopied ? t.shareCopied : t.shareSchedule}</button><p className="w-full text-[11px] leading-5 text-[#646c68] sm:w-auto sm:min-w-0 sm:flex-1">{t.shareHint}</p></div>
          {shareUrl && <div className="mt-3"><label htmlFor="share-schedule-url" className="text-[11px] font-medium text-[#5d6561]">{shareCopied ? t.shareReady : t.shareCopyFailed}</label><input id="share-schedule-url" readOnly value={shareUrl} onFocus={(event) => event.target.select()} className="mt-1 w-full rounded-lg border border-[#dedbd3] bg-[#fbfaf8] px-3 py-2 text-xs text-[#273c38]" /></div>}
        </div>
        {(() => {
          const weekKey = requestKey + "|" + chosen.selectedSections.map((section) => section.section_id).join(",");
          return <div className="mb-3 rounded-xl border border-[#e3e0d8] bg-white p-3 sm:p-4"><div className="flex flex-wrap items-center gap-2 sm:gap-3"><button type="button" onClick={() => { if (writeMyWeek(weekFromSections(chosen.selectedSections, term, termName))) setWeekSavedFor(weekKey); }} className="rounded-lg border border-[#536d64] px-3 py-2 text-xs font-semibold text-[#273c38] hover:bg-[#edf3ef]">{weekSavedFor === weekKey ? "✓ " : ""}{t.useWeek}</button>{weekSavedFor === weekKey ? <a href="/week" className="text-xs font-semibold text-[#a34a39] hover:underline">{t.weekSaved}</a> : <p className="w-full text-[11px] leading-5 text-[#646c68] sm:w-auto sm:min-w-0 sm:flex-1">{t.weekHint}</p>}</div></div>;
        })()}
        {/* The registration checklist below keeps this schedule saved for /register. */}
        <div className="mb-3 rounded-xl border border-[#e3e0d8] bg-white p-3 sm:p-4"><div className="flex flex-wrap items-center gap-2 sm:gap-3"><a href="/register" target="_blank" rel="noreferrer" className="rounded-lg border border-[#536d64] px-3 py-2 text-xs font-semibold text-[#273c38] hover:bg-[#edf3ef]">{language === "zh" ? "选课当天页面 ↗" : "Registration-day view ↗"}</a><p className="w-full text-[11px] leading-5 text-[#646c68] sm:w-auto sm:min-w-0 sm:flex-1">{language === "zh" ? "课号、班号、每门课的备选班次和倒计时都在一页，注册时开在 Testudo 旁边。首页顶部也有入口。" : "Course and section numbers, each course's backups and a countdown on one page to keep next to Testudo. It is also linked at the top of the home page."}</p></div></div>
        </div>
        <div className="mt-4 space-y-2">{chosen.selectedSections.map((section) => <article key={section.section_id} className="rounded-xl border border-[#e3e0d8] bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{section.course_id} · {section.course_title}</p><p className="mt-1 text-sm text-[#5d6561]">{section.section_id}</p>{/* One line per meeting (lecture, lab, discussion), so the times do not run together. */}<ul className="mt-1 space-y-0.5 text-sm text-[#5d6561]">{((section.meetings ?? []).length ? (section.meetings ?? []).map((meeting) => {
          const start = minutes(meeting.start_time), end = minutes(meeting.end_time);
          const kind = meetingType(meeting.classtype);
          const type = kind ? t[kind] : null;
          const days = dayNames(meeting.days).map((day) => t.weekdays[DAYS.indexOf(day as (typeof DAYS)[number])] ?? day);
          if (isAsyncOnline(meeting)) return (type ? type + " · " : "") + t.onlineNoTime;
          return start === null || end === null || !days.length ? (language === "zh" ? "时间待定" : "Time TBA") : (type ? type + " · " : "") + days.join(" ") + " " + displayClock(start) + "–" + displayClock(end) + " · " + roomLabel(meeting.building, meeting.room, language);
        }) : [language === "zh" ? "时间待定" : "Time TBA"]).map((line, index) => <li key={index}>{line}</li>)}</ul>
        {/* Each instructor in the chosen schedule opens the same details card as in course search. An
            instructor PlanetTerp has no page for keeps a plain name, since a card would have nothing in it. */}
        {section.instructorRatings.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#646c68]">{section.instructorRatings.map((item) => {
          const label = item.name + (item.averageRating === null ? "" : " · " + item.averageRating.toFixed(2) + " / 5");
          return item.status === "unmatched" || item.status === "tba"
            ? <span key={item.name}>{label}</span>
            : <ProfessorDetailCard key={item.name} name={item.name} courseId={section.course_id} language={language}><span>{label}</span></ProfessorDetailCard>;
        })}</div>}
        </div><div className="text-right"><span className={`inline-block rounded-full px-2.5 py-1 text-xs ${seatCount(section.open_seats) === 0 ? "bg-[#f5e9e5] font-semibold text-[#8f4538]" : "bg-[#f1efe9] text-[#5d6561]"}`}>{seatText(section.open_seats, t)}</span>{seatCount(section.open_seats) === 0 && <p className="mt-1 text-[11px] text-[#8f4538]">{[seatCount(section.waitlist) ? t.waitlisted.replace("{n}", String(seatCount(section.waitlist))) : seatCount(section.waitlist) === 0 ? t.noWaitlist : "", seatCount(section.holdfile) ? t.holdfiled.replace("{n}", String(seatCount(section.holdfile))) : ""].filter(Boolean).join(" · ")}</p>}{formatSeatReadTime(section.seatCheckedAt, language) && <p className="mt-1 text-[11px] text-[#646c68]">{t.seatReadAt}: {formatSeatReadTime(section.seatCheckedAt, language)}</p>}</div></div>
        <SectionSwap key={`${requestKey}:${prefsKey}:${chosen.selectedSections.map((item) => item.section_id).join("|")}`} section={section} language={language} request={{ ...scheduleRequest, selectedSectionIds: chosen.selectedSections.map((item) => item.section_id) }} disabled={loading || !upToDate || chosenMissing.length > 0} forceOpen={false} onApply={(option) => applySwap(option, section.course_id)} />
        </article>)}</div>
        <p className="mt-3 text-xs leading-5 text-[#646c68]">{t.seatReadHint}</p>
        <RegistrationChecklist option={chosen} others={options.filter((option) => option !== chosen)} missingCourseIds={chosenMissing} language={language} termName={termName} term={term} />
      </div>}
    </div>}
  </section>;
}
