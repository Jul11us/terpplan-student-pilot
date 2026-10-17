"use client";

import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/app/components/site-header";
import { checkCsMajor, csBenchmarks, CS_TRACKS, TRACK_NAMES, type CsBenchmark, type CsCheck, type CsCourse, type CsTrack } from "@/lib/cs-major";
import { useOfferingSeasons } from "@/app/components/season-note";
import { useDocumentLanguage } from "@/lib/document-language";
import { GEN_ED_CATEGORIES } from "@/lib/gened-categories";
import { DIVERSITY } from "@/lib/gened-plan";
import { describeRequirement, type PrereqLabels } from "@/lib/prereq-check";
import {
  addCourses, checkRoadmap, courseCredits, DEGREE_CREDITS, emptyRoadmap, fallOf, genEdTable, MAX_PER_TERM, MAX_YEARS, MIN_YEARS, moveCourse,
  removeCourse, roadmapHasCourses, roadmapTerms, termAt, termSeason, termYear, variableCredits, yearTerms,
  type CourseInfo, type CourseIssue, type GenEdRow, type RoadmapCheck, type SavedRoadmap, type TermSeason,
} from "@/lib/roadmap";
import { readSavedState, writeSavedState } from "@/lib/saved-state";
import { readTaken } from "@/lib/taken-courses";

type Language = "en" | "zh";
type Suggestion = { course_id: string; name: string; credits: string | null };

const copy = {
  en: {
    eyebrow: "University of Maryland · Student pilot", title: "Four-year plan",
    intro: "Put the courses you plan to take into each term. TerpPlan checks credits, prerequisite order, courses that run only in fall or only in spring, and the university Gen Ed requirements. Your major's own requirements are not checked yet: your uAchieve audit and your advisor have the final word.",
    start: "Year 1 starts", years: "Years", fillTaken: "Add courses taken and in progress", fillPlan: "Add the planner's courses",
    fillTakenNone: "No courses taken yet: upload your degree audit, or add them in the planner.", fillPlanNone: "The planner has no courses in these terms.",
    filled: "{n} courses added.", filledNone: "Nothing new to add.", print: "Print / save as PDF", printNote: "The printout is in English, laid out like the department graduation plan form, ready for your advisor.",
    clear: "Clear", clearConfirm: "Remove every course from the four-year plan?", fewerYears: "Courses after year {n} will be removed. Continue?", startDrops: "Courses in terms after the new last year will be removed. Continue?",
    total: "{n} / 120 credits", genEdDone: "Gen Ed: {n} of {m} filled", issues: "{n} to check", noIssues: "Nothing to check",
    year: "Year {n}", seasons: { fall: "Fall", spring: "Spring", winter: "Winter", summer: "Summer" } as Record<TermSeason, string>,
    credits: "{n} credits", creditsUnknown: "{n} with credits unknown", over: "Over the {limit}-credit limit: needs your college's approval", partTime: "Under 12 credits is not full time",
    past: "Done", current: "This term", earlierTitle: "Before the plan", earlierHint: "AP and transfer credit, and terms before year 1. They count toward credits and prerequisites.",
    add: "Add a course", addPlaceholder: "Code or title, e.g. CMSC216", full: "A term holds up to 12 courses.", notInCatalog: "Not offered in Fall 2026 or Spring 2027; enter its credits.",
    move: "Move to…", moveFor: "Move {id}", remove: "Remove {id}", creditsFor: "Credits for {id}", cr: "cr",
    issuePrereq: "Prerequisite not planned earlier: {list}", issueSeason: { fall: "Only offered in fall lately", spring: "Only offered in spring lately" }, issueRepeat: "Already planned earlier", and: "; ",
    orHigher: " or higher", sameTerm: " (can be same term)", of: (k: number) => `${k} of`,
    majorTitle: "Major requirements", majorLabel: "Major", trackLabel: "Track", majorNone: "Not chosen", majorCs: "Computer Science",
    majorPrompt: "Choose your major to check its requirements one by one. Computer Science (with its four specializations) is supported now; other majors come next.",
    majorDone: "{n} of {m} met", majorShort: "Major: {n} of {m}", courseUnit: "courses", courseOne: "course", creditUnit: "credits", areaUnit: "areas", progress: "{have} / {need} {unit}",
    groups: { core: "Required core courses", math: "Math and statistics", track: "Upper level CS · {track}", ulc: "Upper level concentration" },
    benchmarkTitle: "LEP benchmarks (reviews at 45 and 75 credits)", benchmarkReached: "This plan reaches {at} credits in {term}.", benchmarkNotReached: "This plan does not reach {at} credits yet.",
    benchmarkOk: "Everything it asks for is done by then.", benchmarkMissing: "Not done by then: {list}", benchmarkPlanned: "The courses it asks for are all in the plan.", benchmarkUnplanned: "Not in the plan yet: {list}",
    majorNotes: "Rules from the 2026–2027 undergraduate catalog and the department's pages (undergrad.cs.umd.edu). Grades of C- or better, GPA and the concentration's average are not known here. Benchmark credits include AP and transfer credit, so the review may come later; your advisor knows when.",
    genEdTitle: "Gen Ed requirements", genEdHint: "Matched from the Gen Ed codes Testudo lists for each course; a course counts once in each of its Gen Ed groups.", genEdMissing: "Still needed", genEdBefore: "Before the plan",
    loading: "Loading…",
  },
  zh: {
    eyebrow: "马里兰大学 · 学生试用", title: "四年规划",
    intro: "把每学期打算修的课排进去。TerpPlan 会检查学分、先修顺序、只在秋季或春季开的课，以及全校的 Gen Ed 要求。专业本身的要求这一版还不检查，以 uAchieve 和 advisor 为准。",
    start: "第一年秋季", years: "年数", fillTaken: "填入已修和在修的课", fillPlan: "填入排课方案",
    fillTakenNone: "还没有已修课程：在学位审计页上传 audit，或在排课页填写。", fillPlanNone: "排课页在这几个学期里还没有课。",
    filled: "填入了 {n} 门课。", filledNone: "没有需要新填入的课。", print: "打印 / 存为 PDF", printNote: "打印版用英文，按系里毕业规划表（Graduation Plan）的格式排版，方便交给 advisor。",
    clear: "清空", clearConfirm: "清空四年规划里的所有课程？", fewerYears: "第 {n} 年以后的课会被删掉，确定吗？", startDrops: "新的最后一年之后的学期里的课会被删掉，确定吗？",
    total: "{n} / 120 学分", genEdDone: "Gen Ed 已排 {n} / {m} 项", issues: "{n} 条提醒", noIssues: "没有提醒",
    year: "第 {n} 年", seasons: { fall: "秋季", spring: "春季", winter: "冬季（1 月）", summer: "夏季" } as Record<TermSeason, string>,
    credits: "{n} 学分", creditsUnknown: "另有 {n} 门学分未知", over: "超过 {limit} 学分上限，需要学院批准", partTime: "少于 12 学分，不算全日制",
    past: "已修完", current: "本学期", earlierTitle: "之前修过", earlierHint: "AP、转学分，以及第一年之前的学期。会算进总学分和先修课。",
    add: "加课程", addPlaceholder: "课号或课名，例如 CMSC216", full: "一个学期最多放 12 门课。", notInCatalog: "Fall 2026 和 Spring 2027 都没开这门课，学分请自己填。",
    move: "移到…", moveFor: "移动 {id}", remove: "移除 {id}", creditsFor: "{id} 的学分", cr: "学分",
    issuePrereq: "先修课没排在前面：{list}", issueSeason: { fall: "最近只在秋季开", spring: "最近只在春季开" }, issueRepeat: "前面已经排过这门课", and: "；",
    orHigher: " 或更高", sameTerm: "（可同学期修）", of: (k: number) => `任选 ${k} 门：`,
    majorTitle: "专业要求", majorLabel: "专业", trackLabel: "方向", majorNone: "未选择", majorCs: "计算机科学 Computer Science",
    majorPrompt: "选你的专业，按专业要求逐项检查。目前支持计算机科学（含四个方向），其他专业之后支持。",
    majorDone: "已满足 {n} / {m} 项", majorShort: "专业要求 {n} / {m} 项", courseUnit: "门", courseOne: "门", creditUnit: "学分", areaUnit: "个领域", progress: "{have} / {need} {unit}",
    groups: { core: "必修基础课", math: "数学和统计", track: "高年级 CS 课 · {track}", ulc: "Upper Level Concentration" },
    benchmarkTitle: "LEP Benchmark（45 学分和 75 学分时审核）", benchmarkReached: "按这份规划，{term} 达到 {at} 学分。", benchmarkNotReached: "按这份规划，还没到 {at} 学分。",
    benchmarkOk: "届时要求的课都已修完。", benchmarkMissing: "届时还没修：{list}", benchmarkPlanned: "要求的课都已经排进去了。", benchmarkUnplanned: "还没排进去：{list}",
    majorNotes: "规则来自 2026–2027 本科 catalog 和 CS 系官网（undergrad.cs.umd.edu）。C- 以上成绩、GPA 和 ULC 的平均分这里查不到。Benchmark 的学分把 AP 和转学分也算进去了，实际审核可能更晚，以 advisor 为准。",
    genEdTitle: "Gen Ed 要求", genEdHint: "按 Testudo 给每门课列出的 Gen Ed 类别自动对上；一门课在每一组类别里最多算一次。", genEdMissing: "还缺", genEdBefore: "之前修过",
    loading: "正在读取…",
  },
} as const;

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

// "2026 秋季", "Fall 2026"; a winter term is the January after its fall.
function termLabel(term: string, language: Language) {
  const season = copy[language].seasons[termSeason(term)];
  return language === "zh" ? `${termYear(term)} ${season}` : `${season} ${termYear(term)}`;
}

// The Gen Ed rows' names, as the graduation plan form abbreviates them.
const ABBREVIATION: Record<string, string> = { FSAW: "AW", FSPW: "PW", FSMA: "MA", FSOC: "OC", FSAR: "AR", DSNL: "NL", DSNS: "NS or NL", DSHS: "HS", DSHU: "HU", DSSP: "SP", SCIS: "IS", DVUP: "UP", [DIVERSITY]: "CC or UP" };
function genEdName(need: string, language: Language) {
  const code = need === DIVERSITY ? "DVCC" : need;
  const category = GEN_ED_CATEGORIES.find((item) => item.code === code);
  const name = need === DIVERSITY ? (language === "zh" ? "文化素养或第二门多元社会" : "Cultural Competence or a 2nd UP") : category ? category[language] : need;
  return `${name} (${ABBREVIATION[need] ?? need})`;
}

const genEdText = (info: CourseInfo | null | undefined) => info?.ge.length ? info.ge.map((group) => group.join("/")).join(" · ") : "";

// A search box for one term: the catalog's matches as they type; Enter takes the first, or a full course code.
function AddCourse({ language, onAdd, full }: { language: Language; onAdd: (id: string) => void; full: boolean }) {
  const t = copy[language];
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<{ query: string; results: Suggestion[] } | null>(null);
  const query = text.trim();
  useEffect(() => {
    if (query.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch(`/api/catalog?q=${encodeURIComponent(query)}`)
        .then(async (response) => response.ok ? ((await response.json()) as { results?: Suggestion[] }).results ?? [] : [])
        .catch(() => [] as Suggestion[])
        .then((results) => { if (!cancelled) setFound({ query, results }); });
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);
  const shown = open && found?.query === query && query.length >= 2 ? found.results.slice(0, 6) : [];
  const code = query.toUpperCase().replace(/\s+/g, "");
  const add = (id: string) => { onAdd(id); setText(""); setFound(null); };
  if (full) return <p className="mt-2 text-[11px] text-[#646c68]">{t.full}</p>;
  return <div className="relative mt-2">
    <input value={text} onChange={(event) => { setText(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const first = shown[0]?.course_id ?? (/^[A-Z]{4}\d{3}[A-Z]?$/.test(code) ? code : null);
        if (first) add(first);
      }}
      placeholder={t.addPlaceholder} aria-label={t.add} className="w-full rounded-lg border border-dashed border-[#d3cfc6] bg-white/70 px-2.5 py-2 text-xs outline-none focus:border-[#a34a39] focus:bg-white" />
    {shown.length > 0 && <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-lg border border-[#dedbd3] bg-white shadow-lg">{shown.map((item) => <li key={item.course_id}>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => add(item.course_id)} className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-[#f4f8f5]">
        <span className="min-w-0"><span className="font-semibold text-[#24312d]">{item.course_id}</span> <span className="text-[#646c68]">{item.name}</span></span>
        {item.credits && <span className="shrink-0 text-[#646c68]">{item.credits} {t.cr}</span>}
      </button>
    </li>)}</ul>}
  </div>;
}

function CourseRow({ id, term, info, issues, roadmap, places, language, onRemove, onMove, onCredits }: {
  id: string; term: string | null; info: CourseInfo | null | undefined; issues: CourseIssue[]; roadmap: SavedRoadmap; places: string[]; language: Language;
  onRemove: (id: string) => void; onMove: (id: string, to: string) => void; onCredits: (id: string, credits: number | null) => void;
}) {
  const t = copy[language];
  const labels: PrereqLabels = { orHigher: t.orHigher, sameTerm: t.sameTerm, of: t.of };
  const credits = courseCredits(id, info, roadmap);
  const editable = info === null || variableCredits(info);
  const issueText = (issue: CourseIssue) => issue.kind === "prereq" ? fill(t.issuePrereq, { list: issue.missing.map((node) => describeRequirement(node, labels)).join(t.and) })
    : issue.kind === "season" ? t.issueSeason[issue.only] : t.issueRepeat;
  return <li className="rounded-lg border border-[#e7e4dc] bg-white px-2.5 py-2">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm"><span className="font-semibold text-[#24312d]">{id}</span>{genEdText(info) && <span className="ml-1.5 text-[10px] font-medium text-[#536d64]">{genEdText(info)}</span>}</p>
        {info && <p className="truncate text-[11px] text-[#646c68]" title={info.name}>{info.name}</p>}
        {info === null && <p className="text-[11px] leading-4 text-[#745424]">{t.notInCatalog}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {editable
          ? <label className="flex items-center gap-1 text-[11px] text-[#646c68]"><input type="number" min={0} max={20} step={0.5} value={roadmap.credits?.[id] ?? ""} placeholder={info?.credits ?? "?"} onChange={(event) => onCredits(id, event.target.value === "" ? null : Number(event.target.value))} aria-label={fill(t.creditsFor, { id })} className="w-12 rounded border border-[#dedbd3] px-1 py-0.5 text-right text-xs" />{t.cr}</label>
          : <span className="text-xs tabular-nums text-[#48534f]">{credits ?? "?"} {t.cr}</span>}
        <button type="button" onClick={() => onRemove(id)} aria-label={fill(t.remove, { id })} className="grid h-7 w-7 place-items-center rounded-md text-base leading-none text-[#8b5148] hover:bg-[#f5e9e5]">×</button>
      </div>
    </div>
    {issues.map((issue, index) => <p key={index} className="mt-1 text-[11px] leading-4 text-[#8a5a17]">⚠ {issueText(issue)}</p>)}
    <select value="" onChange={(event) => { if (event.target.value) onMove(id, event.target.value); }} aria-label={fill(t.moveFor, { id })} className="mt-1 min-h-6 max-w-full cursor-pointer bg-transparent text-[11px] text-[#646c68] hover:text-[#273c38]">
      <option value="">{t.move}</option>
      {places.filter((place) => place !== (term ?? "earlier")).map((place) => <option key={place} value={place}>{place === "earlier" ? t.earlierTitle : termLabel(place, language)}</option>)}
    </select>
  </li>;
}

// The printout, in English and laid out like the department graduation plan form: each year's fall, spring, and
// January and summer, with the course, its Gen Ed codes and credits, then the Gen Ed requirements. Like the form,
// each term keeps a few blank lines to write in (six for fall and spring, two for January and summer).
function RoadmapPrint({ roadmap, info, check, rows, cs, benchmarks }: { roadmap: SavedRoadmap; info: Record<string, CourseInfo | null>; check: RoadmapCheck; rows: GenEdRow[]; cs: CsCheck | null; benchmarks: CsBenchmark[] }) {
  const lastTerm = roadmapTerms(roadmap).filter((term) => roadmap.terms[term]?.length).pop();
  const name = (term: string) => `${{ fall: "FALL", spring: "SPRING", winter: "JANUARY", summer: "SUMMER" }[termSeason(term)]} ${termYear(term)}`;
  const termTable = (term: string) => <table className="w-full border-collapse border border-black">
    <thead><tr><th colSpan={3} className="border border-black bg-[#e5e5e5] py-0.5">{name(term)}</th></tr><tr className="italic"><th className="border border-black px-1 text-left font-normal">Course</th><th className="border border-black px-1 text-left font-normal">GenEd</th><th className="border border-black px-1 font-normal">Cr</th></tr></thead>
    <tbody>{(roadmap.terms[term] ?? []).map((id) => <tr key={id}><td className="border border-black px-1">{id}</td><td className="border border-black px-1">{genEdText(info[id])}</td><td className="border border-black px-1 text-center">{courseCredits(id, info[id], roadmap) ?? ""}</td></tr>)}
      {Array.from({ length: Math.max(0, (["winter", "summer"].includes(termSeason(term)) ? 2 : 6) - (roadmap.terms[term]?.length ?? 0)) }, (_, index) => <tr key={`blank-${index}`}><td className="border border-black px-1">&nbsp;</td><td className="border border-black px-1" /><td className="border border-black px-1" /></tr>)}
      <tr><td colSpan={2} className="border border-black px-1 italic">Semester Credits</td><td className="border border-black px-1 text-center">{check.terms[term]?.credits || ""}</td></tr></tbody>
  </table>;
  return <div className="hidden text-[9px] leading-tight text-black print:block">
    <style>{"@page { size: letter portrait; margin: 0.4in; }"}</style>
    <div className="flex justify-between gap-4"><span>Name: ______________________________</span><span>UID: ______________</span><span>Date: ______________</span></div>
    <h1 className="my-2 text-center text-base font-bold">Graduation Plan</h1>
    {roadmap.earlier.length > 0 && <p className="mb-2">Before Year 1 (AP, transfer, earlier terms): {roadmap.earlier.map((id) => `${id}${courseCredits(id, info[id], roadmap) !== null ? ` (${courseCredits(id, info[id], roadmap)})` : ""}`).join(", ")} · {check.earlierCredits} credits</p>}
    {Array.from({ length: roadmap.years }, (_, index) => {
      const terms = yearTerms(roadmap.start, index);
      return <div key={index} className="mb-2 grid grid-cols-[auto_1fr_1fr_1fr] items-start gap-1" style={{ breakInside: "avoid" }}>
        <div className="flex items-center border border-black px-1 font-bold [writing-mode:vertical-rl]">YEAR {index + 1}</div>
        {termTable(terms.fall)}{termTable(terms.spring)}
        <div className="space-y-1">{termTable(terms.winter)}{termTable(terms.summer)}</div>
      </div>;
    })}
    <p className="mb-2 text-right font-bold">Total Credits: {check.total}</p>
    <table className="w-full border-collapse border border-black" style={{ breakInside: "avoid" }}>
      <thead><tr className="bg-[#e5e5e5]"><th className="border border-black px-1 text-left">GEN ED</th><th className="border border-black px-1 text-left">COURSE</th><th className="border border-black px-1 text-left">SEMESTER COMPLETED OR TO BE COMPLETED</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index}><td className="border border-black px-1">{genEdName(row.need, "en")}</td><td className="border border-black px-1">{row.id ?? ""}</td><td className="border border-black px-1">{row.id ? row.term ? termLabel(row.term, "en") : "Before Year 1" : ""}</td></tr>)}</tbody>
    </table>
    {cs && roadmap.major && <div className="mt-2 border border-black p-1" style={{ breakInside: "avoid" }}>
      <p><b>Computer Science · {TRACK_NAMES[roadmap.major.track].en}</b> · requirements met: {cs.done} of {cs.lines.length}{lastTerm ? ` · Anticipated graduation: ${termLabel(lastTerm, "en")}` : ""}</p>
      <p>Upper Level Concentration: {cs.ulc.discipline ?? "none yet"} ({cs.ulc.credits} credits planned)</p>
      {benchmarks.map((item) => <p key={item.at}>Benchmark at {item.at} credits: {item.term ? `reached in ${termLabel(item.term, "en")}` : "not reached in this plan"}{item.missing.length ? `; ${item.term ? "not done by then" : "not in the plan yet"}: ${item.missing.map((text) => text.en).join(", ")}` : item.term ? "; done by then" : "; its courses are in the plan"}</p>)}
      {cs.lines.some((item) => !item.ok) && <p>Still needed: {cs.lines.filter((item) => !item.ok).map((item) => `${item.label.en} (${item.have}/${item.need})`).join("; ")}</p>}
    </div>}
    <p className="mt-2">Made with TerpPlan (terpplan.com). Check it against your uAchieve degree audit.</p>
  </div>;
}

export default function RoadmapPage() {
  const [language, setLanguage] = useState<Language>("en");
  useDocumentLanguage(language);
  const [roadmap, setRoadmap] = useState<SavedRoadmap | null>(null);
  const [now, setNow] = useState("");
  const [info, setInfo] = useState<Record<string, CourseInfo | null>>({});
  const [notice, setNotice] = useState("");
  const t = copy[language];

  // Restored once: the saved plan, or an empty one whose year 1 is the fall of the student's first term on
  // record (their degree audit), or of this year.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = readSavedState();
      const today = termAt(new Date());
      const firstTaken = Object.values(readTaken()?.terms ?? {}).sort()[0];
      setLanguage(saved.language ?? "en");
      setNow(today);
      setRoadmap(saved.roadmap ?? emptyRoadmap(fallOf(firstTaken && firstTaken < today ? firstTaken : today)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  // Saved with the planner's state (and so synced with the account) once it holds something.
  useEffect(() => {
    if (roadmap && (roadmapHasCourses(roadmap) || readSavedState().roadmap)) writeSavedState({ roadmap });
  }, [roadmap]);

  const ids = useMemo(() => roadmap ? [...new Set([...roadmap.earlier, ...Object.values(roadmap.terms).flat()])] : [], [roadmap]);
  const missing = ids.filter((id) => !(id in info)).sort().join(",");
  useEffect(() => {
    const wanted = missing.split(",").filter(Boolean);
    if (!wanted.length) return;
    let cancelled = false;
    const batches = Array.from({ length: Math.ceil(wanted.length / 80) }, (_, index) => wanted.slice(index * 80, index * 80 + 80));
    void Promise.all(batches.map((batch) => fetch(`/api/catalog?ids=${batch.join(",")}`)
      .then(async (response) => response.ok ? ((await response.json()) as { courses?: Record<string, CourseInfo | null> }).courses ?? {} : {})
      .catch(() => ({} as Record<string, CourseInfo | null>))))
      .then((results) => { if (!cancelled) setInfo((current) => Object.assign({}, current, ...results)); });
    return () => { cancelled = true; };
  }, [missing]);

  // Fall-only and spring-only courses, for the fall and spring terms still ahead.
  const regularAhead = useMemo(() => roadmap && now ? Object.entries(roadmap.terms).filter(([term]) => term > now && ["fall", "spring"].includes(termSeason(term))).flatMap(([, list]) => list) : [], [roadmap, now]);
  const seasons = useOfferingSeasons(regularAhead);
  const check = useMemo(() => roadmap && now ? checkRoadmap(roadmap, info, seasons, now) : null, [roadmap, info, seasons, now]);
  const rows = useMemo(() => roadmap ? genEdTable([
    ...roadmap.earlier.map((id) => ({ id, term: null, groups: info[id]?.ge ?? [] })),
    ...Object.entries(roadmap.terms).flatMap(([term, list]) => list.map((id) => ({ id, term, groups: info[id]?.ge ?? [] }))),
  ]) : [], [roadmap, info]);

  const csCourses = useMemo<CsCourse[]>(() => {
    if (!roadmap) return [];
    const placed = [
      ...roadmap.earlier.map((id) => ({ id, term: null })),
      ...roadmapTerms(roadmap).flatMap((term) => (roadmap.terms[term] ?? []).map((id) => ({ id, term }))),
    ];
    return placed.filter((course, index) => placed.findIndex((other) => other.id === course.id) === index)
      .map((course) => ({ ...course, credits: courseCredits(course.id, info[course.id], roadmap) }));
  }, [roadmap, info]);
  const cs = useMemo(() => roadmap?.major ? checkCsMajor(roadmap.major.track, csCourses, info) : null, [roadmap, csCourses, info]);
  const benchmarks = useMemo(() => roadmap?.major ? csBenchmarks(csCourses, roadmapTerms(roadmap)) : [], [roadmap, csCourses]);

  const switchLanguage = () => { const next = language === "en" ? "zh" : "en"; setLanguage(next); writeSavedState({ language: next }); };
  if (!roadmap || !check) return <main className="min-h-screen bg-[#f5f3ef] text-[#202728]"><SiteHeader language={language} onLanguage={switchLanguage} current="roadmap" /><p className="mx-auto max-w-6xl px-5 py-10 text-sm text-[#646c68] sm:px-8">{t.loading}</p></main>;

  const places = ["earlier", ...roadmapTerms(roadmap)];
  const issueCount = Object.values(check.issues).reduce((sum, list) => sum + list.length, 0) + Object.values(check.terms).filter((term) => term.over).length;
  const filledRows = rows.filter((row) => row.id).length;
  const update = (next: SavedRoadmap) => { setRoadmap(next); setNotice(""); };
  const place = (id: string, to: string) => {
    const full = to !== "earlier" && (roadmap.terms[to]?.length ?? 0) >= MAX_PER_TERM;
    if (full) { setNotice(t.full); return; }
    update(moveCourse(roadmap, id, to));
  };
  const setCredits = (id: string, credits: number | null) => {
    const next = { ...roadmap.credits };
    if (credits === null || !Number.isFinite(credits) || credits < 0 || credits > 20) delete next[id]; else next[id] = Math.round(credits * 2) / 2;
    update({ ...roadmap, credits: Object.keys(next).length ? next : undefined });
  };
  const fillFrom = (entries: Array<{ id: string; term: string | null }>, none: string) => {
    if (!entries.length) { setNotice(none); return; }
    const next = addCourses(roadmap, entries);
    const before = new Set([...roadmap.earlier, ...Object.values(roadmap.terms).flat()]);
    const added = [...next.earlier, ...Object.values(next.terms).flat()].filter((id) => !before.has(id)).length;
    setRoadmap(next);
    setNotice(added ? fill(t.filled, { n: added }) : t.filledNone);
  };
  const fillTaken = () => {
    const taken = readTaken();
    fillFrom(taken ? [
      ...taken.completed.map((id) => ({ id, term: taken.terms?.[id] ?? null })),
      ...taken.inProgress.map((id) => ({ id, term: taken.terms?.[id] ?? now })),
    ] : [], t.fillTakenNone);
  };
  const fillPlan = () => {
    const terms = new Set(roadmapTerms(roadmap));
    const plans = readSavedState().plans;
    fillFrom(Object.entries(plans).filter(([term]) => terms.has(term)).flatMap(([term, list]) => list.map((course) => ({ id: course.courseId, term }))), t.fillPlanNone);
  };
  const setYears = (years: number) => {
    const kept = new Set(roadmapTerms({ start: roadmap.start, years }));
    const lost = Object.entries(roadmap.terms).some(([term, list]) => !kept.has(term) && list.length);
    if (lost && !window.confirm(fill(t.fewerYears, { n: years }))) return;
    update({ ...roadmap, years, terms: Object.fromEntries(Object.entries(roadmap.terms).filter(([term]) => kept.has(term))) });
  };
  // A new year 1: terms now before the plan move to "before the plan"; terms past its end are dropped (asked first).
  const setStart = (start: string) => {
    const kept = roadmapTerms({ start, years: roadmap.years });
    const outside = Object.entries(roadmap.terms).filter(([term, list]) => !kept.includes(term) && list.length);
    if (outside.some(([term]) => term > kept[kept.length - 1]!) && !window.confirm(t.startDrops)) return;
    const earlier = [...roadmap.earlier, ...outside.filter(([term]) => term < kept[0]!).flatMap(([, list]) => list)];
    update({ ...roadmap, start, terms: Object.fromEntries(Object.entries(roadmap.terms).filter(([term]) => kept.includes(term))), earlier: [...new Set(earlier)] });
  };
  const startYear = Number(now.slice(0, 4)) || 2026;
  const starts = Array.from({ length: 9 }, (_, index) => `${startYear - 6 + index}08`);
  const rowProps = { roadmap, places, language, onRemove: (id: string) => update(removeCourse(roadmap, id)), onMove: place, onCredits: setCredits };

  const termCard = (term: string) => {
    const season = termSeason(term);
    const summary = check.terms[term]!;
    const list = roadmap.terms[term] ?? [];
    const state = term < now ? "past" : term === now ? "current" : "ahead";
    const small = season === "winter" || season === "summer";
    return <section key={term} aria-label={termLabel(term, language)} className={`rounded-xl border p-3 ${small ? "border-[#e7e4dc] bg-[#f8f7f3]" : "border-[#e0ddd5] bg-[#fbfaf8]"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <h3 className="text-sm font-semibold text-[#24312d]">{termLabel(term, language)}{state !== "ahead" && <span className="ml-1.5 rounded-full bg-[#eeece6] px-1.5 py-0.5 text-[10px] font-medium text-[#5d6561]">{state === "past" ? t.past : t.current}</span>}</h3>
        {list.length > 0 && <span className={`text-xs tabular-nums ${summary.over ? "font-semibold text-[#8c352c]" : "text-[#5d6561]"}`}>{fill(t.credits, { n: summary.credits })}</span>}
      </div>
      {summary.over && <p className="mt-1 text-[11px] text-[#8c352c]">{fill(t.over, { limit: summary.limit })}</p>}
      {summary.partTime && state === "ahead" && <p className="mt-1 text-[11px] text-[#8a5a17]">{t.partTime}</p>}
      {summary.unknown.length > 0 && <p className="mt-1 text-[11px] text-[#646c68]">{fill(t.creditsUnknown, { n: summary.unknown.length })}</p>}
      {list.length > 0 && <ul className="mt-2 space-y-1.5">{list.map((id) => <CourseRow key={id} id={id} term={term} info={info[id]} issues={check.issues[`${term}|${id}`] ?? []} {...rowProps} />)}</ul>}
      <AddCourse language={language} full={list.length >= MAX_PER_TERM} onAdd={(id) => place(id, term)} />
    </section>;
  };

  return <main className="min-h-screen bg-[#f5f3ef] text-[#202728] print:bg-white">
    <div className="print:hidden"><SiteHeader language={language} onLanguage={switchLanguage} current="roadmap" /></div>
    <div className="mx-auto max-w-6xl px-5 pb-16 pt-8 sm:px-8 print:hidden">
      <p className="text-[11px] font-semibold uppercase tracking-[.17em] text-[#a34a39]">{t.eyebrow}</p>
      <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">{t.title}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5d6561]">{t.intro}</p>

      <section className="mt-6 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-medium text-[#5d6561]">{t.start}<select value={roadmap.start} onChange={(event) => setStart(event.target.value)} className="min-h-9 rounded-lg border border-[#dedbd3] bg-white px-2 text-sm text-[#202728]">{starts.map((term) => <option key={term} value={term}>{termLabel(term, language)}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-medium text-[#5d6561]">{t.years}<select value={roadmap.years} onChange={(event) => setYears(Number(event.target.value))} className="min-h-9 rounded-lg border border-[#dedbd3] bg-white px-2 text-sm text-[#202728]">{Array.from({ length: MAX_YEARS - MIN_YEARS + 1 }, (_, index) => MIN_YEARS + index).map((years) => <option key={years} value={years}>{years}</option>)}</select></label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={fillTaken} className="min-h-9 rounded-lg border border-[#536d64] px-3 text-xs font-semibold text-[#273c38] hover:bg-[#edf3ef]">{t.fillTaken}</button>
            <button type="button" onClick={fillPlan} className="min-h-9 rounded-lg border border-[#536d64] px-3 text-xs font-semibold text-[#273c38] hover:bg-[#edf3ef]">{t.fillPlan}</button>
            <button type="button" onClick={() => window.print()} className="min-h-9 rounded-lg bg-[#273c38] px-3 text-xs font-semibold text-white hover:bg-[#1d302c]">{t.print}</button>
            {roadmapHasCourses(roadmap) && <button type="button" onClick={() => { if (window.confirm(t.clearConfirm)) update({ ...emptyRoadmap(roadmap.start), years: roadmap.years }); }} className="min-h-9 rounded-lg px-3 text-xs font-medium text-[#8b5148] hover:bg-[#f5e9e5]">{t.clear}</button>}
          </div>
        </div>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className={`font-semibold ${check.total >= DEGREE_CREDITS ? "text-[#315c43]" : "text-[#24312d]"}`}>{fill(t.total, { n: check.total })}</span>
          <span className="text-[#48534f]">{fill(t.genEdDone, { n: filledRows, m: rows.length })}</span>
          {cs && <span className="text-[#48534f]">{fill(t.majorShort, { n: cs.done, m: cs.lines.length })}</span>}
          <span className={issueCount ? "text-[#8a5a17]" : "text-[#315c43]"}>{issueCount ? fill(t.issues, { n: issueCount }) : t.noIssues}</span>
        </p>
        {notice && <p role="status" className="mt-2 text-xs text-[#315c43]">{notice}</p>}
        <p className="mt-2 text-[11px] leading-5 text-[#646c68]">{t.printNote}</p>
      </section>

      <section className="mt-5 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-sm font-semibold">{t.earlierTitle}</h2>{roadmap.earlier.length > 0 && <span className="text-xs tabular-nums text-[#5d6561]">{fill(t.credits, { n: check.earlierCredits })}</span>}</div>
        <p className="mt-1 text-[11px] leading-5 text-[#646c68]">{t.earlierHint}</p>
        {roadmap.earlier.length > 0 && <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">{roadmap.earlier.map((id) => <CourseRow key={id} id={id} term={null} info={info[id]} issues={[]} {...rowProps} />)}</ul>}
        <div className="max-w-sm"><AddCourse language={language} full={false} onAdd={(id) => place(id, "earlier")} /></div>
      </section>

      {Array.from({ length: roadmap.years }, (_, index) => {
        const terms = yearTerms(roadmap.start, index);
        return <section key={index} className="mt-6">
          <h2 className="font-serif text-2xl">{fill(t.year, { n: index + 1 })} <span className="text-base text-[#646c68]">· {Number(roadmap.start.slice(0, 4)) + index}–{Number(roadmap.start.slice(0, 4)) + index + 1}</span></h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {termCard(terms.fall)}
            {termCard(terms.spring)}
            <div className="grid content-start gap-3">{termCard(terms.winter)}{termCard(terms.summer)}</div>
          </div>
        </section>;
      })}

      <section className="mt-8 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-4 sm:p-5">
        <h2 className="font-serif text-2xl">{t.majorTitle}</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-medium text-[#5d6561]">{t.majorLabel}<select value={roadmap.major ? "CS" : ""} onChange={(event) => update({ ...roadmap, major: event.target.value === "CS" ? { id: "CS", track: roadmap.major?.track ?? "general" } : undefined })} className="min-h-9 rounded-lg border border-[#dedbd3] bg-white px-2 text-sm text-[#202728]"><option value="">{t.majorNone}</option><option value="CS">{t.majorCs}</option></select></label>
          {roadmap.major && <label className="grid gap-1 text-xs font-medium text-[#5d6561]">{t.trackLabel}<select value={roadmap.major.track} onChange={(event) => update({ ...roadmap, major: { id: "CS", track: event.target.value as CsTrack } })} className="min-h-9 rounded-lg border border-[#dedbd3] bg-white px-2 text-sm text-[#202728]">{CS_TRACKS.map((track) => <option key={track} value={track}>{TRACK_NAMES[track][language]}</option>)}</select></label>}
          {cs && <span className={`pb-2 text-sm font-semibold ${cs.done === cs.lines.length ? "text-[#315c43]" : "text-[#24312d]"}`}>{fill(t.majorDone, { n: cs.done, m: cs.lines.length })}</span>}
        </div>
        {!cs && <p className="mt-3 text-xs leading-5 text-[#646c68]">{t.majorPrompt}</p>}
        {cs && <>
          <ul className="mt-3 divide-y divide-[#ece9e2] border-y border-[#ece9e2]">{cs.lines.map((item, index) => <li key={item.key} className="py-2.5">
            {(index === 0 || cs.lines[index - 1]!.group !== item.group) && <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-[#9a5040]">{fill(t.groups[item.group], { track: TRACK_NAMES[roadmap.major!.track][language] })}</p>}
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[#24312d]"><span aria-hidden="true" className={`mr-1.5 font-semibold ${item.ok ? "text-[#315c43]" : item.have > 0 ? "text-[#8a5a17]" : "text-[#b0aca3]"}`}>{item.ok ? "✓" : item.have > 0 ? "◐" : "○"}</span>{item.label[language]}</p>
              {item.courses.length > 0 && <p className="mt-0.5 text-xs text-[#5d6561]">{item.courses.map((course) => `${course.id} · ${course.term ? termLabel(course.term, language) : t.genEdBefore}`).join(language === "zh" ? "，" : ", ")}</p>}
              {item.note && <p className="mt-0.5 text-[11px] text-[#646c68]">{item.note[language]}</p>}
            </div>
            <span className={`shrink-0 text-xs tabular-nums ${item.ok ? "text-[#315c43]" : "text-[#8a5a17]"}`}>{fill(t.progress, { have: item.have, need: item.need, unit: item.unit === "credits" ? t.creditUnit : item.unit === "areas" ? t.areaUnit : item.need === 1 ? t.courseOne : t.courseUnit })}</span>
            </div>
          </li>)}</ul>
          <h3 className="mt-5 text-sm font-semibold">{t.benchmarkTitle}</h3>
          <ul className="mt-2 space-y-2">{benchmarks.map((item) => {
            const list = item.missing.map((text) => text[language]).join(language === "zh" ? "、" : ", ");
            const tone = item.missing.length ? "border-[#ead8b5] bg-[#fff8e8] text-[#745424]" : item.term ? "border-[#cddbd1] bg-[#edf3ef] text-[#315c43]" : "border-[#e0ddd5] bg-white text-[#48534f]";
            return <li key={item.at} className={`rounded-lg border px-3 py-2 text-xs leading-5 ${tone}`}>
              <span className="font-semibold">{item.at} {t.creditUnit}</span> · {item.term ? fill(t.benchmarkReached, { at: item.at, term: termLabel(item.term, language) }) : fill(t.benchmarkNotReached, { at: item.at })}{" "}
              {item.term ? (item.missing.length ? fill(t.benchmarkMissing, { list }) : t.benchmarkOk) : (item.missing.length ? fill(t.benchmarkUnplanned, { list }) : t.benchmarkPlanned)}
            </li>;
          })}</ul>
          <p className="mt-3 text-[11px] leading-5 text-[#646c68]">{t.majorNotes}</p>
        </>}
      </section>

      <section className="mt-8 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-4 sm:p-5">
        <h2 className="font-serif text-2xl">{t.genEdTitle}</h2>
        <p className="mt-1 text-[11px] leading-5 text-[#646c68]">{t.genEdHint}</p>
        <ul className="mt-3 divide-y divide-[#ece9e2] border-y border-[#ece9e2]">{rows.map((row, index) => <li key={index} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 text-sm">
          <span className="text-[#48534f]">{genEdName(row.need, language)}</span>
          {row.id ? <span><span className="font-semibold text-[#24312d]">{row.id}</span> <span className="text-xs text-[#646c68]">· {row.term ? termLabel(row.term, language) : t.genEdBefore}</span></span> : <span className="text-xs font-semibold text-[#8a5a17]">{t.genEdMissing}</span>}
        </li>)}</ul>
      </section>
    </div>
    <RoadmapPrint roadmap={roadmap} info={info} check={check} rows={rows} cs={cs} benchmarks={benchmarks} />
  </main>;
}
