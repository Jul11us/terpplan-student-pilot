"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GEN_ED_CATEGORIES, genEdCoverage } from "@/lib/gened-categories";
import { hasUnknownTime, isAsyncOnline, isOnlineOnly, meetingDays, meetingMinutes, meetingsConflict, type MeetingTime } from "@/lib/meeting-time";
import { formatSeatReadTime } from "@/lib/seat-time";
import { courseSet, unmetRequirements } from "@/lib/prereq-check";
import type { PrereqNode } from "@/lib/programs";
import { crossListGroups, diversityDefault, diversityNeeds, planGenEds, type DiversityTaken, type NeedLine, type PlanCandidate } from "@/lib/gened-plan";
import { activePreferences, preferenceMiss, type ActivePreferences, type SectionPreferences } from "@/lib/section-preferences";
import { creditWarning } from "@/lib/plan-credits";

type Language = "en" | "zh";
type GenEdSection = { section_id?: string; open_seats?: string | number | null; meetings?: MeetingTime[] };
// crossListed / creditOnlyFor: other listings of the same class, and courses Testudo credits only once together
// with this one (missing from lists cached before they were read).
type GenEdCourse = { course_id: string; name: string; credits: string | null; genEd: string[]; genEdGroups?: string[][]; hasPrerequisite?: boolean; hasRestriction?: boolean; programOnly?: boolean; crossListed?: string[]; creditOnlyFor?: string[]; pr?: PrereqNode | null; sections: GenEdSection[] };

// Historical averages are looked up for at most this many listed courses (in requests of up to 30).
const GPA_LOOKUP_LIMIT = 90;
// Categories students take two courses in (Distributive Studies areas, Big Question). Diversity has its own choice.
const TWO_COURSE_CODES = ["DSHS", "DSHU", "DSNS", "DSSP", "SCIS"];
// The two kinds of Diversity course, shown side by side as "DVUP or DVCC".
const DIVERSITY_CODES = ["DVUP", "DVCC"];
const DIVERSITY_TAKEN: DiversityTaken[] = ["none", "DVUP", "DVCC"];
// One requirement per Diversity: a DVCC course counts the same as a DVUP one when counting what a course covers.
const asRequirement = (code: string) => code === "DVCC" ? "DVUP" : code;
const requirementGroups = (groups: string[][]) => groups.map((group) => [...new Set(group.map(asRequirement))]);
const PLAN_LIMIT = 10;
// Lists the sets also draw on: lab sciences can fill DSNS, and either kind of Diversity course a second one.
const ALSO_LOAD: Record<string, string[]> = { DSNS: ["DSNL"], DVUP: ["DVCC"], DVCC: ["DVUP"] };
// Arranged one-on-one with a faculty member, not something to fill a Gen Ed with: left out of the sets.
const ARRANGED = /\b(directed|independent|individual)\s+(readings?|study|studies|research)\b|\binternship\b|\bthesis\b|\bspecial problems\b|\bpracticum\b/i;

// Honors College courses (HNUH, HONR) and honors versions of a course (e.g. AAAS100H) usually admit only
// honors students, and the Gen Ed listing does not always say so. Hidden by default, like FC sections.
// A trailing H can also just be one topic in a lettered series (ARHU318B, 318C, ... 318H); such a course
// counts as honors only when its title says so.
function isHonorsCourse(course: GenEdCourse, list: GenEdCourse[]) {
  const id = course.course_id;
  if (/^(HNUH|HONR)/.test(id)) return true;
  if (!/\d{3}H$/.test(id)) return false;
  if (/honor/i.test(course.name)) return true;
  const base = id.slice(0, -1);
  return !list.some((other) => other.course_id !== id && other.course_id.startsWith(base) && /\d{3}[A-GI-Z]$/.test(other.course_id));
}

// The schedule option the student last viewed in the planner, used to check time conflicts.
// planKey ties it to the plan it was generated from, so an edited plan is not checked against old results.
// A course's Gen Ed requirements as groups (lists cached before groups existed fall back to one per code).
const groupsOf = (course: GenEdCourse) => course.genEdGroups?.length ? course.genEdGroups : course.genEd.map((code) => [code]);

export type ReferenceSchedule = { term: string; planKey: string; sectionIds: string[]; meetings: MeetingTime[] };

// The sections a course can be taken in: no Freshman Connection section, open seats when asked for, and the step 02
// preferences when they are followed.
function usableSections(course: GenEdCourse, openOnly: boolean, preferences: ActivePreferences | null) {
  return course.sections.filter((section) => !/-FC[A-Z0-9]*$/i.test(section.section_id ?? ""))
    .filter((section) => !openOnly || (count(section.open_seats) ?? 0) > 0)
    .filter((section) => preferenceMiss(section.meetings ?? [], preferences) === null);
}

// The course the student has taken that this one would repeat: itself, another listing of the same class, or a
// course Testudo gives credit for only once together with it (an old number, say). Null when there is none.
function takenAs(course: GenEdCourse, taken: Set<string>) {
  return [course.course_id, ...(course.crossListed ?? []), ...(course.creditOnlyFor ?? [])].find((id) => taken.has(id)) ?? null;
}

// The lowest number of credits a course is worth ("3", or 1 for "1–4"); null when Testudo does not say.
const creditsOf = (course: GenEdCourse | undefined) => {
  const value = Number.parseFloat(course?.credits ?? "");
  return Number.isFinite(value) && value > 0 ? value : null;
};

const ZH_DAYS: Record<string, string> = { Mon: "周一", Tue: "周二", Wed: "周三", Thu: "周四", Fri: "周五", Sat: "周六", Sun: "周日" };
const clock = (value: number) => `${Math.floor(value / 60) % 12 || 12}:${String(value % 60).padStart(2, "0")}${value < 720 ? "am" : "pm"}`;
const dayList = (days: string[], language: Language) => days.map((day) => language === "zh" ? ZH_DAYS[day] ?? day : day).join(language === "zh" ? "、" : ", ");

// When a section meets ("Tue Thu 2:00pm–3:15pm; Fri 10:00am–10:50am"), for the sets.
function meetingsLabel(meetings: MeetingTime[], language: Language) {
  if (isOnlineOnly(meetings)) return language === "zh" ? "线上，无固定时间" : "Online, no set time";
  // In weekday order, whatever order Testudo lists the meetings in.
  const week = Object.keys(ZH_DAYS);
  const parts = [...new Set(meetings.flatMap((meeting) => {
    const days = meetingDays(meeting.days), start = meetingMinutes(meeting.start_time), end = meetingMinutes(meeting.end_time);
    if (isAsyncOnline(meeting) || !days.length || start === null || end === null) return [];
    return [{ order: week.indexOf(days[0]!) * 1440 + start, text: `${days.map((day) => language === "zh" ? ZH_DAYS[day] ?? day : day).join(" ")} ${clock(start)}–${clock(end)}` }];
  }).sort((a, b) => a.order - b.order).map((part) => part.text))];
  return parts.length && !hasUnknownTime(meetings) ? parts.slice(0, 3).join(language === "zh" ? "；" : "; ") : language === "zh" ? "时间待定" : "Time TBA";
}

// The step 02 preferences being followed, in a few words ("no class on Fri, nothing before 10:00am").
function preferencesLabel(active: ActivePreferences, language: Language) {
  const zh = language === "zh";
  const span = active.window;
  return [
    active.excludedDays.length ? (zh ? `${dayList(active.excludedDays, language)}不上课` : `no class on ${dayList(active.excludedDays, language)}`) : "",
    active.earliest !== null ? (zh ? `不早于 ${clock(active.earliest)}` : `nothing before ${clock(active.earliest)}`) : "",
    span ? (zh ? `只在 ${clock(span.start)}–${clock(span.end)} 之间` : `only between ${clock(span.start)} and ${clock(span.end)}`) : "",
    active.busyBlocks.length ? (zh ? `避开 ${active.busyBlocks.length} 个个人安排` : `around ${active.busyBlocks.length} personal commitment${active.busyBlocks.length === 1 ? "" : "s"}`) : "",
    active.campusAreas.length ? (zh ? "只在选定的校区" : "only in the parts of campus you chose") : "",
  ].filter(Boolean).join(zh ? "、" : ", ");
}

const copy = {
  en: {
    hideHonors: "Hide Honors and program-only courses (Honors College, Scholars, Living-Learning, …)", lighter: "Lighter-load options", noPrereq: "No prerequisites or enrollment restrictions", prereqsMet: "Prerequisites I've met", prereqsMetNeedTaken: "Add the courses you've taken (top of the page) to use this.", prereqsMetNoRules: "Prerequisite rules are only available for Spring 2027.", lowerLevel: "Only 100–200 level (introductory)",
    sortGpa: "Sort by historical average GPA", sortDefault: "Default order", gpaLoading: "Loading historical averages…", gpaError: "Historical averages could not be loaded.",
    gpaNote: `Historical average GPA comes from PlanetTerp. It averages every past term and instructor, so it is not a promise about this term. Looked up for the first ${GPA_LOOKUP_LIMIT} courses listed.`,
    avgGpa: "Hist. avg GPA",
    counts: (n: number) => `Counts for ${n}`, or: " or ", orTitle: "Counts for one of these, not both",
    twoForOne: "Only courses that also count for another Gen Ed (two requirements, one course)", fromAudit: (codes: string) => `Selected from your degree audit: ${codes}. Courses that count for more of them are listed first.`,
    category: "Gen Ed categories · pick one or more", choose: "Pick one or more categories above.", clear: "Clear",
    matchAll: "Only courses that count for every selected category (one course, several requirements)", loading: "Loading courses…", error: "Gen Ed courses could not be loaded. Try again shortly.",
    fitsOnly: "Only sections that fit my schedule", openOnly: "Only sections with open seats",
    against: "Checking against your schedule:", noReference: "Generate a schedule in step 02 to check time conflicts. Until then, every section counts as fitting.",
    fitting: (n: number) => n === 1 ? "1 section fits" : `${n} sections fit`, none: "No section fits",
    tba: (n: number) => `+ ${n} time TBA`, online: (n: number) => `incl. ${n} online, no set time`, staleReference: "Updating your schedule for the latest change; conflicts are checked again in a moment. If this stays, check your preferences in step 02.", inPlan: "In your plan",
    credits: "cr", empty: "No courses match these filters.", count: (shown: number, total: number) => `${shown} of ${total} courses`,
    fcNote: "Freshman Connection (FC) sections are not counted.", view: "View sections →", quickAdd: "Add", inPlanShort: "In plan",
    needCount: "Courses still needed in each", optimize: "Find the fewest courses", optimizeHint: "From this term's courses, the smallest set that covers every category above, using the filters below. Courses anyone can take (no prerequisite, 100-200 level) with a good average GPA come first.",
    fewest: (added: number, covered: number, total: number, inPlan: number) => `${inPlan ? `With ${inPlan} course${inPlan === 1 ? "" : "s"} already in your plan, ${added} more` : `${added} course${added === 1 ? "" : "s"}`} cover${added === 1 ? "s" : ""} ${covered === total ? total === 1 ? "this need" : `all ${total} needs` : `${covered} of the ${total} needs`}`,
    option: (n: number) => `Option ${n}`, coversLabel: "counts for", needLabel: (need: string) => need === "DIV" ? "DVUP or DVCC" : need, lineFromPlan: "in your plan",
    divRule: "Diversity is two DVUP courses, or one DVUP and one DVCC.", diversityTaken: "Diversity taken so far:", diversityOption: (taken: DiversityTaken) => taken === "none" ? "None yet" : `1 ${taken}`,
    divNeed: (taken: DiversityTaken) => taken === "none" ? "So 2 to go: one DVUP, and one more DVUP or DVCC." : taken === "DVUP" ? "So 1 to go: DVUP or DVCC, either one." : "So 1 more DVUP.", labRule: "One of the two natural sciences needs a lab (DSNL); a lab course can also be the other one.",
    uncovered: (list: string) => `No course this term covers ${list}; leave it for a later term.`, allCovered: "Your plan already covers these.",
    addAll: "Add all to plan", allInPlan: "All in your plan", overLimit: "A plan holds 10 courses; these would not fit.", noPlan: "Under these filters, no set of this term's courses fits together. Try turning off a filter below.",
    ignorePlan: "Leave my plan out of the sets: don't count the courses already in it, and don't check times against my schedule", noPlanYet: " (your plan has no courses yet)",
    followPrefs: (what: string) => `Follow my step 02 preferences: ${what}`, taken: "Taken", takenAs: (id: string) => `You took ${id}: no credit for both`,
    alsoListed: (ids: string) => `Also listed as ${ids} (same class)`, sectionCount: (n: number) => `${n} sections to choose from`,
    setCredits: (n: number) => `${n} credit${n === 1 ? "" : "s"} in all`, afterAdding: (n: number) => `${n} with your plan`,
    gpaUpdating: "Reading average GPAs; the options may shift a little.", manyCourses: "That is more than one term's load: take some now and the rest in later terms.",
    optimizeRules: "Check your degree audit too: one DSSP course must be outside your major, and AP credit cannot count for Big Question (I-Series).",
  },
  zh: {
    hideHonors: "不显示荣誉课程和项目专属课程（荣誉学院、Scholars、Living-Learning 等）", lighter: "想轻松一点？", noPrereq: "无先修要求和选课限制", prereqsMet: "先修课我已满足", prereqsMetNeedTaken: "先在页面顶部填写修过的课程，才能用这个筛选。", prereqsMetNoRules: "只有 Spring 2027 有先修课规则。", lowerLevel: "只看 100–200 级入门课",
    sortGpa: "按历史平均 GPA 排序", sortDefault: "恢复默认排序", gpaLoading: "正在读取历史平均 GPA…", gpaError: "暂时无法读取历史平均 GPA。",
    gpaNote: `历史平均 GPA 来自 PlanetTerp，是这门课过去所有学期、所有老师的平均，不代表这学期的给分。只查询列表中前 ${GPA_LOOKUP_LIMIT} 门课。`,
    avgGpa: "历史平均 GPA",
    counts: (n: number) => `抵 ${n} 项`, or: " 或 ", orTitle: "二选一，只能算其中一项",
    twoForOne: "只看还能同时抵另一项 Gen Ed 的课（一门课抵两项）", fromAudit: (codes: string) => `已按学位审计选好：${codes}。能同时抵多项要求的课排在前面。`,
    category: "Gen Ed 类别 · 可多选", choose: "在上方选择一个或多个类别。", clear: "清除",
    matchAll: "只看同时满足所有所选类别的课（一门课抵多项要求）", loading: "正在读取课程…", error: "暂时无法读取 Gen Ed 课程，请稍后再试。",
    fitsOnly: "只看和我的课表不冲突的班", openOnly: "只看有空位的班",
    against: "对照的课表：", noReference: "先在「02 排课」生成方案，才能检查时间冲突；在那之前所有班都算不冲突。",
    fitting: (n: number) => `${n} 个班可选`, none: "没有合适的班",
    tba: (n: number) => `另有 ${n} 个时间待定`, online: (n: number) => `含 ${n} 个线上班（无固定时间）`, staleReference: "正在根据最新改动更新方案，稍后会重新检查冲突。如果一直显示这句，请到「02 排课」检查排课偏好。", inPlan: "已在排课中",
    credits: "学分", empty: "没有符合筛选条件的课程。", count: (shown: number, total: number) => `显示 ${shown} / ${total} 门课`,
    fcNote: "不计入 Freshman Connection（FC）班。", view: "查看班次 →", quickAdd: "加入", inPlanShort: "已加入",
    needCount: "每项还缺几门", optimize: "帮我配最少的课", optimizeHint: "用这学期的课，配出能补齐上面所有类别、门数最少的组合（按下面勾选的筛选条件）。同样门数时，优先选没有先修要求、100–200 级、历史 GPA 高的课。",
    fewest: (added: number, covered: number, total: number, inPlan: number) => `${inPlan ? `加上方案里已有的 ${inPlan} 门，再加 ${added} 门课` : `${added} 门课`}就能补齐${covered === total ? total === 1 ? "这一项" : `全部 ${total} 项` : ` ${total} 项里的 ${covered} 项`}`,
    option: (n: number) => `组合 ${n}`, coversLabel: "抵", needLabel: (need: string) => need === "DIV" ? "DVUP 或 DVCC" : need, lineFromPlan: "已在方案",
    divRule: "Diversity 要 2 门 DVUP，或 1 门 DVUP 加 1 门 DVCC。", diversityTaken: "Diversity 已修：", diversityOption: (taken: DiversityTaken) => taken === "none" ? "还没修" : `1 门 ${taken}`,
    divNeed: (taken: DiversityTaken) => taken === "none" ? "所以还要 2 门：1 门 DVUP，另 1 门 DVUP 或 DVCC 都行。" : taken === "DVUP" ? "所以还要 1 门，DVUP 或 DVCC 都行。" : "所以还要 1 门 DVUP。", labRule: "自然科学的 2 门里要有 1 门带实验（DSNL）；实验课也能算作另一门。",
    uncovered: (list: string) => `这学期开的课补不了 ${list}，要留到以后的学期。`, allCovered: "你的方案已经补齐了这些类别。",
    addAll: "全部加入方案", allInPlan: "已全部在方案里", overLimit: "每个方案最多 10 门课，加不下了。", noPlan: "按现在的筛选条件，这学期的课配不出能同时上的组合。可以试着关掉下面的某个筛选。",
    ignorePlan: "不结合我的方案来配课：不算方案里已有的课，也不查和课表的时间冲突", noPlanYet: "（方案里还没有课）",
    followPrefs: (what: string) => `按「02 排课」的偏好：${what}`, taken: "已修过", takenAs: (id: string) => `已修过 ${id}，不能重复拿学分`,
    alsoListed: (ids: string) => `也叫 ${ids}（同一门课）`, sectionCount: (n: number) => `共 ${n} 个班可选`,
    setCredits: (n: number) => `共 ${n} 学分`, afterAdding: (n: number) => `加入后方案共 ${n} 学分`,
    gpaUpdating: "正在读取历史平均 GPA，组合可能会微调。", manyCourses: "一学期修不完这么多，可以先选一部分，其余留到以后的学期。",
    optimizeRules: "最后请以学位审计为准：DSSP 至少要有一门在本专业之外，AP 学分不能抵 Big Question（I-Series）。",
  },
} as const;

const count = (value: unknown) => typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null;

// Every need with the course that fills it ("DSHU · MUSC205 (in your plan)"), or a cross when nothing does.
function NeedLines({ lines, t }: { lines: NeedLine[]; t: { needLabel: (need: string) => string; lineFromPlan: string } }) {
  return <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[#f0ede6] pt-2 text-[11px]">{lines.map((line, index) => <span key={index} className={`rounded px-1.5 py-0.5 ${line.id ? "bg-[#edf3ef] text-[#315c43]" : "bg-[#fff8e8] text-[#745424]"}`}>{line.id ? "✓" : "✕"} {t.needLabel(line.need)}{line.id ? ` · ${line.id}` : ""}{line.fromPlan ? ` (${t.lineFromPlan})` : ""}</span>)}</div>;
}

export default function GenEdFinder({ term, language, reference, referenceStale, planCourseIds, takenCodes = null, onOpenCourse, onAddCourse, initialCodes = [], initialCounts = {}, fromAudit = false, preferences = null, planCredits = null }: {
  term: string;
  language: Language;
  // Only passed when it matches the current plan; referenceStale says an older one was dropped.
  reference: ReferenceSchedule | null;
  referenceStale: boolean;
  planCourseIds: string[];
  // Courses taken (completed or in progress), or null when the student has not entered any.
  takenCodes?: string[] | null;
  onOpenCourse: (course: { course_id: string; name: string }) => void;
  onAddCourse: (course: { course_id: string; name: string }) => void;
  // Categories chosen elsewhere (the degree audit page), with how many courses each still needs; the parent
  // remounts this finder when they change.
  initialCodes?: string[];
  initialCounts?: Record<string, number>;
  fromAudit?: boolean;
  // Step 02's preferences that rule sections out (days off, earliest start, ...), or null before it has loaded.
  preferences?: SectionPreferences | null;
  // The plan's credits so far (the lowest total), or null while they load.
  planCredits?: number | null;
}) {
  const t = copy[language];
  const [codes, setCodes] = useState<string[]>(initialCodes);
  // How many courses each selected category still needs (1 unless the student says 2), and whether the
  // "fewest courses" sets are showing.
  const [needCounts, setNeedCounts] = useState<Record<string, number>>(() => Object.fromEntries(Object.entries(initialCounts)
    .filter(([code]) => TWO_COURSE_CODES.includes(code)).map(([code, n]) => [code, Math.min(2, n)])));
  const [optimizing, setOptimizing] = useState(false);
  // The sets can also be made as if the plan were empty: its courses count like any other, and no section is
  // checked against the schedule.
  const [ignorePlan, setIgnorePlan] = useState(false);
  // What the student has taken toward Diversity, once they say; until then it follows the selected codes.
  // An audit asking for two DVUP courses means none taken yet.
  const [diversityTaken, setDiversityTaken] = useState<DiversityTaken | null>((initialCounts.DVUP ?? 1) > 1 ? "none" : null);
  const diversity = diversityDefault(codes) && diversityTaken ? diversityTaken : diversityDefault(codes);
  const [matchAll, setMatchAll] = useState(false);
  // Loaded category lists, keyed by term|code, so adding or removing a category never reloads the others.
  const [lists, setLists] = useState<Record<string, { courses: GenEdCourse[]; seatCheckedAt: string | null }>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const requested = useRef(new Set<string>());
  const [fitsOnly, setFitsOnly] = useState(true);
  const [openOnly, setOpenOnly] = useState(true);
  const [hideHonors, setHideHonors] = useState(true);
  const [noPrereq, setNoPrereq] = useState(false);
  const [lowerLevel, setLowerLevel] = useState(false);
  const [twoForOne, setTwoForOne] = useState(false);
  const [prereqsMet, setPrereqsMet] = useState(false);
  const [followPrefs, setFollowPrefs] = useState(true);
  const activePrefs = useMemo(() => activePreferences(preferences), [preferences]);
  const prefsOn = followPrefs ? activePrefs : null;
  const canCheckPrereqs = term === "202701" && Boolean(takenCodes?.length);
  const takenSet = useMemo(() => courseSet(takenCodes ?? []), [takenCodes]);
  // Exactly the courses taken (courseSet also adds base numbers, which would mark other topics of a series taken).
  const takenIds = useMemo(() => new Set((takenCodes ?? []).map((code) => code.trim().toUpperCase())), [takenCodes]);
  const planSet = useMemo(() => courseSet(planCourseIds), [planCourseIds]);
  const [sortByGpa, setSortByGpa] = useState(false);
  const [gpa, setGpa] = useState<Record<string, number | null>>({});
  const [gpaLoading, setGpaLoading] = useState(false);
  const [gpaError, setGpaError] = useState(false);
  const gpaRequested = useRef(new Set<string>());
  // The selected categories as requirements: DVUP and DVCC together are one.
  const requirements = useMemo(() => [...new Set(codes.map(asRequirement))], [codes]);
  // Every course carries all of its Gen Ed tags, so "every selected category" needs only the first
  // requirement's lists (both Diversity lists when that is Diversity).
  // The fewest-courses sets need every selected category's list, even with "every selected category" on.
  const neededKeys = useMemo(() => (matchAll && !optimizing ? codes.filter((code) => asRequirement(code) === requirements[0]) : codes).map((code) => `${term}|${code}`), [codes, requirements, matchAll, optimizing, term]);
  const fetchKeys = useMemo(() => [...new Set([...neededKeys, ...(optimizing ? codes.flatMap((code) => ALSO_LOAD[code] ?? []).map((code) => `${term}|${code}`) : [])])], [neededKeys, optimizing, codes, term]);

  useEffect(() => {
    for (const key of fetchKeys) {
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      const code = key.split("|")[1]!;
      fetch(`/api/gened?term=${encodeURIComponent(term)}&code=${encodeURIComponent(code)}`)
        .then(async (response) => {
          const payload = await response.json() as { courses?: GenEdCourse[]; seatCheckedAt?: string };
          if (!response.ok) throw new Error("gened");
          setLists((current) => ({ ...current, [key]: { courses: payload.courses ?? [], seatCheckedAt: payload.seatCheckedAt ?? null } }));
        })
        .catch(() => {
          requested.current.delete(key);
          setFailed((current) => ({ ...current, [key]: true }));
        });
    }
  }, [fetchKeys, term]);

  const toggleCode = (code: string) => {
    setFailed({});
    if (DIVERSITY_CODES.includes(code)) setDiversityTaken(null);
    setCodes((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  };
  const loadedAll = neededKeys.length > 0 && neededKeys.every((key) => lists[key]);
  const loading = neededKeys.length > 0 && !loadedAll && !neededKeys.some((key) => failed[key]);
  const current = useMemo(() => {
    if (!loadedAll) return null;
    const byId = new Map<string, GenEdCourse>();
    for (const key of neededKeys) for (const course of lists[key]!.courses) byId.set(course.course_id, course);
    const courses = [...byId.values()].filter((course) => !matchAll || genEdCoverage(requirementGroups(groupsOf(course)), requirements) === requirements.length);
    const times = neededKeys.map((key) => lists[key]!.seatCheckedAt).filter((value): value is string => Boolean(value)).sort();
    return { courses, seatCheckedAt: times[0] ?? null };
  }, [loadedAll, neededKeys, lists, matchAll, requirements]);
  const referenceForTerm = reference?.term === term ? reference : null;
  // Listings of one class among this term's loaded courses: the class key for the sets, and the other numbers.
  const listings = useMemo(() => {
    const loaded = new Map<string, GenEdCourse>();
    for (const [key, list] of Object.entries(lists)) if (key.startsWith(`${term}|`)) for (const course of list.courses) loaded.set(course.course_id, course);
    const courses = [...loaded.values()];
    const groups = crossListGroups(courses);
    const members = new Map<string, string[]>();
    for (const course of courses) members.set(groups.get(course.course_id)!, [...(members.get(groups.get(course.course_id)!) ?? []), course.course_id]);
    return new Map(courses.map((course) => [course.course_id, {
      key: groups.get(course.course_id)!,
      others: [...new Set([...(course.crossListed ?? []), ...(members.get(groups.get(course.course_id)!) ?? [])])].filter((id) => id !== course.course_id),
    }]));
  }, [lists, term]);

  const baseRows = useMemo(() => (current?.courses ?? []).filter((course) =>
    (!hideHonors || (!isHonorsCourse(course, current?.courses ?? []) && !course.programOnly))
    && (!noPrereq || (!course.hasPrerequisite && !course.hasRestriction))
    // Course numbers start at the 5th character (AAAS100 -> 1); 100/200 are introductory levels.
    && (!lowerLevel || /^[12]$/.test(course.course_id.charAt(4)))
    // Two requirements from one course: at least two groups (an "A or B" group is still only one).
    && (!twoForOne || groupsOf(course).length >= 2)
    // Courses in the plan count as "same term" for prerequisites that allow it, as in the planner.
    && (!prereqsMet || !canCheckPrereqs || unmetRequirements(course.pr, takenSet, planSet).length === 0)).map((course) => {
    const usable = usableSections(course, openOnly, prefsOn);
    // Sections without a set time cannot be checked, so they are counted apart rather than called "fitting".
    const tba = usable.filter((section) => hasUnknownTime(section.meetings ?? []));
    const fitting = usable.filter((section) => !hasUnknownTime(section.meetings ?? [])
      && (!fitsOnly || !referenceForTerm || !meetingsConflict(section.meetings ?? [], referenceForTerm.meetings)));
    // How many of the selected categories this one course would satisfy at once.
    const matched = genEdCoverage(requirementGroups(groupsOf(course)), requirements);
    return { course, matched, fitting: fitting.length, online: fitting.filter((section) => isOnlineOnly(section.meetings ?? [])).length, tba: tba.length, taken: takenAs(course, takenIds) };
  // Courses already taken go last.
  }).sort((a, b) => Number(Boolean(a.taken)) - Number(Boolean(b.taken)) || Number(b.fitting > 0) - Number(a.fitting > 0) || b.matched - a.matched || Number(b.tba > 0) - Number(a.tba > 0) || a.course.course_id.localeCompare(b.course.course_id)), [current, openOnly, prefsOn, fitsOnly, referenceForTerm, requirements, hideHonors, noPrereq, lowerLevel, twoForOne, prereqsMet, canCheckPrereqs, takenSet, takenIds, planSet]);
  const baseShown = useMemo(() => baseRows.filter((row) => row.fitting > 0 || row.tba > 0 || (!fitsOnly && !openOnly)), [baseRows, fitsOnly, openOnly]);
  // Averages are fetched for the default-order list, so re-sorting by them never triggers more lookups.
  const gpaIds = useMemo(() => baseShown.slice(0, GPA_LOOKUP_LIMIT).map((row) => row.course.course_id), [baseShown]);
  const shown = useMemo(() => sortByGpa
    ? [...baseShown].sort((a, b) => Number(Boolean(a.taken)) - Number(Boolean(b.taken)) || Number(b.fitting > 0) - Number(a.fitting > 0) || (gpa[b.course.course_id] ?? -1) - (gpa[a.course.course_id] ?? -1) || b.matched - a.matched || a.course.course_id.localeCompare(b.course.course_id))
    : baseShown, [baseShown, sortByGpa, gpa]);

  // "Find the fewest courses": every listed course (the filters above apply, except "two requirements, one
  // course", which would hide single-category courses a set may need) with the sections it can be taken in.
  const needs = useMemo(() => Object.fromEntries(codes.flatMap((code): [string, number][] => {
    if (!DIVERSITY_CODES.includes(code)) return [[code, needCounts[code] ?? 1]];
    // Diversity once, where the first of its codes was picked.
    return diversity && code === codes.find((item) => DIVERSITY_CODES.includes(item)) ? Object.entries(diversityNeeds(diversity)) : [];
  })), [codes, needCounts, diversity]);
  const poolReady = optimizing && fetchKeys.length > 0 && fetchKeys.every((key) => lists[key]);
  const poolCourses = useMemo(() => {
    if (!poolReady) return null;
    const byId = new Map<string, GenEdCourse>();
    for (const key of fetchKeys) for (const course of lists[key]!.courses) byId.set(course.course_id, course);
    return [...byId.values()];
  }, [poolReady, fetchKeys, lists]);
  // Each candidate's sections are kept too (in the order the sets index them), to show when a set's courses meet.
  const pool = useMemo(() => {
    const sectionsOf = new Map<string, GenEdSection[]>();
    const planIds = new Set(planCourseIds);
    const candidates = !poolCourses ? [] : poolCourses.filter((course) =>
      (!hideHonors || (!isHonorsCourse(course, poolCourses) && !course.programOnly))
      && (!noPrereq || (!course.hasPrerequisite && !course.hasRestriction))
      && (!lowerLevel || /^[12]$/.test(course.course_id.charAt(4)))
      && (!prereqsMet || !canCheckPrereqs || unmetRequirements(course.pr, takenSet, planSet).length === 0)).flatMap((course): PlanCandidate[] => {
      const inPlan = !ignorePlan && planIds.has(course.course_id);
      const listing = listings.get(course.course_id);
      if (!inPlan) {
        if (ARRANGED.test(course.name) || takenAs(course, takenIds)) return [];
        // Another listing of a plan course, or one credited only once together with it, adds nothing.
        if (!ignorePlan && [...(listing?.others ?? []), ...(course.creditOnlyFor ?? [])].some((id) => planIds.has(id))) return [];
      }
      const usable = usableSections(course, openOnly, prefsOn);
      const known = usable.filter((section) => !hasUnknownTime(section.meetings ?? []) && (!fitsOnly || ignorePlan || !referenceForTerm || !meetingsConflict(section.meetings ?? [], referenceForTerm.meetings)));
      const timeless = usable.filter((section) => hasUnknownTime(section.meetings ?? []));
      if (!known.length && !timeless.length && !inPlan) return [];
      sectionsOf.set(course.course_id, [...known, ...timeless]);
      const sections = [...known.map((section) => section.meetings ?? []), ...timeless.map(() => [])];
      // A good average GPA, then open to anyone (no prerequisite or restriction, 100-200 level), then a section
      // with a set time over one still to be announced.
      const score = (gpa[course.course_id] ?? 3) - (course.hasPrerequisite || course.hasRestriction ? 0.6 : 0) - (/^[12]$/.test(course.course_id.charAt(4)) ? 0 : 0.3) + (known.length ? 0.3 : 0);
      return [{ id: course.course_id, groups: groupsOf(course), score, sections: sections.length ? sections : [[]], inPlan, sameAs: listing?.key, notWith: course.creditOnlyFor ?? [] }];
    });
    return { candidates, sectionsOf };
  }, [poolCourses, hideHonors, noPrereq, lowerLevel, prereqsMet, canCheckPrereqs, takenSet, takenIds, planSet, planCourseIds, ignorePlan, listings, openOnly, prefsOn, fitsOnly, referenceForTerm, gpa]);
  const candidates = pool.candidates;
  const genEdPlan = useMemo(() => poolCourses ? planGenEds(needs, candidates) : null, [poolCourses, needs, candidates]);
  // Averages for the courses the sets are made from: the ones that count for the most needs come first.
  const optimizeIds = useMemo(() => [...candidates].sort((a, b) => b.groups.length - a.groups.length).map((item) => item.id), [candidates]);
  const gpaWanted = useMemo(() => [...new Set([...(optimizing ? optimizeIds : []), ...(sortByGpa ? gpaIds : [])])].slice(0, GPA_LOOKUP_LIMIT * (optimizing && sortByGpa ? 2 : 1)), [optimizing, optimizeIds, sortByGpa, gpaIds]);
  const courseById = useMemo(() => new Map((poolCourses ?? current?.courses ?? []).map((course) => [course.course_id, course])), [poolCourses, current]);
  useEffect(() => {
    const missing = gpaWanted.filter((id) => !gpaRequested.current.has(id));
    if (!missing.length) return;
    missing.forEach((id) => gpaRequested.current.add(id));
    const batches = Array.from({ length: Math.ceil(missing.length / 30) }, (_, index) => missing.slice(index * 30, index * 30 + 30));
    setGpaLoading(true); setGpaError(false);
    Promise.all(batches.map(async (courseIds) => {
      const response = await fetch("/api/audit/grades", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseIds }) });
      if (!response.ok) throw new Error("grades");
      return (await response.json() as { averages?: Record<string, number | null> }).averages ?? {};
    })).then((results) => setGpa((current) => Object.assign({}, current, ...results)))
      .catch(() => { missing.forEach((id) => gpaRequested.current.delete(id)); setGpaError(true); })
      .finally(() => setGpaLoading(false));
  }, [gpaWanted]);

  const categoryButton = (item: (typeof GEN_ED_CATEGORIES)[number]) => {
    const on = codes.includes(item.code);
    return <button key={item.code} type="button" aria-pressed={on} title={item[language]} onClick={() => toggleCode(item.code)} className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${on ? "border-[#273c38] bg-[#273c38] text-white" : "border-[#dedbd3] bg-white text-[#48534f] hover:border-[#9aa8a1]"}`}><span className="font-semibold">{item.code}</span><span className={`ml-1 ${on ? "text-white/80" : "text-[#646c68]"}`}>{item[language]}</span></button>;
  };

  return <div>
    {fromAudit && initialCodes.length > 0 && <p className="mb-3 rounded-lg bg-[#edf3ef] px-3 py-2 text-xs leading-5 text-[#315c43]">{t.fromAudit(initialCodes.map((code) => (initialCounts[code] ?? 1) > 1 ? `${code} ×${initialCounts[code]}` : code).join(", "))}</p>}
    <div className="flex items-center justify-between gap-3"><p className="text-xs font-medium text-[#5d6561]">{t.category}</p>{codes.length > 0 && <button type="button" onClick={() => setCodes([])} className="text-[11px] font-medium text-[#8b5148] hover:underline">{t.clear}</button>}</div>
    <div className="mt-2 flex flex-wrap gap-1.5">{GEN_ED_CATEGORIES.filter((item) => !DIVERSITY_CODES.includes(item.code)).map(categoryButton)}
      <span className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-[#cfcac0] p-1" title={t.divRule}>{DIVERSITY_CODES.map((code, index) => <span key={code} className="inline-flex items-center gap-1.5">{index > 0 && <span className="text-[11px] text-[#646c68]">{t.or.trim()}</span>}{categoryButton(GEN_ED_CATEGORIES.find((item) => item.code === code)!)}</span>)}</span>
    </div>
    {requirements.length > 1 && <label className="mt-3 flex items-start gap-2 text-xs text-[#48534f]"><input type="checkbox" className="mt-0.5" checked={matchAll} onChange={(event) => setMatchAll(event.target.checked)} />{t.matchAll}</label>}
    {codes.length > 0 && <div className="mt-3 rounded-lg border border-[#cddbd1] bg-[#f4f8f5] p-3">
      {codes.some((code) => TWO_COURSE_CODES.includes(code)) && <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[#48534f]"><span className="font-medium">{t.needCount}</span>{codes.filter((code) => TWO_COURSE_CODES.includes(code)).map((code) => <span key={code} className="inline-flex items-center gap-1"><span className="font-semibold">{code}</span>{[1, 2].map((n) => <button key={n} type="button" aria-pressed={(needCounts[code] ?? 1) === n} onClick={() => setNeedCounts((current) => ({ ...current, [code]: n }))} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${(needCounts[code] ?? 1) === n ? "bg-[#273c38] text-white" : "border border-[#d9d6ce] bg-white text-[#48534f]"}`}>×{n}</button>)}</span>)}</div>}
      {diversity && <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-xs text-[#48534f] ${codes.some((code) => TWO_COURSE_CODES.includes(code)) ? "mt-2" : ""}`}><span className="font-medium">{t.diversityTaken}</span>{DIVERSITY_TAKEN.map((taken) => <button key={taken} type="button" aria-pressed={diversity === taken} onClick={() => setDiversityTaken(taken)} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${diversity === taken ? "bg-[#273c38] text-white" : "border border-[#d9d6ce] bg-white text-[#48534f]"}`}>{t.diversityOption(taken)}</button>)}</div>}
      {diversity && <p className="mt-1.5 text-[11px] leading-5 text-[#646c68]">{t.divRule} {t.divNeed(diversity)}</p>}
      {codes.some((code) => code === "DSNS" || code === "DSNL") && <p className="mt-1 text-[11px] leading-5 text-[#646c68]">{t.labRule}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"><button type="button" aria-pressed={optimizing} onClick={() => setOptimizing((value) => !value)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${optimizing ? "border border-[#273c38] bg-white text-[#273c38]" : "bg-[#273c38] text-white hover:bg-[#1d302c]"}`}>{optimizing ? "✓ " : ""}{t.optimize}</button><span className="min-w-0 basis-full text-[11px] leading-5 text-[#646c68] sm:flex-1 sm:basis-auto">{t.optimizeHint}</span></div>
      <label className={`mt-2 flex items-start gap-2 text-[11px] leading-5 ${planCourseIds.length ? "text-[#48534f]" : "text-[#8a918e]"}`}><input type="checkbox" className="mt-0.5" disabled={!planCourseIds.length} checked={ignorePlan && planCourseIds.length > 0} onChange={(event) => setIgnorePlan(event.target.checked)} /><span>{t.ignorePlan}{!planCourseIds.length && t.noPlanYet}</span></label>
      {optimizing && <div className="mt-3 border-t border-[#cddbd1] pt-3 text-xs text-[#48534f]">
        {!genEdPlan ? <p className="text-[#646c68]">{fetchKeys.some((key) => failed[key]) ? t.error : t.loading}</p> : <>
          {genEdPlan.plans.length > 0 ? <>
            <p className="font-semibold text-[#273c38]">{t.fewest(genEdPlan.plans[0]!.picks.length, genEdPlan.total - genEdPlan.uncovered.length, genEdPlan.total, genEdPlan.fromPlan.length)}</p>
            {genEdPlan.plans[0]!.picks.length >= 5 && <p className="mt-1 text-[11px] text-[#646c68]">{t.manyCourses}</p>}
            <ol className="mt-2 grid gap-2">{genEdPlan.plans.map((plan, index) => {
              const missing = plan.picks.filter((pick) => !planCourseIds.includes(pick.id));
              const over = planCourseIds.length + missing.length > PLAN_LIMIT;
              const setCredits = plan.picks.reduce((total, pick) => total + (creditsOf(courseById.get(pick.id)) ?? 0), 0);
              // What the plan would add up to, when its own credits are known and something would be added.
              const after = planCourseIds.length && planCredits !== null && missing.length ? planCredits + missing.reduce((total, pick) => total + (creditsOf(courseById.get(pick.id)) ?? 0), 0) : null;
              const afterWarning = after === null ? "" : creditWarning({ min: after, max: after, unknown: [], pending: [] }, term, language);
              return <li key={plan.picks.map((pick) => pick.id).join()} className="rounded-lg border border-[#e0ddd5] bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#9a5040]">{t.option(index + 1)}</span>
                  {missing.length ? <button type="button" disabled={over} title={over ? t.overLimit : undefined} onClick={() => missing.forEach((pick) => onAddCourse({ course_id: pick.id, name: courseById.get(pick.id)?.name ?? pick.id }))} className="rounded-lg border border-[#536d64] px-2.5 py-1 text-[11px] font-semibold text-[#273c38] hover:bg-[#edf3ef] disabled:cursor-not-allowed disabled:opacity-50">+ {t.addAll}</button> : <span className="text-[11px] font-semibold text-[#315c43]">✓ {t.allInPlan}</span>}</div>
                {setCredits > 0 && <p className="mt-1 text-[11px] text-[#646c68]">{t.setCredits(setCredits)}{after !== null ? ` · ${t.afterAdding(after)}` : ""}</p>}
                {afterWarning && <p className="mt-1 text-[11px] leading-5 text-[#8f4538]">⚠ {afterWarning}</p>}
                {over && missing.length > 0 && <p className="mt-1 text-[11px] text-[#8f4538]">{t.overLimit}</p>}
                <ul className="mt-1 divide-y divide-[#f0ede6]">{plan.picks.map((pick) => {
                  const course = courseById.get(pick.id);
                  const sections = pool.sectionsOf.get(pick.id) ?? [];
                  const section = pick.section === undefined ? undefined : sections[pick.section];
                  const credits = creditsOf(course);
                  const others = listings.get(pick.id)?.others ?? [];
                  // Credits, when the section the set was checked with meets, how many sections there are, other numbers.
                  const details = [credits !== null ? `${course!.credits} ${t.credits}` : "", section ? meetingsLabel(section.meetings ?? [], language) : "", sections.length > 1 ? t.sectionCount(sections.length) : "", others.length ? t.alsoListed(others.join(", ")) : ""].filter(Boolean);
                  return <li key={pick.id} className="py-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <button type="button" onClick={() => course && onOpenCourse({ course_id: course.course_id, name: course.name })} className="min-w-0 text-left hover:text-[#a34a39]"><span className="font-semibold">{pick.id}</span> <span className="text-[#606966]">{course?.name}</span></button>
                      <span className="flex flex-wrap items-center gap-1 text-[11px]">{typeof gpa[pick.id] === "number" && <span className="text-[#536d64]">GPA {gpa[pick.id]!.toFixed(2)}</span>}<span className="text-[#646c68]">{t.coversLabel}</span>{pick.covers.map((code) => <span key={code} className="rounded bg-[#273c38] px-1.5 py-0.5 font-semibold text-white">{code}</span>)}{planCourseIds.includes(pick.id) && <span className="text-[#315c43]">· {t.inPlanShort}</span>}</span>
                    </div>
                    {details.length > 0 && <p className="mt-0.5 text-[11px] leading-5 text-[#646c68]">{details.join(" · ")}</p>}
                  </li>;
                })}</ul>
                <NeedLines lines={plan.lines} t={t} />
              </li>;
            })}</ol>
          </> : <>
            {!genEdPlan.uncovered.length && <p className="text-[#315c43]">{genEdPlan.fromPlan.length ? t.allCovered : t.noPlan}</p>}
            {genEdPlan.fromPlan.length > 0 && <NeedLines lines={genEdPlan.lines} t={t} />}
          </>}
          {genEdPlan.uncovered.length > 0 && <p className="mt-2 text-[#745424]">⚠ {t.uncovered([...new Set(genEdPlan.uncovered)].map((need) => `${t.needLabel(need)}${genEdPlan.uncovered.filter((item) => item === need).length > 1 ? " ×" + genEdPlan.uncovered.filter((item) => item === need).length : ""}`).join(language === "zh" ? "、" : ", "))}</p>}
          {gpaLoading && <p className="mt-2 text-[11px] text-[#646c68]">{t.gpaUpdating}</p>}
          <p className="mt-2 text-[11px] leading-5 text-[#646c68]">{t.optimizeRules}</p>
        </>}
      </div>}
    </div>}
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#5d6561]">
      <label className="inline-flex items-center gap-2"><input type="checkbox" checked={fitsOnly} onChange={(event) => setFitsOnly(event.target.checked)} />{t.fitsOnly}</label>
      {activePrefs && <label className="inline-flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={followPrefs} onChange={(event) => setFollowPrefs(event.target.checked)} />{t.followPrefs(preferencesLabel(activePrefs, language))}</label>}
      <label className="inline-flex items-center gap-2"><input type="checkbox" checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} />{t.openOnly}</label>
      <label className="inline-flex items-center gap-2"><input type="checkbox" checked={hideHonors} onChange={(event) => setHideHonors(event.target.checked)} />{t.hideHonors}</label>
      <label className="inline-flex items-center gap-2 font-medium text-[#273c38]"><input type="checkbox" checked={twoForOne} onChange={(event) => setTwoForOne(event.target.checked)} />{t.twoForOne}</label>
    </div>
    <div className="mt-3 rounded-lg border border-[#e3e0d8] bg-[#f6f4ef] p-3 text-xs text-[#5d6561]">
      <p className="font-semibold text-[#48534f]">{t.lighter}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={noPrereq} onChange={(event) => setNoPrereq(event.target.checked)} />{t.noPrereq}</label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={lowerLevel} onChange={(event) => setLowerLevel(event.target.checked)} />{t.lowerLevel}</label>
        <label className={`inline-flex items-center gap-2 ${canCheckPrereqs ? "" : "opacity-60"}`}><input type="checkbox" disabled={!canCheckPrereqs} checked={prereqsMet && canCheckPrereqs} onChange={(event) => setPrereqsMet(event.target.checked)} />{t.prereqsMet}</label>
      </div>
      {!canCheckPrereqs && <p className="mt-1.5 text-[11px] leading-5 text-[#646c68]">{term !== "202701" ? t.prereqsMetNoRules : t.prereqsMetNeedTaken}</p>}
      <button type="button" aria-pressed={sortByGpa} onClick={() => setSortByGpa((value) => !value)} className={`mt-2 rounded-lg border px-2.5 py-1.5 font-medium ${sortByGpa ? "border-[#273c38] bg-[#273c38] text-white" : "border-[#d9d6ce] bg-white text-[#273c38]"}`}>{sortByGpa ? t.sortDefault : t.sortGpa}</button>
      {sortByGpa && <p className="mt-2 text-[11px] leading-5 text-[#646c68]">{gpaLoading ? t.gpaLoading : gpaError ? t.gpaError : t.gpaNote}</p>}
    </div>
    <p className="mt-2 text-[11px] leading-5 text-[#646c68]">{referenceStale && !referenceForTerm ? <span className="font-medium text-[#745424]">{t.staleReference}</span> : referenceForTerm ? <>{t.against} <span className="font-medium text-[#48534f]">{referenceForTerm.sectionIds.join(" · ")}</span></> : t.noReference} {t.fcNote}</p>

    {loading && <p className="py-5 text-sm text-[#646c68]">{t.loading}</p>}
    {!codes.length && <p className="py-5 text-sm text-[#646c68]">{t.choose}</p>}
    {neededKeys.some((key) => failed[key]) && !current && <p role="alert" className="py-5 text-sm text-[#8c352c]">{t.error}</p>}
    {current && <>
      <p className="mt-4 text-[11px] text-[#646c68]">{t.count(shown.length, current.courses.length)}{current.seatCheckedAt ? ` · ${formatSeatReadTime(current.seatCheckedAt, language)}` : ""}</p>
      {!shown.length && <p className="py-5 text-sm text-[#646c68]">{t.empty}</p>}
      <div className="mt-1 divide-y divide-[#ece9e2]">{shown.map(({ course, matched, fitting, online, tba, taken }) => { const others = listings.get(course.course_id)?.others ?? []; const inPlan = planCourseIds.includes(course.course_id); const courseId = course.course_id; const onAdd = () => onAddCourse({ course_id: course.course_id, name: course.name }); return <div key={course.course_id} className="flex items-start gap-2 pr-1"><button type="button" onClick={() => onOpenCourse({ course_id: course.course_id, name: course.name })} className="flex min-w-0 flex-1 flex-col items-start gap-2 py-3.5 text-left hover:bg-[#f6f4ef]">
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{course.course_id}<span className="mt-1 block font-normal leading-5 text-[#606966]">{course.name}</span></span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[#646c68]">
            {course.credits && <span>{course.credits} {t.credits}</span>}
            {typeof gpa[course.course_id] === "number" && <span className="font-medium text-[#536d64]">{t.avgGpa} {gpa[course.course_id]!.toFixed(2)}</span>}
            {requirements.length > 1 && matched > 1 && <span className="rounded bg-[#a34a39] px-1.5 py-0.5 font-semibold text-white">{t.counts(matched)}</span>}
            {groupsOf(course).map((group) => <span key={group.join("|")} title={group.length > 1 ? t.orTitle : undefined} className={`rounded px-1.5 py-0.5 font-semibold ${group.some((tag) => codes.includes(tag)) ? "bg-[#273c38] text-white" : "bg-[#eeece6] text-[#59635f]"}`}>{group.join(t.or)}</span>)}
            {taken && <span className="rounded bg-[#fff8e8] px-1.5 py-0.5 font-semibold text-[#745424]">{taken === course.course_id ? t.taken : t.takenAs(taken)}</span>}
            
          </span>
          {others.length > 0 && <span className="mt-1 block text-[11px] text-[#646c68]">{t.alsoListed(others.join(", "))}</span>}
        </span>
        <span className="text-xs">
          <span className={`block font-semibold ${fitting ? "text-[#367047]" : "text-[#8f4538]"}`}>{fitting ? t.fitting(fitting) : t.none}</span>{online > 0 && <span className="block text-[11px] text-[#536d64]">{t.online(online)}</span>}{tba > 0 && <span className="block text-[11px] text-[#646c68]">{t.tba(tba)}</span>}
          <span className="mt-1 block text-[#a34a39]">{t.view}</span>
        </span>
      </button><span className="pt-3.5"><button type="button" onClick={() => onAdd()} disabled={inPlan} aria-label={inPlan ? t.inPlanShort : `${t.quickAdd} ${courseId}`} title={inPlan ? t.inPlanShort : t.quickAdd} className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${inPlan ? "border-[#cddbd1] bg-[#edf3ef] text-[#315c43]" : "border-[#536d64] text-[#273c38] hover:bg-[#edf3ef]"}`}>{inPlan ? `✓ ${t.inPlanShort}` : `+ ${t.quickAdd}`}</button></span></div>; })}</div>
    </>}
  </div>;
}
