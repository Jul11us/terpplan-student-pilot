"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { parseCourseIds, parseDegreeAudit } from "@/lib/degree-audit";
import { extractDegreeAuditText } from "@/lib/degree-audit-pdf";
import { AUDIT_HANDOFF_KEY, defaultBlocks, evaluateProgram, MINOR_MAJOR_OVERLAP_COURSES, unmetPrerequisites, type CourseFact, type CourseStatus, type ItemProgress, type Program } from "@/lib/programs";
import { readSavedState, writeSavedState } from "@/lib/saved-state";

type Language = "en" | "zh";
type ProgramList = { builtAt: string; minors: Array<{ slug: string; name: string }>; majors: Array<{ slug: string; name: string }> };
type ProgramData = { program: Program; courses: Record<string, CourseFact> };
type Mode = "minor" | "major";
type AuditCourses = { completed: string[]; inProgress: string[] };

// Program responses are cached by the browser for an hour; bump this when their shape changes.
const DATA_VERSION = 4;
// Choices on this page are remembered per browser.
const PREFS_KEY = "terpplan:minor";

const copy = {
  en: {
    home: "Back to planner", pilot: "UMD · Student pilot", title: "A minor or a double major: can you fit it in?",
    intro: "Pick a minor or a second major to see which of your courses already count, what is left, how much it overlaps with your current major, and roughly how much extra work it adds. Requirements come from the UMD undergraduate catalog.",
    yourCourses: "Your courses", fromAudit: (done: number, ip: number) => `From your degree audit: ${done} completed, ${ip} in progress.`, clearAudit: "Clear",
    upload: "Load from degree audit PDF", reading: "Reading PDF in your browser…", badPdf: "This PDF could not be read. Export a text-based audit PDF from uAchieve and try again.",
    manual: "Other courses you have finished (AP, transfer, or anything the audit missed)", manualHint: "e.g. MATH140, CMSC131",
    includePlan: (n: number) => `Count the ${n} course${n === 1 ? "" : "s"} in my TerpPlan plan as planned`,
    privacy: "Your audit PDF is read in this browser. Nothing about your courses is sent to TerpPlan's server; only public course codes are used to look up historical GPAs.",
    programs: "What are you considering?", modeMinor: "Minor", modeMajor: "Second major (double major)",
    search: "Search minors", searchMajor: "Search majors", minor: "Minor", chooseMinor: "Choose a minor…", second: "Second major", chooseSecond: "Choose a second major…",
    major: "Your major (optional, to check overlap)", currentMajor: "Your current major (to check overlap)", noMajor: "Not chosen", semesters: "Semesters left before graduation (fall/spring)",
    sameMajor: "Choose a second major that is different from your current major.",
    parts: "Which parts apply to you", partsHint: "From the catalog's headings. Core parts are on; switch on your track, specialization, or degree option.", core: "Core requirements",
    loading: "Loading requirements…", loadError: "Requirements could not be loaded. Try again.",
    stillNeed: "Still needed", credits: "credits", courses: (n: number) => `about ${n} course${n === 1 ? "" : "s"}`,
    unlisted: (n: number) => `includes ${n} credits the catalog describes only in text`,
    counted: "Already counts", countedDetail: (d: number, ip: number, p: number) => `${d} done · ${ip} in progress · ${p} planned`,
    prereqs: "Prerequisites outside this program", prereqsNone: "None found", prereqsDetail: (n: number, c: number) => `${n} course${n === 1 ? "" : "s"} · ${c} credits`,
    chain: "Shortest path", chainValue: (n: number) => n === 0 ? "Done" : `${n} semester${n === 1 ? "" : "s"}`, chainDetail: "Prerequisite chain, one course per step",
    load: "Workload estimate", level: { light: "Manageable", moderate: "Noticeable", heavy: "Heavy" },
    perSemester: (n: number, s: number) => `About ${n} extra credits per semester over ${s} semester${s === 1 ? "" : "s"}, if these courses do not replace free electives.`,
    perSemesterRange: (low: number, high: number, s: number) => `About ${low}–${high} extra credits per semester over ${s} semester${s === 1 ? "" : "s"}: the lower number if every course your current major also lists counts for both.`,
    reasons: {
      chain: (need: number, have: number) => `The prerequisite chain needs at least ${need} semesters, but you have ${have}. Summer or winter terms may help.`,
      perHeavy: "More than 6 extra credits a semester is a heavy load on top of a full schedule.",
      perModerate: "3–6 extra credits a semester: usually one more course each term.",
      prereqs: (codes: string) => `Some courses need prerequisites that do not count toward this program: ${codes}.`,
      apply: "This program is selective, a Limited Enrollment Program, or needs an application.",
      gpa: (value: string) => `Remaining courses averaged ${value} GPA historically (PlanetTerp), lower than typical.`,
      none: "Nothing stands out: the remaining work looks moderate.",
    },
    gpaNote: "Historical GPAs are PlanetTerp averages across past terms and instructors, not a prediction of your grade.",
    overlap: "Overlap with your major", overlapPick: "Choose your major above to see which courses could count for both.",
    overlapNone: "None of the courses counted for this minor appear in your major's requirement lists.",
    overlapList: (codes: string) => `Counted for the minor and listed by your major: ${codes}.`,
    overlapRule: `UMD allows at most ${MINOR_MAJOR_OVERLAP_COURSES} courses (6 credits) to count for both a major and a minor.`,
    overlapExcess: (n: number) => `That is ${n} more than allowed, so the estimate adds ${n} replacement course${n === 1 ? "" : "s"}.`,
    overlapListMajor: (codes: string) => `Counted for the second major and listed by your current major: ${codes}.`,
    sharedRemaining: (n: number) => `About ${n} of the remaining credits are courses your current major also lists, so they may count for both.`,
    overlapRuleMajor: "For a double major, UMD lets a course count toward both majors as appropriate; departments can set their own limits, so confirm with both.",
    dualTitle: "Two bachelor's degrees instead?", dualText: (n: number) => `A dual degree needs at least 150 credits in total and at least 18 credits not used for the other degree. This plan has about ${n} credits your current major does not list.`,
    dualOk: "That meets the 18-credit part.", dualShort: "That is short of 18, so you would need more courses that only count for this degree.",
    overlapNote: "A course is marked when your major's catalog page lists it anywhere, including electives, so this shows possible overlap.",
    applyTitle: "Selective or needs an application", applyLink: "See the application requirements",
    gatewayNote: "Selective programs usually set gateway courses with a minimum grade (often B- or higher) and a minimum GPA. This page only checks whether a course is finished, not the grade, so confirm the gateway rules on the program's page.",
    partialTitle: "Some rules are written only in text",
    partial: "The catalog describes part of this program in prose (for example “any 300-level course in…”). Those parts are listed below as items to check yourself or counted as credits described only in text, so treat the totals as approximate.",
    noTable: "The catalog does not list this program's courses in a table. Read its requirements on the catalog page.",
    requirements: "Requirements", section: "", done: "Done", inProgress: "In progress", planned: "Planned", notStarted: "Not started", openItem: "Check yourself",
    progress: (met: number, needed: number) => `${met} of ${needed}`,
    creditsItem: (n: number) => `${n} cr`, readyNow: "Prerequisites met", needs: "Needs", orHigher: " or higher", sameTerm: " (can be same term)", pickOf: (k: number) => `${k} of`, inMajor: "In your major", showAll: (n: number) => `Show all ${n} options`, showFewer: "Show fewer",
    markDone: "I have finished this", options: "Options, easiest first",
    add: "Add to plan", added: "In plan", full: "Plan full", testudo: "Testudo",
    hidden: "Take these first (they do not count toward this program)",
    rules: "UMD minor rules", ruleList: ["15–24 credits, with at least 9 at the 300 level or above.", `At most ${MINOR_MAJOR_OVERLAP_COURSES} courses (6 credits) may count for both the minor and your major.`, "A course cannot count toward two minors.", "Every minor course needs a C- or better; some minors ask for more."],
    rulesMajor: "UMD double major rules", ruleListMajor: ["Complete every requirement of both majors, plus college and General Education requirements.", "Get written permission in advance from both departments and colleges.", "File the plan for both majors no later than one full academic year before graduation.", "Add a Limited Enrollment Program as a second major as early as possible."],
    disclaimer: "This is an estimate from the catalog. Confirm your plan with the program's advisor before you rely on it.", catalog: "Read this program in the catalog", snapshot: (date: string) => `Catalog snapshot ${date}`,
  },
  zh: {
    home: "返回排课", pilot: "马里兰大学 · 学生试用", title: "辅修或双专业，修得下来吗？",
    intro: "选一个辅修或第二专业，看看你已经修的课哪些能算进去、还差多少、和现在的主修重叠多少，以及大概会多出多少学业压力。要求来自 UMD 本科 catalog。",
    yourCourses: "你的课程", fromAudit: (done: number, ip: number) => `已从学位审计读取：已修 ${done} 门，在修 ${ip} 门。`, clearAudit: "清除",
    upload: "从 degree audit PDF 读取", reading: "正在浏览器中读取 PDF…", badPdf: "无法读取这个 PDF。请从 uAchieve 导出含文字的审计 PDF 后重试。",
    manual: "其他已修完的课（AP、转学分，或审计里漏掉的）", manualHint: "例如 MATH140, CMSC131",
    includePlan: (n: number) => `把 TerpPlan 排课里的 ${n} 门课算作“计划要修”`,
    privacy: "审计 PDF 只在你的浏览器里读取，你的课程信息不会发送到 TerpPlan 服务器；只会用公开的课程编号查询历史 GPA。",
    programs: "你在考虑什么？", modeMinor: "辅修", modeMajor: "第二专业（双专业）",
    search: "搜索辅修", searchMajor: "搜索专业", minor: "辅修", chooseMinor: "选择一个辅修…", second: "第二专业", chooseSecond: "选择第二专业…",
    major: "你的主修（可选，用来算重叠）", currentMajor: "你现在的主修（用来算重叠）", noMajor: "未选择", semesters: "毕业前还剩几个学期（秋/春）",
    sameMajor: "第二专业要和现在的主修不同。",
    parts: "哪些部分适用于你", partsHint: "来自 catalog 里的小标题。核心部分默认勾选；请勾选你的方向（track / specialization）或学位类型。", core: "核心要求",
    loading: "正在读取要求…", loadError: "暂时无法读取要求，请重试。",
    stillNeed: "还需要", credits: "学分", courses: (n: number) => `约 ${n} 门课`,
    unlisted: (n: number) => `其中 ${n} 学分是 catalog 只用文字描述的要求`,
    counted: "已经能算", countedDetail: (d: number, ip: number, p: number) => `已修 ${d} · 在修 ${ip} · 计划 ${p}`,
    prereqs: "该项目以外的先修课", prereqsNone: "没有发现", prereqsDetail: (n: number, c: number) => `${n} 门 · ${c} 学分`,
    chain: "最短路径", chainValue: (n: number) => n === 0 ? "已完成" : `${n} 个学期`, chainDetail: "按先修链，每学期往前推一步",
    load: "学业压力评估", level: { light: "可以承受", moderate: "有一定压力", heavy: "压力较大" },
    perSemester: (n: number, s: number) => `分摊到剩下 ${s} 个学期，每学期约多 ${n} 学分（假设这些课不能替代你的自由选修）。`,
    perSemesterRange: (low: number, high: number, s: number) => `分摊到剩下 ${s} 个学期，每学期约多 ${low}–${high} 学分：如果主修也列出的课都能两边共用，就是较小的那个数。`,
    reasons: {
      chain: (need: number, have: number) => `先修链至少需要 ${need} 个学期，但你只剩 ${have} 个。可以考虑暑期或冬季学期。`,
      perHeavy: "每学期多出 6 学分以上，在满课基础上负担很重。",
      perModerate: "每学期多 3–6 学分，通常相当于每学期多一门课。",
      prereqs: (codes: string) => `有些课需要先修不算进这个项目的课：${codes}。`,
      apply: "这个项目有门槛：需要申请、是 Limited Enrollment Program，或有入学要求。",
      gpa: (value: string) => `剩下课程的历史平均 GPA 为 ${value}（PlanetTerp），给分偏紧。`,
      none: "没有明显的风险点，剩下的工作量适中。",
    },
    gpaNote: "历史 GPA 是 PlanetTerp 过去所有学期和老师的平均，不代表你会拿到的成绩。",
    overlap: "和主修的重叠", overlapPick: "在上面选择你的主修，就能看到哪些课可以同时算两边。",
    overlapNone: "算进辅修的课都不在你主修的课程列表里。",
    overlapList: (codes: string) => `既算进辅修、又出现在主修列表里的课：${codes}。`,
    overlapRule: `UMD 规定主修和辅修最多只能共用 ${MINOR_MAJOR_OVERLAP_COURSES} 门课（6 学分）。`,
    overlapExcess: (n: number) => `超出了 ${n} 门，所以估算里加上了 ${n} 门替代课。`,
    overlapListMajor: (codes: string) => `既算进第二专业、又出现在现在主修列表里的课：${codes}。`,
    sharedRemaining: (n: number) => `剩下的学分里约有 ${n} 学分是现在的主修也列出的课，可能两边都能算。`,
    overlapRuleMajor: "双专业时，UMD 允许课程“酌情”同时算进两个专业；各院系可以自行设限，请和两边都确认。",
    dualTitle: "想拿两个学士学位？", dualText: (n: number) => `双学位要求总共至少 150 学分，并且至少 18 学分不能用于另一个学位。这个方案里约有 ${n} 学分是你现在的主修没有列出的。`,
    dualOk: "满足 18 学分这一条。", dualShort: "不到 18 学分，还需要多修只算这个学位的课。",
    overlapNote: "只要主修的 catalog 页面列出了这门课（包括选修列表），就会标出来，所以这里显示的是“可能重叠”。",
    applyTitle: "需要申请或有门槛", applyLink: "查看申请要求",
    gatewayNote: "有门槛的项目通常规定 gateway 课程的最低成绩（常见是 B- 或更高）和最低 GPA。这里只检查课程是否修完，不检查成绩，请到项目页面核对 gateway 要求。",
    partialTitle: "有些要求只写在文字里",
    partial: "catalog 里这个项目的部分要求是文字描述（例如“任选一门 300 级的某系课程”）。这些部分在下面列为需要你自己核对的项目，或按“只用文字描述的学分”计入，所以总数只是近似值。",
    noTable: "catalog 没有用表格列出这个项目的课程，请到 catalog 页面阅读要求。",
    requirements: "要求明细", section: "", done: "已完成", inProgress: "在修", planned: "计划中", notStarted: "未开始", openItem: "需自行核对",
    progress: (met: number, needed: number) => `${met} / ${needed}`,
    creditsItem: (n: number) => `${n} 学分`, readyNow: "先修已满足", needs: "需要先修", orHigher: " 或更高", sameTerm: "（可同学期修）", pickOf: (k: number) => `任选 ${k} 门：`, inMajor: "主修也列了", showAll: (n: number) => `显示全部 ${n} 个选项`, showFewer: "收起",
    markDone: "这一项我已经完成", options: "可选课程（按难易排序）",
    add: "加入排课", added: "已在排课中", full: "排课已满", testudo: "Testudo",
    hidden: "需要先修的课（不算进这个项目）",
    rules: "UMD 辅修规则", ruleList: ["共 15–24 学分，其中至少 9 学分是 300 级以上。", `和主修最多共用 ${MINOR_MAJOR_OVERLAP_COURSES} 门课（6 学分）。`, "一门课不能同时算进两个辅修。", "每门辅修课至少 C-，有些辅修要求更高。"],
    rulesMajor: "UMD 双专业规则", ruleListMajor: ["修完两个专业的全部要求，以及学院和 Gen Ed 要求。", "提前拿到两个院系（和学院）的书面同意。", "最晚在毕业前整整一学年，提交两个专业的修课计划。", "如果第二专业是 Limited Enrollment Program，要尽早申请。"],
    disclaimer: "这是根据 catalog 做的估算。正式决定前，请和该项目的 advisor 确认。", catalog: "在 catalog 查看这个项目", snapshot: (date: string) => `catalog 数据日期 ${date}`,
  },
} as const;

type Prefs = { mode?: Mode; minor?: string; second?: string; major?: string; semesters?: number; manual?: string };

function readPrefs(): Prefs {
  try { return JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}") as Prefs; } catch { return {}; }
}
function writePrefs(prefs: Prefs) {
  try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ }
}
function readAuditHandoff(): AuditCourses | null {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(AUDIT_HANDOFF_KEY) ?? "null") as AuditCourses | null;
    return parsed && Array.isArray(parsed.completed) && Array.isArray(parsed.inProgress) ? parsed : null;
  } catch { return null; }
}
function writeAuditHandoff(value: AuditCourses | null) {
  try {
    if (value) window.sessionStorage.setItem(AUDIT_HANDOFF_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(AUDIT_HANDOFF_KEY);
  } catch { /* storage unavailable */ }
}

const statusStyle: Record<CourseStatus | "none" | "open", string> = {
  done: "bg-[#eaf4ec] text-[#367047]", inProgress: "bg-[#eef2f7] text-[#455d78]", planned: "bg-[#fff8e8] text-[#745424]", none: "bg-[#f2f0eb] text-[#6d746f]", open: "bg-[#fff0ec] text-[#8c352c]",
};

export default function ProgramExplorerPage() {
  const [language, setLanguage] = useState<Language>("en");
  const t = copy[language];
  const [list, setList] = useState<ProgramList | null>(null);
  const [listError, setListError] = useState(false);
  const [mode, setMode] = useState<Mode>("minor");
  const [minorSlug, setMinorSlug] = useState("");
  const [secondSlug, setSecondSlug] = useState("");
  // Catalog tables the student switched on or off, per program.
  const [blockChoice, setBlockChoice] = useState<Record<string, number[]>>({});
  const [majorSlug, setMajorSlug] = useState("");
  const [semesters, setSemesters] = useState(4);
  const [manualText, setManualText] = useState("");
  const [query, setQuery] = useState("");
  const [audit, setAudit] = useState<AuditCourses | null>(null);
  const [reading, setReading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [includePlan, setIncludePlan] = useState(true);
  const [plan, setPlan] = useState<{ term: string; ids: string[]; all: string[] }>({ term: "202701", ids: [], all: [] });
  const [programData, setProgramData] = useState<ProgramData | null>(null);
  const [programError, setProgramError] = useState("");
  const [majorCodes, setMajorCodes] = useState<{ slug: string; codes: Set<string> } | null>(null);
  const [manualDone, setManualDone] = useState<Record<string, number[]>>({});
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [gpa, setGpa] = useState<Record<string, number | null>>({});

  useEffect(() => {
    const restore = window.setTimeout(() => {
      const saved = readSavedState();
      if (saved.language) setLanguage(saved.language);
      const term = saved.term ?? "202701";
      setPlan({ term, ids: (saved.plans[term] ?? []).map((course) => course.courseId), all: [...new Set(Object.values(saved.plans).flat().map((course) => course.courseId))] });
      const prefs = readPrefs();
      // ?mode=major opens the double-major view directly.
      const urlMode = new URLSearchParams(window.location.search).get("mode");
      if (urlMode === "major" || urlMode === "minor") setMode(urlMode);
      else if (prefs.mode === "major") setMode("major");
      if (prefs.minor) setMinorSlug(prefs.minor);
      if (prefs.second) setSecondSlug(prefs.second);
      if (prefs.major) setMajorSlug(prefs.major);
      if (prefs.semesters && prefs.semesters >= 1 && prefs.semesters <= 8) setSemesters(prefs.semesters);
      if (prefs.manual) setManualText(prefs.manual);
      setAudit(readAuditHandoff());
    }, 0);
    fetch(`/api/programs?v=${DATA_VERSION}`).then(async (response) => {
      if (!response.ok) throw new Error("programs");
      setList(await response.json() as ProgramList);
    }).catch(() => setListError(true));
    return () => window.clearTimeout(restore);
  }, []);

  const targetSlug = mode === "minor" ? minorSlug : secondSlug;
  useEffect(() => {
    if (!targetSlug) return;
    let cancelled = false;
    fetch(`/api/programs?slug=${encodeURIComponent(targetSlug)}&v=${DATA_VERSION}`).then(async (response) => {
      if (!response.ok) throw new Error("program");
      const payload = await response.json() as ProgramData;
      if (!cancelled) { setProgramData(payload); setProgramError(""); }
    }).catch(() => { if (!cancelled) setProgramError(copy.en.loadError); });
    return () => { cancelled = true; };
  }, [targetSlug]);

  useEffect(() => {
    if (!majorSlug) return;
    let cancelled = false;
    fetch(`/api/programs?slug=${encodeURIComponent(majorSlug)}&codes=1&v=${DATA_VERSION}`).then(async (response) => {
      if (!response.ok) throw new Error("major");
      const payload = await response.json() as { codes: string[] };
      if (!cancelled) setMajorCodes({ slug: majorSlug, codes: new Set(payload.codes) });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [majorSlug]);

  function savePrefs(patch: Prefs) {
    writePrefs({ mode, minor: minorSlug, second: secondSlug, major: majorSlug, semesters, manual: manualText, ...patch });
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    setReading(true); setAuditError("");
    try {
      const text = await extractDegreeAuditText(file);
      if (!text.trim()) throw new Error("text");
      const parsed = parseDegreeAudit(text);
      const next = { completed: parsed.completedCourseIds, inProgress: parsed.inProgressCourseIds };
      setAudit(next);
      writeAuditHandoff(next);
    } catch { setAuditError(t.badPdf); }
    finally { setReading(false); }
  }

  const student = useMemo(() => {
    const map = new Map<string, CourseStatus>();
    if (includePlan) plan.all.forEach((code) => map.set(code, "planned"));
    audit?.inProgress.forEach((code) => map.set(code, "inProgress"));
    audit?.completed.forEach((code) => map.set(code, "done"));
    parseCourseIds(manualText).forEach((code) => map.set(code, "done"));
    return map;
  }, [audit, manualText, includePlan, plan.all]);

  const current = programData && targetSlug && programData.program.slug === targetSlug ? programData : null;
  const sameMajor = mode === "major" && Boolean(secondSlug) && secondSlug === majorSlug;
  const currentMajor = majorSlug && !sameMajor && majorCodes?.slug === majorSlug ? majorCodes.codes : null;
  const doneItems = useMemo(() => new Set(manualDone[targetSlug] ?? []), [manualDone, targetSlug]);
  const selectedBlocks = useMemo(() => current ? (blockChoice[current.program.slug] ? new Set(blockChoice[current.program.slug]) : defaultBlocks(current.program)) : new Set<number>(), [current, blockChoice]);
  const progress = useMemo(() => current ? evaluateProgram(current.program, current.courses, student, {
    majorCodes: currentMajor ?? new Set(), manualDone: doneItems, blocks: selectedBlocks,
    // Minors share at most two courses with the major; a second major has no fixed limit.
    overlapCap: mode === "minor" ? MINOR_MAJOR_OVERLAP_COURSES : null,
  }) : null, [current, student, currentMajor, doneItems, selectedBlocks, mode]);

  // Historical GPAs for the courses the estimate expects the student to take.
  const gpaIds = useMemo(() => progress ? [...new Set(progress.items.flatMap((result) => result.suggestions.slice(0, Math.max(4, result.needed * 2)).flat()))].filter((code) => !(code in gpa)).slice(0, 30) : [], [progress, gpa]);
  useEffect(() => {
    if (!gpaIds.length) return;
    let cancelled = false;
    fetch("/api/audit/grades", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseIds: gpaIds }) })
      .then(async (response) => response.ok ? (await response.json() as { averages?: Record<string, number | null> }).averages ?? {} : {})
      .catch(() => ({} as Record<string, number | null>))
      .then((averages) => { if (!cancelled) setGpa((known) => ({ ...known, ...Object.fromEntries(gpaIds.map((id) => [id, averages[id] ?? null])) })); });
    return () => { cancelled = true; };
  }, [gpaIds]);

  const workload = useMemo(() => {
    if (!progress || !current) return null;
    // Prerequisites the major already lists are likely taken anyway, so they do not add work here.
    const extraPrereqs = progress.hiddenPrerequisites.filter((code) => !currentMajor?.has(code));
    const extraCredits = progress.remainingCredits + extraPrereqs.reduce((sum, code) => sum + (current.courses[code]?.c ?? 3), 0);
    const perSemester = Math.round(extraCredits / semesters * 10) / 10;
    // For a second major, courses the current major also lists may count for both.
    const lowPerSemester = mode === "major" && progress.sharedRemainingCredits ? Math.round((extraCredits - progress.sharedRemainingCredits) / semesters * 10) / 10 : perSemester;
    const plannedCodes = progress.items.flatMap((result) => result.complete || result.open ? [] : result.suggestions.slice(0, result.item.kind === "course" ? 1 : result.needed - result.met.length).flat());
    const known = plannedCodes.map((code) => gpa[code]).filter((value): value is number => typeof value === "number");
    const averageGpa = known.length >= 2 ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
    const reasons: string[] = [];
    let level: 0 | 1 | 2 = 0;
    if (progress.minSemesters > semesters) { reasons.push(t.reasons.chain(progress.minSemesters, semesters)); level = 2; }
    if (lowPerSemester > 6) { reasons.push(t.reasons.perHeavy); level = 2; }
    else if (lowPerSemester > 3) { reasons.push(t.reasons.perModerate); level = Math.max(level, 1) as 0 | 1 | 2; }
    if (extraPrereqs.length) { reasons.push(t.reasons.prereqs(extraPrereqs.join(", "))); level = Math.max(level, 1) as 0 | 1 | 2; }
    if (current.program.apply) { reasons.push(t.reasons.apply); level = Math.max(level, 1) as 0 | 1 | 2; }
    if (averageGpa !== null && averageGpa < 2.8) { reasons.push(t.reasons.gpa(averageGpa.toFixed(2))); level = Math.max(level, 1) as 0 | 1 | 2; }
    if (!reasons.length) reasons.push(t.reasons.none);
    return { extraCredits, perSemester, lowPerSemester, reasons, level: (["light", "moderate", "heavy"] as const)[level] };
  }, [progress, current, currentMajor, semesters, gpa, t, mode]);

  function addToPlan(code: string) {
    const saved = readSavedState();
    const term = saved.term ?? plan.term;
    const existing = saved.plans[term] ?? [];
    if (existing.some((course) => course.courseId === code) || existing.length >= 10) return;
    const next = [...existing, { courseId: code, courseTitle: current?.courses[code]?.n ?? code }];
    writeSavedState({ plans: { ...saved.plans, [term]: next } });
    setPlan((value) => ({ ...value, ids: next.map((course) => course.courseId), all: [...new Set([...value.all, code])] }));
  }

  const choices = (mode === "minor" ? list?.minors : list?.majors) ?? [];
  const filteredChoices = choices.filter((item) => !query.trim() || item.name.toLowerCase().includes(query.trim().toLowerCase()) || item.slug === targetSlug);
  const chooseTarget = (slug: string) => {
    if (mode === "minor") { setMinorSlug(slug); savePrefs({ minor: slug }); }
    else { setSecondSlug(slug); savePrefs({ second: slug }); }
  };
  const toggleBlock = (index: number) => {
    if (!current) return;
    const next = new Set(selectedBlocks);
    if (next.has(index)) next.delete(index); else next.add(index);
    setBlockChoice((value) => ({ ...value, [current.program.slug]: [...next] }));
  };
  const facts = current?.courses ?? {};
  const unmetPrereqs = (code: string) => unmetPrerequisites(facts[code], student, { orHigher: t.orHigher, sameTerm: t.sameTerm, of: t.pickOf });

  const courseRow = (code: string, statusLabel?: string) => {
    const fact = facts[code];
    const missing = unmetPrereqs(code);
    const average = gpa[code];
    return <li key={code} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#ebe8e1] bg-white px-3 py-2 text-xs">
      <div className="min-w-0">
        <p><span className="font-semibold text-[#202728]">{code}</span> <span className="text-[#606966]">{fact?.n ?? ""}</span></p>
        <p className="mt-0.5 text-[11px] text-[#7c8580]">
          {fact ? t.creditsItem(fact.c) : ""}
          {typeof average === "number" ? ` · GPA ${average.toFixed(2)}` : ""}
          {currentMajor?.has(code) ? <span className="ml-1.5 rounded bg-[#eef2f7] px-1.5 py-0.5 text-[10px] font-medium text-[#455d78]">{t.inMajor}</span> : null}
          {statusLabel ? null : missing.length ? <span className="ml-1.5 text-[#8c453b]">· {t.needs}: {missing.join(", ")}</span> : <span className="ml-1.5 text-[#367047]">· {t.readyNow}</span>}
        </p>
      </div>
      {statusLabel ? <span className="text-[11px] font-medium text-[#536d64]">{statusLabel}</span> : <div className="flex items-center gap-2">
        <button type="button" onClick={() => addToPlan(code)} disabled={plan.ids.includes(code) || plan.ids.length >= 10} className="rounded-md border border-[#536d64] px-2 py-1 text-[11px] font-semibold text-[#273c38] disabled:opacity-50">{plan.ids.includes(code) ? t.added : plan.ids.length >= 10 ? t.full : t.add}</button>
        <a href={`https://app.testudo.umd.edu/soc/search?courseId=${code}&termId=${plan.term}`} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-[#a34a39] hover:underline">{t.testudo} ↗</a>
      </div>}
    </li>;
  };

  const itemCard = (result: ItemProgress, position: number) => {
    const { item, index } = result;
    const metCount = result.met.length;
    const badge = result.open ? (result.complete ? ["done", t.done] : ["open", t.openItem])
      : result.complete ? [result.met.some((entry) => entry.status === "planned") ? "planned" : result.met.some((entry) => entry.status === "inProgress") ? "inProgress" : "done", result.met.some((entry) => entry.status === "planned") ? t.planned : result.met.some((entry) => entry.status === "inProgress") ? t.inProgress : t.done]
      : ["none", item.kind === "choose" ? t.progress(metCount, result.needed) : t.notStarted];
    const title = item.kind === "course" ? item.options.map((option) => option.join(" + ")).join(language === "en" ? " or " : " 或 ") : item.label;
    const showAll = expanded.has(index);
    const statusText = (status: CourseStatus) => status === "done" ? t.done : status === "inProgress" ? t.inProgress : t.planned;
    // The section name is shown only where it changes, not on every card.
    const showSection = item.section && item.section !== progress?.items[position - 1]?.item.section;
    return <article key={index} className="rounded-xl border border-[#e3e0d8] bg-[#fbfaf8] p-4">
      {showSection && <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#9a5040]">{item.section}</p>}
      <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-5">{title}{item.credits ? <span className="ml-2 text-xs font-normal text-[#7c8580]">{t.creditsItem(item.credits)}</span> : null}</p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusStyle[badge[0] as keyof typeof statusStyle]}`}>{badge[1]}</span>
      </div>
      {result.met.length > 0 && <ul className="mt-2 space-y-1.5">{result.met.map((entry) => entry.option.map((code) => courseRow(code, statusText(entry.status))))}</ul>}
      {result.open && <label className="mt-2 flex items-center gap-2 text-xs text-[#59635f]"><input type="checkbox" checked={result.complete} onChange={(event) => {
        const nextDone = new Set(doneItems);
        if (event.target.checked) nextDone.add(index); else nextDone.delete(index);
        setManualDone((value) => ({ ...value, [targetSlug]: [...nextDone] }));
      }} />{t.markDone}</label>}
      {!result.complete && !result.open && result.suggestions.length > 0 && <>
        {item.kind === "choose" && <p className="mt-3 text-[11px] font-medium text-[#68716e]">{t.options}</p>}
        <ul className="mt-1.5 space-y-1.5">{(showAll ? result.suggestions : result.suggestions.slice(0, 5)).flatMap((option) => option.map((code) => courseRow(code)))}</ul>
        {result.suggestions.length > 5 && <button type="button" onClick={() => setExpanded((value) => { const next = new Set(value); if (next.has(index)) next.delete(index); else next.add(index); return next; })} className="mt-2 text-xs font-medium text-[#536d64] underline underline-offset-2">{showAll ? t.showFewer : t.showAll(result.suggestions.length)}</button>}
      </>}
    </article>;
  };

  const stat = (label: string, value: string, detail: string) => <div className="rounded-xl border border-[#e3e0d8] bg-white p-4"><p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#7c8580]">{label}</p><p className="mt-1 font-serif text-2xl text-[#202728]">{value}</p><p className="mt-1 text-xs text-[#68716e]">{detail}</p></div>;

  return <main className="min-h-screen bg-[#f5f3ef] text-[#202728]">
    <header className="border-b border-[#dedbd3] bg-[#fbfaf8]"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4 sm:px-8"><Link href="/" className="flex items-center gap-3 font-semibold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#bd302f] font-serif text-lg text-white">T</span>TerpPlan</Link><div className="flex items-center gap-3"><Link href="/" className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9d6ce] bg-white px-3 py-1.5 text-xs font-semibold text-[#273c38] shadow-sm hover:border-[#536d64] hover:bg-[#edf3ef]"><span aria-hidden="true">←</span>{t.home}</Link><button onClick={() => { const next = language === "en" ? "zh" : "en"; setLanguage(next); writeSavedState({ language: next }); }} className="rounded-lg border border-[#dcd9d0] px-3 py-2 text-xs">{language === "en" ? "中文" : "English"}</button></div></div></header>
    <div className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8">
      <p className="text-[11px] font-semibold uppercase tracking-[.17em] text-[#a34a39]">{t.pilot}</p>
      <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-tight sm:text-5xl">{t.title}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-[#626c67]">{t.intro}</p>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5 sm:p-6">
          <h2 className="font-serif text-2xl">01 · {t.yourCourses}</h2>
          {audit ? <p className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-[#edf3ef] px-4 py-3 text-sm text-[#315c43]">{t.fromAudit(audit.completed.length, audit.inProgress.length)}<button type="button" onClick={() => { setAudit(null); writeAuditHandoff(null); }} className="text-xs font-medium text-[#8c453b] hover:underline">{t.clearAudit}</button></p>
            : <label className={`mt-4 flex w-full items-center gap-3 rounded-xl border border-[#d9d6ce] bg-white p-3 text-sm ${reading ? "opacity-60" : "cursor-pointer hover:border-[#a34a39]"} focus-within:ring-2 focus-within:ring-[#a34a39]/30`}>
              <input type="file" accept="application/pdf,.pdf" aria-label={t.upload} disabled={reading} onChange={(event) => { void readFile(event.target.files?.[0]); event.target.value = ""; }} className="sr-only" />
              <span className="shrink-0 rounded-lg bg-[#273c38] px-3 py-2 font-semibold text-white">📋 {t.upload}</span>
              {reading && <span className="text-xs text-[#68716e]">{t.reading}</span>}
            </label>}
          {auditError && <p role="alert" className="mt-3 rounded-xl bg-[#fff0ec] px-4 py-3 text-sm text-[#8c352c]">{auditError}</p>}
          <label className="mt-4 block text-xs font-medium text-[#68716e]">{t.manual}
            <textarea value={manualText} onChange={(event) => { setManualText(event.target.value); savePrefs({ manual: event.target.value }); }} rows={2} placeholder={t.manualHint} className="mt-1 w-full rounded-lg border border-[#dedbd3] bg-white px-3 py-2.5 text-sm" />
          </label>
          {plan.all.length > 0 && <label className="mt-3 flex items-center gap-2 text-xs text-[#59635f]"><input type="checkbox" checked={includePlan} onChange={(event) => setIncludePlan(event.target.checked)} />{t.includePlan(plan.all.length)}</label>}
          <p className="mt-4 rounded-xl bg-[#edf3ef] px-4 py-3 text-xs leading-5 text-[#315c43]">{t.privacy}</p>
        </section>

        <section className="rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5 sm:p-6">
          <h2 className="font-serif text-2xl">02 · {t.programs}</h2>
          {listError && <p role="alert" className="mt-3 text-sm text-[#8c352c]">{t.loadError}</p>}
          <div role="tablist" className="mt-4 inline-flex rounded-lg border border-[#dedbd3] bg-[#f2f0eb] p-1 text-xs font-medium">
            {(["minor", "major"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => { setMode(value); setQuery(""); savePrefs({ mode: value }); }} className={`rounded-md px-3 py-1.5 ${mode === value ? "bg-white text-[#202728] shadow-sm" : "text-[#68716e] hover:text-[#202728]"}`}>{value === "minor" ? t.modeMinor : t.modeMajor}</button>)}
          </div>
          <label className="mt-4 block text-xs font-medium text-[#68716e]">{mode === "minor" ? t.minor : t.second}
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={mode === "minor" ? t.search : t.searchMajor} className="mt-1 w-full rounded-lg border border-[#dedbd3] bg-white px-3 py-2 text-sm" />
            <select value={targetSlug} onChange={(event) => chooseTarget(event.target.value)} className="mt-2 w-full rounded-lg border border-[#dedbd3] bg-white px-3 py-2.5 text-sm">
              <option value="">{mode === "minor" ? t.chooseMinor : t.chooseSecond}</option>
              {filteredChoices.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
            </select>
          </label>
          <label className="mt-4 block text-xs font-medium text-[#68716e]">{mode === "minor" ? t.major : t.currentMajor}
            <select value={majorSlug} onChange={(event) => { setMajorSlug(event.target.value); savePrefs({ major: event.target.value }); }} className="mt-1 w-full rounded-lg border border-[#dedbd3] bg-white px-3 py-2.5 text-sm">
              <option value="">{t.noMajor}</option>
              {(list?.majors ?? []).map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
            </select>
          </label>
          <label className="mt-4 block text-xs font-medium text-[#68716e]">{t.semesters}
            <select value={semesters} onChange={(event) => { const next = Number(event.target.value); setSemesters(next); savePrefs({ semesters: next }); }} className="mt-1 w-full rounded-lg border border-[#dedbd3] bg-white px-3 py-2.5 text-sm">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          {sameMajor && <p role="alert" className="mt-3 rounded-xl bg-[#fff0ec] px-4 py-3 text-xs text-[#8c352c]">{t.sameMajor}</p>}
        </section>
      </div>

      {targetSlug && !current && <p role="status" className="mt-6 text-sm text-[#68716e]">{programError ? t.loadError : t.loading}</p>}
      {current && progress && workload && <section className="mt-6 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-serif text-2xl">03 · {current.program.name}</h2>
          <a href={current.program.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[#a34a39] hover:underline">{t.catalog} ↗</a>
        </div>
        {current.program.intro && <p className="mt-2 text-xs leading-5 text-[#68716e]">{current.program.intro}</p>}
        {current.program.apply && <div className="mt-4 rounded-xl border border-[#ecd9a8] bg-[#fff8e8] p-3 text-xs leading-5 text-[#745424]"><p className="font-semibold">{t.applyTitle}</p><p className="mt-1">“{current.program.apply}”</p><p className="mt-1">{t.gatewayNote}</p>{current.program.applyUrl && <a href={current.program.applyUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-medium text-[#8c453b] underline underline-offset-2">{t.applyLink} ↗</a>}</div>}
        {current.program.blocks.length > 1 && <div className="mt-4 rounded-xl border border-[#e3e0d8] bg-white p-3">
          <p className="text-xs font-semibold text-[#48534f]">{t.parts}</p>
          <p className="mt-0.5 text-[11px] text-[#858d89]">{t.partsHint}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">{current.program.blocks.map((block, index) => <label key={index} className="inline-flex items-center gap-2 text-xs text-[#48534f]"><input type="checkbox" checked={selectedBlocks.has(index)} onChange={() => toggleBlock(index)} />{block.title || t.core}{block.total ? <span className="text-[#858d89]">· {t.creditsItem(block.total)}</span> : null}</label>)}</div>
        </div>}
        {progress.partial && <div className="mt-4 rounded-xl border border-[#f0d0c6] bg-[#fff0ec] p-3 text-xs leading-5 text-[#8c352c]"><p className="font-semibold">{t.partialTitle}</p><p className="mt-1">{current.program.items.length ? t.partial : t.noTable}</p></div>}

        {progress.items.length > 0 && <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stat(t.stillNeed, `${progress.remainingCredits} ${t.credits}`, progress.unlistedCredits ? `${t.courses(progress.remainingCourses)} · ${t.unlisted(progress.unlistedCredits)}` : t.courses(progress.remainingCourses))}
            {stat(t.counted, `${progress.creditsByStatus.done + progress.creditsByStatus.inProgress + progress.creditsByStatus.planned} ${t.credits}`, t.countedDetail(progress.creditsByStatus.done, progress.creditsByStatus.inProgress, progress.creditsByStatus.planned))}
            {stat(t.prereqs, progress.hiddenPrerequisites.length ? String(progress.hiddenPrerequisites.length) : t.prereqsNone, progress.hiddenPrerequisites.length ? t.prereqsDetail(progress.hiddenPrerequisites.length, progress.hiddenPrerequisiteCredits) : "")}
            {stat(t.chain, t.chainValue(progress.minSemesters), t.chainDetail)}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className={`rounded-xl border p-4 ${workload.level === "heavy" ? "border-[#f0d0c6] bg-[#fff6f3]" : workload.level === "moderate" ? "border-[#ecd9a8] bg-[#fffbf1]" : "border-[#cddbd1] bg-[#f4f8f5]"}`}>
              <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{t.load}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${workload.level === "heavy" ? "bg-[#f7d9d0] text-[#8c352c]" : workload.level === "moderate" ? "bg-[#f6e7bf] text-[#745424]" : "bg-[#d9eadf] text-[#315c43]"}`}>{t.level[workload.level]}</span></div>
              <p className="mt-2 text-sm text-[#48534f]">{workload.lowPerSemester !== workload.perSemester ? t.perSemesterRange(workload.lowPerSemester, workload.perSemester, semesters) : t.perSemester(workload.perSemester, semesters)}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#59635f]">{workload.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              <p className="mt-2 text-[11px] leading-5 text-[#858d89]">{t.gpaNote}</p>
            </div>
            <div className="rounded-xl border border-[#e3e0d8] bg-white p-4">
              <h3 className="font-semibold">{t.overlap}</h3>
              {!majorSlug ? <p className="mt-2 text-sm text-[#68716e]">{t.overlapPick}</p> : !currentMajor ? <p className="mt-2 text-sm text-[#68716e]">{t.loading}</p> : <>
                <p className="mt-2 text-sm text-[#48534f]">{progress.overlap.length ? (mode === "minor" ? t.overlapList : t.overlapListMajor)(progress.overlap.join(", ")) : t.overlapNone}</p>
                {progress.overlapExcess > 0 && <p className="mt-2 rounded-lg bg-[#fff0ec] px-3 py-2 text-xs text-[#8c352c]">{t.overlapExcess(progress.overlapExcess)}</p>}
                {mode === "major" && progress.sharedRemainingCredits > 0 && <p className="mt-2 text-xs text-[#48534f]">{t.sharedRemaining(progress.sharedRemainingCredits)}</p>}
                <p className="mt-2 text-[11px] leading-5 text-[#858d89]">{t.overlapNote}</p>
              </>}
              <p className="mt-2 text-xs font-medium text-[#536d64]">{mode === "minor" ? t.overlapRule : t.overlapRuleMajor}</p>
              {mode === "major" && currentMajor && <div className="mt-3 rounded-lg bg-[#f6f4ef] p-3 text-xs leading-5 text-[#59635f]">
                <p className="font-semibold text-[#48534f]">{t.dualTitle}</p>
                <p className="mt-1">{t.dualText(progress.uniqueCredits)} {progress.uniqueCredits >= 18 ? t.dualOk : t.dualShort}</p>
              </div>}
            </div>
          </div>

          {progress.hiddenPrerequisites.length > 0 && <div className="mt-4 rounded-xl border border-[#e3e0d8] bg-white p-4">
            <h3 className="font-semibold">{t.hidden}</h3>
            <ul className="mt-2 space-y-1.5">{progress.hiddenPrerequisites.map((code) => courseRow(code))}</ul>
          </div>}

          <h3 className="mt-6 text-xs font-semibold uppercase tracking-[.1em] text-[#9a5040]">{t.requirements}</h3>
          <div className="mt-2 grid gap-3 lg:grid-cols-2">{progress.items.map((result, position) => itemCard(result, position))}</div>
        </>}

        <div className="mt-6 rounded-xl bg-[#f2f0eb] p-4 text-xs leading-5 text-[#59635f]">
          <p className="font-semibold text-[#48534f]">{mode === "minor" ? t.rules : t.rulesMajor}</p>
          <ul className="mt-1 list-disc pl-5">{(mode === "minor" ? t.ruleList : t.ruleListMajor).map((rule) => <li key={rule}>{rule}</li>)}</ul>
          <p className="mt-2 font-medium text-[#8c453b]">{t.disclaimer}</p>
          {list && <p className="mt-1 text-[11px] text-[#858d89]">{t.snapshot(list.builtAt)}</p>}
        </div>
      </section>}
    </div>
  </main>;
}
