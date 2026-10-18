"use client";

// The four-year plan's checks beyond Computer Science: any major's catalog requirements (lib/major-check.ts), and
// the unfinished requirements of the student's own degree audit (lib/audit-plan.ts).

import Link from "next/link";
import { useState } from "react";
import { auditNeedsFrom, writeAuditNeeds, type AuditCheck, type SavedAuditNeeds } from "@/lib/audit-plan";
import { parseDegreeAudit } from "@/lib/degree-audit";
import { extractDegreeAuditText } from "@/lib/degree-audit-pdf";
import { genEdParam } from "@/lib/gened-categories";
import type { MajorCheck, PlanCourse } from "@/lib/major-check";
import type { Program } from "@/lib/programs";
import { countUse } from "@/lib/usage";

type Language = "en" | "zh";
const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

const copy = {
  en: {
    loading: "Loading the catalog's requirements…", loadError: "The catalog's requirements could not be loaded. Try again later.",
    noTable: "The catalog does not list this major's courses in a table, so nothing here can be checked automatically. Use the degree audit check below, or read the requirements in the catalog.",
    catalog: "Read this major in the catalog", apply: "This major is selective or needs an application; its gateway courses usually need a minimum grade.",
    parts: "Which parts apply to you", partsHint: "From the catalog's headings: core parts are on; switch on your track, concentration, or degree (B.A. or B.S.).", core: "Core requirements",
    checkYourself: "Check yourself", checked: "Checked", tick: "I have checked this one and planned for it", written: "Written only in words in the catalog: compare your courses with it.",
    course: "course", courses: "courses", credit: "credit", credits: "credits",
    maybe: "Plan courses that may count: {list} ({have} / {need} {unit})",
    unlisted: "The catalog's total is {n} credits more than its tables list; those rules are written only in words.",
    notes: "From the catalog snapshot of {date}. Only whether a course is in the plan is checked, not grades or GPA, and conditions written beside the catalog's tables can be missed. Your degree audit and your advisor have the final word.",
    auditTitle: "Check against your degree audit",
    auditIntro: "Upload your uAchieve degree audit PDF: the courses this plan adds after the audit are checked against the requirements it says are unfinished. Works for any major.",
    auditPrivacy: "The PDF is read in this browser. Only the unfinished requirements and your course codes are kept, in this browser; they are not synced to your account.",
    upload: "Choose degree audit PDF", replace: "Upload a newer audit", reading: "Reading the PDF in your browser…",
    bad: "This PDF could not be read. Export a text-based audit PDF from uAchieve and try again.", empty: "No requirements or courses were found in this PDF. Check that it is a uAchieve degree audit.",
    from: "Audit from {date} · {n} unfinished requirements", fromUndated: "Your audit · {n} unfinished requirements", clear: "Clear", allMet: "This audit lists no unfinished requirements.",
    summary: "The plan fills {done} of {total}", summaryOpen: "{n} to check yourself",
    later: "After the audit, the plan adds {n} courses, {credits} credits ({upper} at the 300 level or above); compare them with the credit requirements below.",
    fillTaken: "Add the {n} courses this audit lists as taken or in progress", needs: "Audit says: {need}", planned: "In the plan: {list}",
    findGenEd: "Find {code} courses →", other: "Not tied to specific courses (credits, GPA, residency…): check it yourself.",
    place: "Add to a term:", placeFor: "Choose a term for {id}", moreCourses: "and {n} more",
  },
  zh: {
    loading: "正在读取 catalog 里的专业要求…", loadError: "暂时读不到 catalog 里的专业要求，请稍后再试。",
    noTable: "catalog 没有用表格列出这个专业的课程，这里没法自动检查。可以用下面的 degree audit 核对，或到 catalog 页面阅读要求。",
    catalog: "在 catalog 查看这个专业", apply: "这个专业需要申请或有门槛，gateway 课通常有最低成绩要求。",
    parts: "哪些部分适用于你", partsHint: "来自 catalog 里的小标题：核心部分默认勾选；请勾选你的方向、concentration 或学位类型（B.A. / B.S.）。", core: "核心要求",
    checkYourself: "需要自己核对", checked: "已核对", tick: "我核对过了，这一项已经排好", written: "catalog 里只用文字描述，请对照原文自己核对。",
    course: "门", courses: "门", credit: "学分", credits: "学分",
    maybe: "规划里可能算进去的：{list}（{have} / {need} {unit}）",
    unlisted: "catalog 写的总学分比表格里列出的多 {n} 学分，这部分要求只用文字描述。",
    notes: "来自 {date} 的 catalog 数据。这里只看课有没有排进规划，不看成绩和 GPA；写在 catalog 表格旁边的条件也可能漏掉。以 degree audit 和 advisor 为准。",
    auditTitle: "按 degree audit 核对",
    auditIntro: "上传 uAchieve 的 degree audit PDF，用审计里还没完成的要求，核对这份规划在审计之后排的课。任何专业都能用。",
    auditPrivacy: "PDF 只在你的浏览器里读取。只保留未完成的要求和课程编号，存在这台设备的浏览器里，不会同步到账号。",
    upload: "选择 degree audit PDF", replace: "换一份新的审计", reading: "正在浏览器中读取 PDF…",
    bad: "无法读取这个 PDF。请从 uAchieve 导出含文字的审计 PDF 后重试。", empty: "这个 PDF 里没有读到审计要求或课程，请确认是 uAchieve 的 degree audit。",
    from: "{date}的审计 · {n} 项未完成要求", fromUndated: "你的审计 · {n} 项未完成要求", clear: "清除", allMet: "这份审计没有列出未完成的要求。",
    summary: "规划能补上 {done} / {total} 项", summaryOpen: "{n} 项需要自己核对",
    later: "审计之后，规划里还有 {n} 门课、{credits} 学分（300 级以上 {upper} 学分），可以对照下面的学分要求。",
    fillTaken: "把审计里已修和在修的 {n} 门课填进规划", needs: "审计要求：{need}", planned: "已排：{list}",
    findGenEd: "去找 {code} 的课 →", other: "这一项不对应具体课程（学分、GPA、住校等），请自己核对。",
    place: "排进学期：", placeFor: "把 {id} 排进哪个学期", moreCourses: "等另外 {n} 门",
  },
} as const;

const mark = (ok: boolean | null, have: number) => ok === true ? ["✓", "text-[#315c43]"] : ok === null ? ["?", "text-[#8a5a17]"] : have > 0 ? ["◐", "text-[#8a5a17]"] : ["○", "text-[#b0aca3]"];

// One of the terms a course can be added to, as the page words it ("Fall 2027 · prerequisites not planned before it").
export type PlaceChoice = { value: string; label: string; disabled: boolean };
// How many courses a requirement offers to add; the page reads course details for these.
export const PLACE_LIMIT = 6;

// Courses that would meet a requirement, each a chip that opens the list of terms to add it to. The chip is drawn
// by hand and the browser's own menu (an invisible select over it) does the choosing, so it works with a keyboard,
// a screen reader and a phone's picker.
export function PlaceChips({ ids, language, choicesFor, onPlace }: { ids: string[]; language: Language; choicesFor: (id: string) => PlaceChoice[]; onPlace: (id: string, to: string) => void }) {
  const t = copy[language];
  if (!ids.length) return null;
  return <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
    <span className="text-[11px] text-[#646c68]">{t.place}</span>
    {ids.slice(0, PLACE_LIMIT).map((id) => <span key={id} className="relative inline-flex min-h-7 items-center rounded-full border border-[#cfdcd3] bg-white px-2.5 text-[11px] font-semibold text-[#273c38] transition-colors hover:border-[#536d64] hover:bg-[#edf3ef] focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#536d64]">
      <span aria-hidden="true" className="mr-1 text-[#536d64]">+</span>{id}
      <select value="" aria-label={fill(t.placeFor, { id })} onChange={(event) => { if (event.target.value) onPlace(id, event.target.value); }} className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0">
        <option value="" disabled>{fill(t.placeFor, { id })}</option>
        {choicesFor(id).map((choice) => <option key={choice.value} value={choice.value} disabled={choice.disabled}>{choice.label}</option>)}
      </select>
    </span>)}
    {ids.length > PLACE_LIMIT && <span className="text-[11px] text-[#646c68]">{fill(t.moreCourses, { n: ids.length - PLACE_LIMIT })}</span>}
  </div>;
}

const unitText = (language: Language, unit: "courses" | "credits", need: number) => unit === "credits" ? (need === 1 ? copy[language].credit : copy[language].credits) : need === 1 ? copy[language].course : copy[language].courses;

export function CatalogMajor({ language, program, failed, check, blocks, onBlocks, onTick, termName, snapshot, choicesFor, onPlace }: {
  language: Language; program: Program | null; failed: boolean; check: MajorCheck | null; blocks: Set<number>;
  onBlocks: (next: number[]) => void; onTick: (key: string, on: boolean) => void; termName: (term: string | null) => string; snapshot: string;
  choicesFor: (id: string) => PlaceChoice[]; onPlace: (id: string, to: string) => void;
}) {
  const t = copy[language];
  if (!program || !check) return <p role="status" className="mt-3 text-xs text-[#646c68]">{failed ? t.loadError : t.loading}</p>;
  const placed = (courses: PlanCourse[]) => courses.map((course) => `${course.id} · ${termName(course.term)}`).join(language === "zh" ? "，" : ", ");
  const shownBlocks = new Set(check.lines.map((line) => line.block));
  return <>
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <a href={program.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-6 items-center font-medium text-[#a34a39] hover:underline">{t.catalog} ↗</a>
      {program.apply && <span className="text-[#745424]">{t.apply}</span>}
    </div>
    {!program.items.length && <p className="mt-3 rounded-lg bg-[#fff8e8] px-3 py-2 text-xs leading-5 text-[#745424]">{t.noTable}</p>}
    {program.blocks.length > 1 && <div className="mt-3 rounded-xl border border-[#e3e0d8] bg-white p-3">
      <p className="text-xs font-semibold text-[#48534f]">{t.parts}</p>
      <p className="mt-0.5 text-[11px] leading-4 text-[#646c68]">{t.partsHint}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{program.blocks.map((block, index) => <label key={index} className="inline-flex min-h-6 items-center gap-2 text-xs text-[#48534f]">
        <input type="checkbox" checked={blocks.has(index)} onChange={() => { const next = new Set(blocks); if (next.has(index)) next.delete(index); else next.add(index); onBlocks([...next].sort((a, b) => a - b)); }} />
        {block.title || t.core}{block.total ? <span className="text-[#646c68]">· {block.total} {t.credits}</span> : null}
      </label>)}</div>
    </div>}
    {check.lines.length > 0 && <ul className="mt-3 divide-y divide-[#ece9e2] border-y border-[#ece9e2]">{check.lines.map((line, position) => {
      const previous = check.lines[position - 1];
      const newBlock = shownBlocks.size > 1 && line.block !== previous?.block;
      const [symbol, tone] = mark(line.open && !line.ok ? null : line.ok, line.have);
      // A required course with alternatives names them all ("MATH120 / MATH140"); the label names only the first.
      const title = line.kind === "course" && line.listed.length > 1 ? line.listed.map((option) => option.join(" + ")).join(" / ") : line.label;
      return <li key={line.index} className="py-2.5">
        {newBlock && <p className="mb-1 text-xs font-semibold text-[#24312d]">{program.blocks[line.block]?.title || t.core}</p>}
        {line.section && (newBlock || line.section !== previous?.section) && <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-[#9a5040]">{line.section}</p>}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[#24312d]"><span aria-hidden="true" className={`mr-1.5 font-semibold ${tone}`}>{symbol}</span>{title}{line.credits ? <span className="ml-1.5 whitespace-nowrap text-xs text-[#646c68]">· {line.credits} {unitText(language, "credits", line.credits)}</span> : null}</p>
            {line.courses.length > 0 && <p className="mt-0.5 text-xs text-[#5d6561]">{placed(line.courses)}</p>}
            {!line.ok && !line.open && <PlaceChips ids={line.place} language={language} choicesFor={choicesFor} onPlace={onPlace} />}
            {line.open && <>
              {!line.ok && <p className="mt-0.5 text-[11px] text-[#646c68]">{t.written}</p>}
              {line.maybe.length > 0 && <p className="mt-0.5 text-[11px] text-[#536d64]">{fill(t.maybe, { list: placed(line.maybe), have: Math.min(line.maybeHave, line.maybeNeed), need: line.maybeNeed, unit: unitText(language, line.maybeUnit, line.maybeNeed) })}</p>}
              <label className="mt-1 inline-flex min-h-6 items-center gap-2 text-[11px] text-[#48534f]"><input type="checkbox" checked={line.ok} onChange={(event) => onTick(line.key, event.target.checked)} />{t.tick}</label>
            </>}
          </div>
          <span className={`shrink-0 text-xs tabular-nums ${line.ok ? "text-[#315c43]" : "text-[#8a5a17]"}`}>{line.open ? (line.ok ? t.checked : t.checkYourself) : `${line.have} / ${line.need} ${unitText(language, "courses", line.need)}`}</span>
        </div>
      </li>;
    })}</ul>}
    {check.unlistedCredits > 0 && <p className="mt-3 text-[11px] leading-5 text-[#745424]">{fill(t.unlisted, { n: check.unlistedCredits })}</p>}
    <p className="mt-3 text-[11px] leading-5 text-[#646c68]">{fill(t.notes, { date: snapshot })}</p>
  </>;
}

// The audit check. The PDF is read here, in the browser; only what lib/audit-plan.ts keeps is stored.
export function AuditSection({ language, saved, check, planIds, now, termName, onSaved, onFill, choicesFor, onPlace }: {
  language: Language; saved: SavedAuditNeeds | null; check: AuditCheck | null; planIds: Set<string>; now: string;
  termName: (term: string | null) => string; onSaved: (next: SavedAuditNeeds | null) => void; onFill: (entries: Array<{ id: string; term: string | null }>) => void;
  choicesFor: (id: string) => PlaceChoice[]; onPlace: (id: string, to: string) => void;
}) {
  const t = copy[language];
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  // The courses of the audit just read, until they are added to the plan (they are not stored).
  const [taken, setTaken] = useState<Array<{ id: string; term: string | null }>>([]);
  const read = async (file: File | undefined) => {
    if (!file) return;
    setReading(true); setError("");
    try {
      const text = await extractDegreeAuditText(file);
      if (!text.trim()) throw new Error("text");
      const audit = parseDegreeAudit(text);
      const needs = auditNeedsFrom(audit);
      if (!needs) { setError(t.empty); return; }
      writeAuditNeeds(needs);
      onSaved(needs);
      countUse("audit");
      setTaken([
        ...audit.completedCourseIds.map((id) => ({ id, term: audit.courseTerms[id] ?? null })),
        ...audit.inProgressCourseIds.map((id) => ({ id, term: audit.courseTerms[id] ?? now })),
      ].filter((entry) => /^[A-Z]{4}\d{3}[A-Z]?$/.test(entry.id)));
    } catch { setError(t.bad); }
    finally { setReading(false); }
  };
  const missing = taken.filter((entry) => !planIds.has(entry.id));
  const savedAt = saved?.savedAt ? new Date(saved.savedAt) : null;
  const date = savedAt && !Number.isNaN(savedAt.getTime()) ? savedAt.toLocaleDateString(language === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "short", day: "numeric" }) : "";
  const placed = (courses: PlanCourse[]) => courses.map((course) => `${course.id} · ${termName(course.term)}`).join(language === "zh" ? "，" : ", ");
  const uploadLabel = (text: string, primary: boolean) => <label className={`inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-semibold ${primary ? "bg-[#273c38] text-white hover:bg-[#1d302c]" : "border border-[#536d64] text-[#273c38] hover:bg-[#edf3ef]"} ${reading ? "opacity-60" : "cursor-pointer"} focus-within:ring-2 focus-within:ring-[#a34a39]/30`}>
    <input type="file" accept="application/pdf,.pdf" aria-label={text} disabled={reading} onChange={(event) => { void read(event.target.files?.[0]); event.target.value = ""; }} className="sr-only" />{text}
  </label>;

  return <section className="mt-8 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-4 sm:p-5">
    <h2 className="font-serif text-2xl">{t.auditTitle}</h2>
    <p className="mt-1 max-w-3xl text-xs leading-5 text-[#646c68]">{t.auditIntro}</p>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {saved ? <>
        <span className="text-sm text-[#24312d]">{fill(date ? t.from : t.fromUndated, { date, n: saved.requirements.length })}</span>
        {uploadLabel(t.replace, false)}
        <button type="button" onClick={() => { writeAuditNeeds(null); onSaved(null); setTaken([]); }} className="min-h-9 rounded-lg px-3 text-xs font-medium text-[#8b5148] hover:bg-[#f5e9e5]">{t.clear}</button>
      </> : uploadLabel(t.upload, true)}
      {reading && <span role="status" className="text-xs text-[#5d6561]">{t.reading}</span>}
    </div>
    {error && <p role="alert" className="mt-3 rounded-lg bg-[#fff0ec] px-3 py-2 text-xs text-[#8c352c]">{error}</p>}
    {missing.length > 0 && <button type="button" onClick={() => { onFill(missing); setTaken([]); }} className="mt-3 min-h-9 rounded-lg border border-[#536d64] px-3 text-xs font-semibold text-[#273c38] hover:bg-[#edf3ef]">{fill(t.fillTaken, { n: missing.length })}</button>}
    {saved && check && <>
      {check.lines.length ? <p className="mt-3 text-sm font-semibold text-[#24312d]">{fill(t.summary, { done: check.done, total: check.lines.length })}{check.open ? <span className="font-normal text-[#646c68]"> · {fill(t.summaryOpen, { n: check.open })}</span> : null}</p>
        : <p className="mt-3 text-sm text-[#315c43]">{t.allMet}</p>}
      {check.later.length > 0 && <p className="mt-1 text-xs leading-5 text-[#5d6561]">{fill(t.later, { n: check.later.length, credits: check.laterCredits, upper: check.upperCredits })}</p>}
      {check.lines.length > 0 && <ul className="mt-3 divide-y divide-[#ece9e2] border-y border-[#ece9e2]">{check.lines.map((line, index) => {
        const [symbol, tone] = mark(line.ok, line.have);
        const remaining = line.target === null ? 1 : Math.max(1, Math.ceil((line.target - line.have) / (line.unit === "credits" ? 3 : 1)));
        return <li key={index} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[#24312d]"><span aria-hidden="true" className={`mr-1.5 font-semibold ${tone}`}>{symbol}</span>{line.title}</p>
            <p className="mt-0.5 text-[11px] text-[#646c68]">{fill(t.needs, { need: line.need })}{line.genEdCode ? ` · Gen Ed ${line.genEdCode}` : ""}</p>
            {line.courses.length > 0 && <p className="mt-0.5 text-xs text-[#5d6561]">{fill(t.planned, { list: placed(line.courses) })}</p>}
            {line.ok === false && line.kind === "courses" && <PlaceChips ids={line.options.filter((id) => /^[A-Z]{4}\d{3}[A-Z]?$/.test(id))} language={language} choicesFor={choicesFor} onPlace={onPlace} />}
            {line.ok === false && line.kind === "genEd" && line.genEdCode && <Link href={`/plan?gened=${genEdParam([{ code: line.genEdCode, count: remaining }])}`} className="mt-0.5 inline-flex min-h-6 items-center text-[11px] font-medium text-[#536d64] underline underline-offset-2 hover:text-[#273c38]">{fill(t.findGenEd, { code: line.genEdCode })}</Link>}
            {line.kind === "other" && <p className="mt-0.5 text-[11px] text-[#646c68]">{t.other}</p>}
          </div>
          <span className={`shrink-0 text-xs tabular-nums ${line.ok ? "text-[#315c43]" : "text-[#8a5a17]"}`}>{line.ok === null ? t.checkYourself : `${line.have} / ${line.target} ${unitText(language, line.unit, line.target ?? 1)}`}</span>
        </li>;
      })}</ul>}
    </>}
    <p className="mt-3 rounded-lg bg-[#edf3ef] px-3 py-2 text-[11px] leading-5 text-[#315c43]">{t.auditPrivacy}</p>
  </section>;
}
