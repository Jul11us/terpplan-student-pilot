"use client";

import { useState } from "react";
import { parsePastedSchedule } from "@/lib/testudo-import";
import { readTaken, writeTaken } from "@/lib/taken-courses";

export type ImportedCourse = { courseId: string; courseTitle: string; pinnedSectionId: string };
type Found = { courseId: string; section: string; title: string | null; problem: "course" | "section" | null };
type CourseReply = { course?: { name?: unknown }; sections?: Array<{ section_id?: string; number?: string }> };

const copy = {
  en: {
    open: "Import your schedule from Testudo →",
    steps: "On your Testudo schedule page (or its Print Schedule view), select all with Ctrl+A (⌘A on a Mac), or drag over the course list, then copy and paste it here. You can also type course and section, like CMSC131 0302.",
    privacy: "Only course codes and section numbers are read, in this browser. Your name and UID are not saved or sent.",
    placeholder: "Paste here",
    read: "Read sections",
    reading: "Looking up sections…",
    nothing: "No course sections found. Copy the page again, or type them like CMSC131 0302.",
    noTerm: "TerpPlan doesn't have {term} yet.",
    found: "{n} of {total} found for {term}:",
    noCourse: "not offered this term, skipped",
    noSection: "section {section} not found, skipped",
    replace: "Replace this plan",
    add: "Add to this plan",
    load: "Load into this plan",
    switchLoad: "Switch to {term} and load it",
    otherTerm: "This is your {pasted} schedule; you're planning {term}.",
    asTaken: "Count them as courses you're taking now",
    takenDone: "Added to courses you've taken, so prerequisites for {term} are checked against them.",
    tooMany: "A plan can hold 10 courses; only the first {n} were loaded.",
    cancel: "Cancel",
    failed: "Sections could not be looked up. Try again.",
  },
  zh: {
    open: "从 Testudo 导入课表 →",
    steps: "在 Testudo 课表页（或 Print Schedule 打印页）按 Ctrl+A 全选（Mac 上是 ⌘A），或者用鼠标拖选课程列表，复制后粘贴到这里。也可以直接输入课程和班号，比如 CMSC131 0302。",
    privacy: "只在这个浏览器里读取课程号和班号，你的姓名和 UID 不会保存，也不会上传。",
    placeholder: "粘贴到这里",
    read: "识别课程",
    reading: "正在查找班次…",
    nothing: "没有识别到课程和班号。请重新复制，或按 CMSC131 0302 的格式输入。",
    noTerm: "TerpPlan 还没有 {term} 的数据。",
    found: "{term} 找到 {n}/{total} 门：",
    noCourse: "这学期没有开这门课，已跳过",
    noSection: "没有找到 {section} 班，已跳过",
    replace: "替换当前方案",
    add: "加入当前方案",
    load: "导入当前方案",
    switchLoad: "切换到 {term} 并导入",
    otherTerm: "这是你 {pasted} 的课表，当前在排 {term}。",
    asTaken: "算作正在修的课程",
    takenDone: "已加入“修过的课程”，排 {term} 时会用它们检查先修课。",
    tooMany: "每个方案最多 10 门课，只导入了前 {n} 门。",
    cancel: "取消",
    failed: "班次查找失败，请再试一次。",
  },
} as const;

export default function TestudoImport({ term, terms, termName, planCount, language, onImport }: {
  term: string;
  terms: string[];
  termName: (term: string) => string;
  planCount: number;
  language: "en" | "zh";
  onImport: (courses: ImportedCourse[], replace: boolean, term: string) => void;
}) {
  const t = copy[language];
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ term: string; found: Found[]; codes: string[] } | null>(null);

  const close = () => { setOpen(false); setText(""); setResult(null); setNote(""); };

  const read = async () => {
    setNote(""); setResult(null);
    const pasted = parsePastedSchedule(text);
    if (!pasted.sections.length) { setNote(t.nothing); return; }
    const importTerm = pasted.term ?? term;
    if (terms.length && !terms.includes(importTerm)) { setNote(t.noTerm.replace("{term}", termName(importTerm))); return; }
    setBusy(true);
    try {
      // One course at a time, each tried twice: several lookups at once can make Testudo turn some away.
      const found: Found[] = [];
      for (const { courseId, section } of pasted.sections) {
        const url = `/api/course?id=${encodeURIComponent(courseId)}&term=${encodeURIComponent(importTerm)}`;
        let response = await fetch(url);
        if (response.status >= 500) { await new Promise((done) => setTimeout(done, 1500)); response = await fetch(url); }
        if (response.status === 404) { found.push({ courseId, section, title: null, problem: "course" }); continue; }
        if (!response.ok) throw new Error("lookup");
        const reply = await response.json() as CourseReply;
        const id = `${courseId}-${section}`;
        const listed = (reply.sections ?? []).some((item) => (item.section_id ?? `${courseId}-${item.number ?? ""}`).toUpperCase() === id);
        found.push({ courseId, section, title: typeof reply.course?.name === "string" ? reply.course.name : courseId, problem: listed ? null : "section" });
      }
      setResult({ term: importTerm, found, codes: pasted.sections.map((item) => item.courseId) });
    } catch {
      setNote(t.failed);
    } finally {
      setBusy(false);
    }
  };

  const load = (replace: boolean) => {
    if (!result) return;
    const courses = result.found.filter((item) => !item.problem).map((item) => ({ courseId: item.courseId, courseTitle: item.title ?? item.courseId, pinnedSectionId: `${item.courseId}-${item.section}` }));
    const room = replace || result.term !== term ? 10 : 10 - planCount;
    onImport(courses.slice(0, Math.max(0, room)), replace, result.term);
    close();
    if (courses.length > room) setNote(t.tooMany.replace("{n}", String(Math.max(0, room))));
  };

  // Last term's (or this term's) registered courses count as in progress when planning a later term.
  const markTaken = () => {
    if (!result) return;
    const current = readTaken();
    const inProgress = [...new Set([...(current?.inProgress ?? []), ...result.codes])].filter((code) => !current?.completed.includes(code));
    writeTaken({ completed: current?.completed ?? [], inProgress, ...(current?.credits === undefined ? {} : { credits: current.credits }), source: "manual" });
    close();
    setNote(t.takenDone.replace("{term}", termName(term)));
  };

  if (!open) return <div className="text-xs">
    <button type="button" onClick={() => { setOpen(true); setNote(""); }} className="font-medium text-[#a34a39] hover:underline">{t.open}</button>
    {note && <p role="status" className="mt-1 text-[#48534f]">✓ {note}</p>}
  </div>;

  const okCount = result?.found.filter((item) => !item.problem).length ?? 0;
  const button = "rounded-lg px-3 py-2 text-xs font-semibold";
  return <div className="text-xs text-[#48534f]">
    <p className="leading-5">{t.steps}</p>
    <textarea value={text} onChange={(event) => { setText(event.target.value); setResult(null); }} rows={4} placeholder={t.placeholder} aria-label={t.open} className="mt-2 w-full rounded-lg border border-[#dedbd3] bg-white px-3 py-2 text-xs text-[#273c38]" />
    <p className="mt-1 text-[11px] leading-5 text-[#646c68]">{t.privacy}</p>
    {note && <p role="alert" className="mt-2 rounded-lg bg-[#fff8e8] px-3 py-2 leading-5 text-[#745424]">{note}</p>}
    {result && <div role="status" className="mt-2 rounded-lg border border-[#e0ddd5] bg-white px-3 py-2">
      <p className="font-semibold">{t.found.replace("{n}", String(okCount)).replace("{total}", String(result.found.length)).replace("{term}", termName(result.term))}</p>
      <ul className="mt-1 grid gap-0.5">{result.found.map((item) => <li key={item.courseId} className={item.problem ? "text-[#8f4538]" : "text-[#315c43]"}>
        {item.problem ? "✕" : "✓"} {item.courseId} {item.section}{item.problem ? ` · ${item.problem === "course" ? t.noCourse : t.noSection.replace("{section}", item.section)}` : item.title && item.title !== item.courseId ? ` · ${item.title}` : ""}
      </li>)}</ul>
      {result.term !== term && <p className="mt-2 leading-5">{t.otherTerm.replace("{pasted}", termName(result.term)).replace("{term}", termName(term))}</p>}
    </div>}
    <div className="mt-2 flex flex-wrap gap-2">
      {!result && <button type="button" onClick={() => void read()} disabled={busy || !text.trim()} className={`${button} bg-[#273c38] text-white hover:bg-[#1d302c] disabled:opacity-50`}>{busy ? t.reading : t.read}</button>}
      {result && result.term === term && okCount > 0 && (planCount ? <>
        <button type="button" onClick={() => load(true)} className={`${button} bg-[#273c38] text-white hover:bg-[#1d302c]`}>{t.replace}</button>
        <button type="button" onClick={() => load(false)} className={`${button} border border-[#536d64] bg-white text-[#273c38]`}>{t.add}</button>
      </> : <button type="button" onClick={() => load(true)} className={`${button} bg-[#273c38] text-white hover:bg-[#1d302c]`}>{t.load}</button>)}
      {result && result.term !== term && <>
        {result.term < term && <button type="button" onClick={markTaken} className={`${button} bg-[#273c38] text-white hover:bg-[#1d302c]`}>{t.asTaken}</button>}
        {okCount > 0 && <button type="button" onClick={() => load(true)} className={`${button} border border-[#536d64] bg-white text-[#273c38]`}>{t.switchLoad.replace("{term}", termName(result.term))}</button>}
      </>}
      <button type="button" onClick={close} className={`${button} border border-[#d9d6ce] bg-white text-[#48534f]`}>{t.cancel}</button>
    </div>
  </div>;
}
