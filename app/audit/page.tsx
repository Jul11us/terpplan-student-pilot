"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseCourseIds, parseDegreeAudit, type AuditRequirement, type AuditResult } from "@/lib/degree-audit";
import { extractDegreeAuditText } from "@/lib/degree-audit-pdf";
import { GEN_ED_CATEGORIES } from "@/lib/gened-categories";
import { readSavedState, writeSavedState } from "@/lib/saved-state";
import { compareAuditCandidates, compareAuditCandidatesByGpa, type AuditCandidate } from "@/lib/audit-recommendations";
import { AUDIT_HANDOFF_KEY } from "@/lib/programs";

type Language = "en" | "zh";
type CandidateResponse = { candidates?: AuditCandidate[]; totalCandidates?: number; error?: string };
const copy = {
  en: {
    pilot: "UMD · Student pilot", title: "Find what your audit says you still need.", intro: "Upload a uAchieve degree audit PDF. Review the extracted requirements, then explore courses offered this term.", home: "Back to planner", privacy: "Your PDF and extracted audit text stay in this browser. TerpPlan sends only the selected requirement's course codes or Gen Ed category to look up classes. Nothing from this audit is saved to your account.",
    upload: "Choose degree audit PDF", size: "PDF · up to 12 MB · up to 60 pages", reading: "Reading PDF in your browser…", badFile: "Choose a PDF under 12 MB and 60 pages.", badPdf: "This PDF could not be read. Export a text-based audit PDF from uAchieve and try again.", noText: "No readable text was found. A scanned PDF needs text recognition before it can be used here.", noNeeds: "No unmet requirements were found. Check that this is a uAchieve degree audit PDF.", complete: "This audit says all identified requirements are met.", unknown: "The audit format was not fully recognized. Review every result against your official audit.",
    chooseFile: "Choose PDF", noFile: "No file chosen",
    minorLink: "Thinking about a minor? See how your courses count toward one →",
    genEdMissing: (codes: string) => `Your audit still needs these Gen Ed categories: ${codes}`, genEdOpen: "Find courses for them together →",
    genEdOpenOne: "Find this category in course search (checks your schedule) →",
    genEdHint: "Opens Gen Ed search with them selected. It checks time conflicts with your plan and lists courses that count for several first. Only the category codes are passed along.",
    actionable: "Requirements you can search courses for", others: (n: number) => `${n} other requirements (credit totals, GPA, residency…) · not tied to specific courses`,
    summary: (a: number, o: number, p: number) => `${a} to search · ${o} other · ${p} in progress`,
    kind: { credits: "Credit requirement", gpa: "GPA requirement", courses: "Course count requirement", other: "Other requirement" },
    nonCourseDetail: "This requirement is about totals (credits, GPA, residency) rather than specific courses, so there is nothing to look up. Check it against your official audit.",
    manual: "I know the courses for this — enter them myself", noneActionable: "No requirement listed specific courses or a Gen Ed category. You can still open one below and enter courses yourself.",
    clear: "Clear this audit", requirements: "Unmet requirements", review: "These are extracted from the PDF and may need correction. Your official uAchieve audit is the source of truth.", need: "Audit says", editTitle: "Correct requirement label", nonCourse: "No specific course list or Gen Ed category was recognized for this requirement.", listed: "Listed courses", category: "Gen Ed category", edit: "Edit course codes", chooseCategory: "Choose category", useList: "Use listed courses", useCategory: "Use Gen Ed category", find: "Find courses this term", loading: "Checking current classes…", error: "Could not load course options right now. Try again.", term: "Term", results: "Course options", noOptions: "No matching classes were found for this term. Check the official Schedule of Classes or choose another term.", matches: (shown: number, total: number) => `${shown} shown from ${total} matches`, sections: (n: number) => `${n} sections`, openSections: (n: number) => `${n} with open seats`, seats: (n: number) => `${n} open seats`, seatsUnknown: "Seats unknown", historical: "Historical average GPA", gradeNote: "PlanetTerp historical averages describe past grades, not your likely grade. Availability and eligibility may change; confirm details in Testudo.", add: "Add to my plan", inPlan: "Already in plan", limit: "Plan is full (10 courses)", viewOfficial: "View in Testudo", completed: "Completed and in-progress courses are hidden; failed or withdrawn courses remain available for a retake.", inProgress: "In progress", sortGpa: "Sort by average GPA", sortDefault: "Sort by open seats", loadingGrades: "Loading grades…", gradeError: "Historical averages could not be loaded. Try again.", gradeScope: "GPA sorting applies to the currently shown courses only.", capped: "The broad category is capped at 30 visible courses. Refine in TerpPlan's Gen Ed finder if needed.",
  },
  zh: {
    pilot: "马里兰大学 · 学生试用", title: "看看学位审计还缺哪些课。", intro: "上传 uAchieve 的 degree audit PDF，先核对识别出的未完成要求，再查看本学期开设的课程。", home: "返回排课", privacy: "PDF 和解析出的审计文字只在你的浏览器里处理。TerpPlan 只发送你选中的课程编号或 Gen Ed 类别来查询班次；这些审计信息不会保存到账号。",
    upload: "选择 degree audit PDF", size: "PDF · 不超过 12 MB · 不超过 60 页", reading: "正在浏览器中读取 PDF…", badFile: "请选择不超过 12 MB、60 页的 PDF。", badPdf: "无法读取这个 PDF。请从 uAchieve 导出含文字的审计 PDF 后重试。", noText: "没有找到可读取的文字。扫描版 PDF 需要先做文字识别。", noNeeds: "没有识别出未完成要求。请确认上传的是 uAchieve 的 degree audit PDF。", complete: "这份审计显示已满足所有列出的要求。", unknown: "未完全识别这份审计的格式。请对照官方报告逐项核对。",
    chooseFile: "选择 PDF", noFile: "未选择文件",
    minorLink: "想修辅修？看看你的课能抵多少 →",
    genEdMissing: (codes: string) => `审计显示还缺这些 Gen Ed：${codes}`, genEdOpen: "到找课页一起查找 →",
    genEdOpenOne: "到找课页查找这个类别（会检查课表冲突）→",
    genEdHint: "会打开 Gen Ed 查找并选好这些类别，检查和你课表的时间冲突，能同时抵多项要求的课排在前面。只会带上类别代码。",
    actionable: "可以直接找课的要求", others: (n: number) => `另有 ${n} 项其他要求（总学分、GPA、住校等）· 不对应具体课程`,
    summary: (a: number, o: number, p: number) => `${a} 项可找课 · ${o} 项其他要求 · ${p} 门正在修`,
    kind: { credits: "学分要求", gpa: "GPA 要求", courses: "课程数量要求", other: "其他要求" },
    nonCourseDetail: "这一项是总量要求（学分、GPA、住校等），不对应具体课程，所以没有课可以查。请对照官方审计核实。",
    manual: "我知道这项要修哪些课，自己填写", noneActionable: "没有要求列出具体课程或 Gen Ed 类别。你仍然可以展开下面的要求，自己填写课程。",
    clear: "清除这份审计", requirements: "未完成要求", review: "以下内容从 PDF 提取，可能需要修正；学位要求始终以官方 uAchieve 审计为准。", need: "审计要求", editTitle: "修正要求名称", nonCourse: "这一项没有识别到具体课程列表或 Gen Ed 类别。", listed: "列出的课程", category: "Gen Ed 类别", edit: "修改课程编号", chooseCategory: "选择类别", useList: "按列出的课程找", useCategory: "按 Gen Ed 类别找", find: "查找本学期课程", loading: "正在查询当前班次…", error: "暂时无法读取候选课程，请重试。", term: "学期", results: "可选课程", noOptions: "这个学期没有找到匹配的班次。请核对官方选课系统，或切换学期。", matches: (shown: number, total: number) => `显示 ${shown} / ${total} 门`, sections: (n: number) => `${n} 个班`, openSections: (n: number) => `${n} 个班有空位`, seats: (n: number) => `${n} 个空位`, seatsUnknown: "余位未知", historical: "历史平均 GPA", gradeNote: "PlanetTerp 的历史平均成绩不代表你将取得的成绩。余位和选课资格可能变化，请到 Testudo 核实。", add: "加入我的排课", inPlan: "已在排课中", limit: "排课已满（10 门）", viewOfficial: "去 Testudo 查看", completed: "已修完和正在修的课程会隐藏；挂科或退课的课程仍可供重修。", inProgress: "正在修", sortGpa: "按平均 GPA 排序", sortDefault: "按空位排序", loadingGrades: "正在读取历史成绩…", gradeError: "暂时无法读取历史均分，请重试。", gradeScope: "GPA 排序仅针对当前显示的课程。", capped: "宽泛类别最多显示 30 门；需要更多选项可到 TerpPlan 的 Gen Ed 查课页。",
  },
} as const;

function titleForTerm(term: string, language: Language) {
  const season = term.slice(4) === "01" ? (language === "zh" ? "春季" : "Spring") : term.slice(4) === "08" ? (language === "zh" ? "秋季" : "Fall") : term.slice(4) === "05" ? (language === "zh" ? "夏季" : "Summer") : (language === "zh" ? "冬季" : "Winter");
  return language === "zh" ? `${term.slice(0, 4)} ${season}` : `${season} ${term.slice(0, 4)}`;
}

// A requirement is searchable when the audit named courses or a Gen Ed category for it.
const isActionable = (requirement: AuditRequirement) => requirement.courseIds.length > 0 || Boolean(requirement.genEdCode);

// Totals-only requirements get a plain type name; their extracted label is often a sentence fragment.
function requirementKind(requirement: AuditRequirement): "credits" | "gpa" | "courses" | "other" {
  if (/\bGPA\b/i.test(requirement.need) && !/CREDITS?|COURSES?/i.test(requirement.need)) return "gpa";
  if (/CREDITS?/i.test(requirement.need)) return "credits";
  if (/COURSES?|SUB-GROUPS?/i.test(requirement.need)) return "courses";
  return "other";
}

export default function AuditPage() {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>("en");
  const t = copy[language];
  const [term, setTerm] = useState("202701");
  const [terms, setTerms] = useState<string[]>([]);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [courseText, setCourseText] = useState("");
  const [category, setCategory] = useState("");
  const [mode, setMode] = useState<"list" | "category">("list");
  const [reading, setReading] = useState(false);
  const [fileName, setFileName] = useState("");
  // Opens the search form for a totals-only requirement when the student wants to enter courses anyway.
  const [manualId, setManualId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<AuditCandidate[] | null>(null);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [planIds, setPlanIds] = useState<string[]>([]);
  const [sortByGpa, setSortByGpa] = useState(false);
  const [gpaScopeIds, setGpaScopeIds] = useState<string[] | null>(null);
  const [loadingGrades, setLoadingGrades] = useState(false);
  const [gradeError, setGradeError] = useState("");
  const gradeRequest = useRef(0);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      const saved = readSavedState();
      if (saved.language) setLanguage(saved.language);
      if (saved.term) setTerm(saved.term);
      setPlanIds((saved.plans[saved.term ?? "202701"] ?? []).map((course) => course.courseId));
    }, 0);
    fetch("/api/terms").then(async (response) => await response.json() as { terms?: string[] }).then((payload) => {
      if (Array.isArray(payload.terms)) setTerms(payload.terms);
    }).catch(() => {});
    return () => window.clearTimeout(restore);
  }, []);

  const selected = audit?.requirements.find((requirement) => requirement.id === selectedId) ?? null;
  const completed = useMemo(() => new Set(audit?.completedCourseIds ?? []), [audit]);
  const inProgress = useMemo(() => new Set(audit?.inProgressCourseIds ?? []), [audit]);
  const gpaScope = useMemo(() => new Set(gpaScopeIds ?? []), [gpaScopeIds]);
  const visible = (candidates ?? []).filter((candidate) => !completed.has(candidate.courseId) && !inProgress.has(candidate.courseId)
    && (!sortByGpa || gpaScope.has(candidate.courseId)))
    .sort(sortByGpa ? compareAuditCandidatesByGpa : compareAuditCandidates).slice(0, 30);

  function resetResults() {
    gradeRequest.current++;
    setCandidates(null);
    setSortByGpa(false);
    setGpaScopeIds(null);
    setLoadingGrades(false);
    setGradeError("");
  }

  function chooseRequirement(requirement: AuditRequirement) {
    setSelectedId(requirement.id);
    setCourseText(requirement.courseIds.join(", "));
    setCategory(requirement.genEdCode ?? "");
    setMode(requirement.courseIds.length ? "list" : "category");
    resetResults();
    setError("");
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setReading(true); setError(""); setAudit(null); resetResults(); setSelectedId("");
    try {
      const text = await extractDegreeAuditText(file);
      if (!text.trim()) throw new Error("text");
      const parsed = parseDegreeAudit(text);
      setAudit(parsed);
      const first = parsed.requirements.find((requirement) => requirement.courseIds.length || requirement.genEdCode);
      if (first) chooseRequirement(first);
      if (!parsed.requirements.length && parsed.status !== "complete") setError(t.noNeeds);
    } catch (cause) {
      setError(cause instanceof Error && ["size", "type", "pages"].includes(cause.message) ? t.badFile : cause instanceof Error && cause.message === "text" ? t.noText : t.badPdf);
    } finally { setReading(false); }
  }

  async function findCourses() {
    const courseIds = parseCourseIds(courseText).slice(0, 30);
    if (mode === "list" && !courseIds.length || mode === "category" && !category) return;
    setLoading(true); setError(""); resetResults();
    try {
      const response = await fetch("/api/audit/recommend", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ term, ...(mode === "category" ? { genEdCode: category } : { courseIds }) }),
      });
      const payload = await response.json() as CandidateResponse;
      if (!response.ok) throw new Error(payload.error ?? "recommend");
      setCandidates(payload.candidates ?? []);
      setTotalCandidates(payload.totalCandidates ?? 0);
    } catch { setError(t.error); }
    finally { setLoading(false); }
  }

  async function toggleGpaSort() {
    if (sortByGpa) { setSortByGpa(false); return; }
    const ids = visible.map((candidate) => candidate.courseId);
    if (!ids.length) return;
    const requestId = ++gradeRequest.current;
    setLoadingGrades(true); setGradeError("");
    try {
      const response = await fetch("/api/audit/grades", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseIds: ids }),
      });
      if (!response.ok) throw new Error("grades");
      const payload = await response.json() as { averages?: Record<string, number | null> };
      const averages = payload.averages;
      if (!averages) throw new Error("grades");
      if (requestId !== gradeRequest.current) return;
      setCandidates((current) => current?.map((candidate) => {
        if (!Object.hasOwn(averages, candidate.courseId)) return candidate;
        const average = averages[candidate.courseId];
        return { ...candidate, averageGpa: typeof average === "number" && Number.isFinite(average) && average >= 0 && average <= 4 ? average : null };
      }) ?? null);
      setGpaScopeIds(ids);
      setSortByGpa(true);
    } catch { if (requestId === gradeRequest.current) setGradeError(t.gradeError); }
    finally { if (requestId === gradeRequest.current) setLoadingGrades(false); }
  }

  // Hands only the course lists to the minor page, in this tab's sessionStorage.
  function openMinor() {
    if (!audit) return;
    try { window.sessionStorage.setItem(AUDIT_HANDOFF_KEY, JSON.stringify({ completed: audit.completedCourseIds, inProgress: audit.inProgressCourseIds })); } catch { /* storage unavailable */ }
    router.push("/minor");
  }

  function addToPlan(candidate: AuditCandidate) {
    const saved = readSavedState();
    const current = saved.plans[term] ?? [];
    if (current.some((course) => course.courseId === candidate.courseId) || current.length >= 10) return;
    writeSavedState({ term, plans: { ...saved.plans, [term]: [...current, { courseId: candidate.courseId, courseTitle: candidate.title }] } });
    router.push("/");
  }

  return <main className="min-h-screen bg-[#f5f3ef] text-[#202728]">
    <header className="border-b border-[#dedbd3] bg-[#fbfaf8]"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4 sm:px-8"><Link href="/" className="flex items-center gap-3 font-semibold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#bd302f] font-serif text-lg text-white">T</span>TerpPlan</Link><div className="flex items-center gap-3"><Link href="/" className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9d6ce] bg-white px-3 py-1.5 text-xs font-semibold text-[#273c38] shadow-sm hover:border-[#536d64] hover:bg-[#edf3ef]"><span aria-hidden="true">←</span>{t.home}</Link><button onClick={() => setLanguage(language === "en" ? "zh" : "en")} className="rounded-lg border border-[#dcd9d0] px-3 py-2 text-xs">{language === "en" ? "中文" : "English"}</button></div></div></header>
    <div className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8">
      <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-[#536d64] hover:text-[#273c38] hover:underline"><span aria-hidden="true">←</span>{t.home}</Link><p className="text-[11px] font-semibold uppercase tracking-[.17em] text-[#a34a39]">{t.pilot}</p><h1 className="mt-3 max-w-3xl font-serif text-4xl leading-tight sm:text-5xl">{t.title}</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-[#626c67]">{t.intro}</p>
      <section className="mt-8 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5 sm:p-7"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="font-serif text-2xl">01 · {t.upload}</h2><p className="mt-1 text-xs text-[#7c8580]">{t.size}</p></div>{audit && <button onClick={() => { setAudit(null); resetResults(); setSelectedId(""); setError(""); setFileName(""); }} className="text-xs font-medium text-[#8c453b] hover:underline">{t.clear}</button>}</div>
        {/* The native file input shows its text in the operating system's language, so it sits hidden behind our own label. */}
        <label className={`mt-5 flex w-full items-center gap-4 rounded-xl border border-[#d9d6ce] bg-white p-3 text-sm ${reading ? "opacity-60" : "cursor-pointer hover:border-[#a34a39]"} focus-within:ring-2 focus-within:ring-[#a34a39]/30`}>
          <input type="file" accept="application/pdf,.pdf" aria-label={t.upload} onChange={(event) => { void readFile(event.target.files?.[0]); event.target.value = ""; }} disabled={reading} className="sr-only" />
          <span className="shrink-0 rounded-lg bg-[#273c38] px-3 py-2 font-semibold text-white">{t.chooseFile}</span>
          <span className="min-w-0 truncate text-[#68716e]">{fileName || t.noFile}</span>
        </label>
        <p className="mt-4 rounded-xl bg-[#edf3ef] px-4 py-3 text-xs leading-5 text-[#315c43]">{t.privacy}</p>{reading && <p role="status" className="mt-4 text-sm text-[#68716e]">{t.reading}</p>}{error && <p role="alert" className="mt-4 rounded-xl bg-[#fff0ec] px-4 py-3 text-sm text-[#8c352c]">{error}</p>}
      </section>
      {audit && <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(270px,.43fr)_minmax(0,.57fr)]"><div className="rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5 sm:p-6"><h2 className="font-serif text-2xl">02 · {t.requirements}</h2><p className="mt-2 text-xs leading-5 text-[#737b77]">{t.review}</p>{audit.status === "complete" && <p className="mt-4 rounded-xl bg-[#edf3ef] p-3 text-sm text-[#315c43]">{t.complete}</p>}{audit.status === "unknown" && <p className="mt-4 rounded-xl bg-[#fff8e8] p-3 text-sm text-[#745424]">{t.unknown}</p>}{audit.inProgressCourseIds.length > 0 && <p className="mt-4 rounded-xl bg-[#eef2f7] p-3 text-xs leading-5 text-[#455d78]">{t.inProgress}: {audit.inProgressCourseIds.join(", ")}</p>}
        {(() => {
          const actionable = audit.requirements.filter(isActionable);
          const others = audit.requirements.filter((requirement) => !isActionable(requirement));
          const card = (requirement: AuditRequirement, plain: boolean) => <button key={requirement.id} onClick={() => chooseRequirement(requirement)} aria-pressed={selectedId === requirement.id} className={`w-full rounded-xl border p-3 text-left ${selectedId === requirement.id ? "border-[#536d64] bg-[#edf3ef]" : "border-[#e3e0d8] bg-white hover:border-[#b9c5be]"}`}>
            <span className="block text-sm font-semibold leading-5">{plain ? t.kind[requirementKind(requirement)] : requirement.title}</span>
            <span className="mt-1 block text-xs leading-5 text-[#68716e]">{t.need}: {requirement.need}</span>
            {plain ? <span className="mt-1 block truncate text-[11px] text-[#8a918e]">{requirement.title}</span> : <span className="mt-1 block text-[11px] font-medium text-[#536d64]">{requirement.courseIds.length ? `${requirement.courseIds.length} ${t.listed}` : requirement.genEdCode}</span>}
          </button>;
          const missingGenEds = [...new Set(audit.requirements.map((requirement) => requirement.genEdCode).filter((code): code is string => Boolean(code)))];
          return <>
            {missingGenEds.length > 0 && <div className="mt-4 rounded-xl border border-[#cddbd1] bg-[#f4f8f5] p-3">
              <p className="text-sm font-semibold text-[#273c38]">{t.genEdMissing(missingGenEds.join(", "))}</p>
              <Link href={`/?gened=${missingGenEds.join(",")}`} className="mt-2 inline-block rounded-lg bg-[#273c38] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d302c]">{t.genEdOpen}</Link>
              <p className="mt-2 text-[11px] leading-5 text-[#68716e]">{t.genEdHint}</p>
            </div>}
            <button type="button" onClick={openMinor} className="mt-4 block text-left text-xs font-medium text-[#536d64] underline underline-offset-2 hover:text-[#273c38]">{t.minorLink}</button>
            <p className="mt-4 text-xs font-medium text-[#48534f]">{t.summary(actionable.length, others.length, audit.inProgressCourseIds.length)}</p>
            {actionable.length > 0 ? <>
              <h3 className="mt-4 text-xs font-semibold uppercase tracking-[.1em] text-[#9a5040]">{t.actionable}</h3>
              <div className="mt-2 space-y-2">{actionable.map((requirement) => card(requirement, false))}</div>
            </> : <p className="mt-4 rounded-xl bg-[#f2f0eb] p-3 text-xs leading-5 text-[#68716e]">{t.noneActionable}</p>}
            {others.length > 0 && <details className="mt-4 rounded-xl border border-[#e3e0d8] bg-[#f6f4ef]" open={!actionable.length}>
              <summary className="cursor-pointer px-3 py-2.5 text-xs font-medium text-[#59635f] hover:text-[#202728]">{t.others(others.length)}</summary>
              <div className="space-y-2 px-3 pb-3">{others.map((requirement) => card(requirement, true))}</div>
            </details>}
          </>;
        })()}
      </div><div className="rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5 sm:p-6"><h2 className="font-serif text-2xl">03 · {t.results}</h2>{selected && !isActionable(selected) && manualId !== selected.id ? <div className="mt-4">
          <p className="text-sm font-semibold">{t.kind[requirementKind(selected)]}</p>
          <p className="mt-1 text-xs text-[#68716e]">{t.need}: {selected.need}</p>
          <p className="mt-1 text-[11px] text-[#8a918e]">{selected.title}</p>
          <p className="mt-4 rounded-xl bg-[#f2f0eb] p-4 text-sm leading-6 text-[#59635f]">{t.nonCourseDetail}</p>
          <button type="button" onClick={() => setManualId(selected.id)} className="mt-3 text-xs font-medium text-[#536d64] underline underline-offset-2">{t.manual}</button>
        </div> : selected ? <><label className="mt-4 block text-xs font-medium text-[#68716e]">{t.editTitle}<input value={selected.title} onChange={(event) => { const next = event.target.value; setAudit((current) => current ? { ...current, requirements: current.requirements.map((item) => item.id === selectedId ? { ...item, title: next } : item) } : current); }} className="mt-1 w-full rounded-lg border border-[#dedbd3] bg-white px-3 py-2.5 text-sm" /></label><p className="mt-2 text-xs text-[#68716e]">{t.need}: {selected.need}</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-[#68716e]">{t.term}<select value={term} onChange={(event) => { const next = event.target.value; setTerm(next); setPlanIds((readSavedState().plans[next] ?? []).map((course) => course.courseId)); resetResults(); }} className="mt-1 w-full rounded-lg border border-[#dedbd3] bg-white px-3 py-2.5 text-sm">{(terms.length ? terms : [term]).map((value) => <option key={value} value={value}>{titleForTerm(value, language)}</option>)}</select></label><label className="text-xs font-medium text-[#68716e]">{t.category}<select value={category} onChange={(event) => { const next = event.target.value; setCategory(next); setAudit((current) => current ? { ...current, requirements: current.requirements.map((item) => item.id === selectedId ? { ...item, genEdCode: next || null } : item) } : current); resetResults(); }} className="mt-1 w-full rounded-lg border border-[#dedbd3] bg-white px-3 py-2.5 text-sm"><option value="">{t.chooseCategory}</option>{GEN_ED_CATEGORIES.map((item) => <option key={item.code} value={item.code}>{item.code} · {item[language]}</option>)}</select></label></div>
        <label className="mt-4 block text-xs font-medium text-[#68716e]">{t.edit}<textarea value={courseText} onChange={(event) => { const next = event.target.value; setCourseText(next); setAudit((current) => current ? { ...current, requirements: current.requirements.map((item) => item.id === selectedId ? { ...item, courseIds: parseCourseIds(next) } : item) } : current); resetResults(); }} rows={2} placeholder="CMSC132, MATH141" className="mt-1 w-full rounded-lg border border-[#dedbd3] bg-white px-3 py-2.5 text-sm" /></label><div className="mt-4 flex flex-wrap gap-4 text-xs"><label className="flex items-center gap-2"><input type="radio" checked={mode === "list"} onChange={() => { setMode("list"); resetResults(); }} />{t.useList}</label><label className="flex items-center gap-2"><input type="radio" checked={mode === "category"} onChange={() => { setMode("category"); resetResults(); }} />{t.useCategory}</label></div>
        {selected.genEdCode && <Link href={`/?gened=${selected.genEdCode}`} className="mt-4 block text-xs font-medium text-[#536d64] underline underline-offset-2">{t.genEdOpenOne}</Link>}
        <button onClick={() => void findCourses()} disabled={loading || (mode === "list" ? !parseCourseIds(courseText).length : !category)} className="mt-5 rounded-lg bg-[#273c38] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{loading ? t.loading : t.find}</button>{!selected.courseIds.length && !selected.genEdCode && <p className="mt-3 text-xs text-[#8a918e]">{t.nonCourse}</p>}
        {candidates && <>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">{t.results}</h3>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-[#7c8580]">{t.matches(visible.length, totalCandidates)}</span>
              <button type="button" aria-pressed={sortByGpa} disabled={loadingGrades || !visible.length} onClick={() => void toggleGpaSort()} className="rounded-lg border border-[#d9d6ce] bg-white px-3 py-2 text-xs font-medium text-[#273c38] disabled:opacity-50">{loadingGrades ? t.loadingGrades : sortByGpa ? t.sortDefault : t.sortGpa}</button>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-[#858d89]">{t.gradeNote} {t.completed}</p>
          {sortByGpa && <p className="mt-2 text-[11px] text-[#745424]">{t.gradeScope}</p>}
          {gradeError && <p role="alert" className="mt-2 text-xs text-[#8c352c]">{gradeError}</p>}
          {mode === "category" && totalCandidates > 30 && <p className="mt-2 text-[11px] text-[#745424]">{t.capped}</p>}
          {!visible.length && <p className="mt-5 rounded-xl bg-[#f2f0eb] p-4 text-sm text-[#68716e]">{t.noOptions}</p>}
        <div className="mt-4 space-y-3">{visible.map((candidate) => <article key={candidate.courseId} className="rounded-xl border border-[#e3e0d8] bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{candidate.courseId} <span className="font-normal text-[#606966]">{candidate.title}</span></p><p className="mt-1 text-xs text-[#68716e]">{candidate.credits ? `${candidate.credits} cr · ` : ""}{t.sections(candidate.sections)} · {candidate.knownSeatSections ? t.seats(candidate.openSeats) : t.seatsUnknown}{candidate.averageGpa !== null ? ` · ${t.historical} ${candidate.averageGpa.toFixed(2)}` : ""}</p></div><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${candidate.openSections ? "bg-[#eaf4ec] text-[#367047]" : "bg-[#f2f0eb] text-[#6d746f]"}`}>{candidate.knownSeatSections ? t.openSections(candidate.openSections) : t.seatsUnknown}</span></div><div className="mt-3 flex flex-wrap gap-3"><button onClick={() => addToPlan(candidate)} disabled={planIds.includes(candidate.courseId) || planIds.length >= 10 || candidate.sections === 0} className="rounded-lg border border-[#536d64] px-3 py-2 text-xs font-semibold text-[#273c38] disabled:opacity-50">{planIds.includes(candidate.courseId) ? t.inPlan : planIds.length >= 10 ? t.limit : t.add}</button><a href={`https://app.testudo.umd.edu/soc/${term}/${candidate.courseId.slice(0, 4)}/${candidate.courseId}`} target="_blank" rel="noopener noreferrer" className="px-1 py-2 text-xs font-medium text-[#a34a39] hover:underline">{t.viewOfficial} ↗</a></div></article>)}</div></>}
      </> : <p className="mt-5 text-sm text-[#737b77]">{audit.requirements.length ? t.review : t.noNeeds}</p>}</div></section>}
    </div>
  </main>;
}
