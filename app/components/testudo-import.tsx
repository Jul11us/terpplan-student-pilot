"use client";

import { useEffect, useRef, useState } from "react";
import { parsePastedSchedule } from "@/lib/testudo-import";
import { coursesFromImport, previewScheduleImport, startImportLookup, type ImportLookup, type ImportedCourse } from "@/lib/import-workflow";
import { readTaken, writeTaken } from "@/lib/taken-courses";
import { weekFromSections, writeMyWeek } from "@/lib/my-week";
import { countUse } from "@/lib/usage";

// Links elsewhere (the empty-room page, My week) open the planner at /plan#import with this box open.
export const IMPORT_HASH = "#import";

export type { ImportedCourse } from "@/lib/import-workflow";

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
    preview: "Plan import preview", mode: "How to import", addMode: "Add or update courses", replaceMode: "Replace the whole plan", replaceHint: "Courses not listed below will be removed from this plan.",
    willAdd: "Add", willUpdate: "Update existing", skip: "Skip", limit: "plan is at the 10-course limit", duplicate: "duplicate course",
    importing: "Import {n} course(s)", partial: "Sections that could not be found are not included when importing or saving.", weekAllFound: "Saving My week uses all found sections, including those skipped from the plan because it is full.", verifiedCount: "Saving My week or marking courses as in progress uses all {n} found courses.",
    retry: "Retry failed lookups ({n})", lookupFailed: "lookup failed; retry available", pending: "looking up…", stop: "Stop lookup", stopped: "Lookup stopped. Results already found are kept; retry to check the rest.",
    cancel: "Cancel",
    close: "Done",
    failed: "Sections could not be looked up. Try again.",
    week: "Save as my week",
    weekSaved: "Saved as my week",
    weekOpen: "Open My week →",
    weekHint: "My week shows each day's classes with map links, works offline, and suggests empty rooms to sit in between classes.",
    weekFailed: "This browser could not save it (storage is blocked).",
    takenMarked: "Counted as courses you're taking",
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
    preview: "导入方案预览", mode: "导入方式", addMode: "加入或更新课程", replaceMode: "替换整个方案", replaceHint: "当前方案里未列在下方的课程会被移除。",
    willAdd: "新增", willUpdate: "更新已有", skip: "跳过", limit: "方案已达到 10 门课上限", duplicate: "重复课程",
    importing: "导入 {n} 门课程", partial: "未查找到的班次不包含在导入或保存的课表中。", weekAllFound: "存到“我的一周”会包含所有查到的班次，包括因方案名额已满而跳过的课程。", verifiedCount: "存到“我的一周”或标为正在修，都只包含查到的这 {n} 门课程。",
    retry: "重试查找失败的课程（{n}）", lookupFailed: "查找失败，可以重试", pending: "正在查找…", stop: "停止查找", stopped: "已停止查找。查到的结果会保留，可以重试继续查找其余课程。",
    cancel: "取消",
    close: "完成",
    failed: "班次查找失败，请再试一次。",
    week: "存到我的一周",
    weekSaved: "已存到我的一周",
    weekOpen: "打开“我的一周” →",
    weekHint: "“我的一周”按天列出每节课和楼的地图链接，没网也能看，还会推荐课间可以去坐的空教室。",
    weekFailed: "这个浏览器存不了（存储被禁用）。",
    takenMarked: "已算作正在修的课程",
  },
} as const;

export default function TestudoImport({ term, terms, termName, planCourseIds, planContext, language, onImport }: {
  term: string;
  terms: string[];
  termName: (term: string, language?: "en" | "zh") => string;
  planCourseIds: string[];
  planContext: string;
  language: "en" | "zh";
  onImport: (courses: ImportedCourse[], replace: boolean, term: string) => void;
}) {
  const t = copy[language];
  // The box mounts after the saved plan is restored, so reading the address here does not affect the first render.
  const [open, setOpen] = useState(() => typeof window !== "undefined" && window.location.hash === IMPORT_HASH);
  const box = useRef<HTMLDivElement>(null);
  const cancelLookup = useRef<(() => void) | null>(null);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [lookup, setLookup] = useState<(ImportLookup & { term: string; context: string }) | null>(null);
  const [mode, setMode] = useState<"add" | "replace">("add");
  const context = JSON.stringify([term, planContext, planCourseIds]);
  // Hide old-plan results in the render before effect cleanup; identical A/B course lists still have
  // different contexts. Only parsed IDs enter the lookup helper, never the pasted name or UID.
  const result = lookup?.context === context ? lookup : null;
  const busy = result?.busy ?? false;
  const planCount = planCourseIds.length;
  const replace = result?.term !== term || !planCount || mode === "replace";
  const preview = previewScheduleImport(result?.found ?? [], planCourseIds, replace);
  const importCourses = coursesFromImport(preview);
  // What was already done with this result: saved as My week, counted as taken.
  const [done, setDone] = useState<{ week?: boolean; taken?: boolean }>({});

  useEffect(() => {
    cancelLookup.current?.(); cancelLookup.current = null;
    // Returning to Plan A after visiting B must not revive A's abandoned loading snapshot.
    /* eslint-disable react-hooks/set-state-in-effect */
    setLookup(null); setNote(""); setDone({});
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => { cancelLookup.current?.(); };
  }, [context]);

  // "/plan#import" (from My week) opens the box on arrival; a link to "#import" on this page opens it too.
  useEffect(() => {
    const fromAddress = () => {
      if (window.location.hash !== IMPORT_HASH) return;
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setOpen(true);
      window.setTimeout(() => {
        box.current?.scrollIntoView({ block: "center", behavior: "smooth" });
        box.current?.querySelector("textarea")?.focus({ preventScroll: true });
      }, 0);
    };
    fromAddress();
    window.addEventListener("hashchange", fromAddress);
    return () => window.removeEventListener("hashchange", fromAddress);
  }, []);

  const clearLookup = () => { cancelLookup.current?.(); cancelLookup.current = null; setLookup(null); setNote(""); setDone({}); };
  const close = () => { clearLookup(); setOpen(false); setText(""); };
  const stop = () => {
    cancelLookup.current?.(); cancelLookup.current = null;
    setLookup((current) => current?.context === context ? { ...current, busy: false, found: current.found.map((item) => item.problem === "pending" ? { ...item, problem: "lookup" } : item) } : current);
    setNote(t.stopped);
  };

  const read = (retry = false) => {
    cancelLookup.current?.();
    setNote(""); setDone({});
    const pasted = parsePastedSchedule(text);
    if (!pasted.sections.length) { setNote(t.nothing); return; }
    const importTerm = retry && result ? result.term : pasted.term ?? term;
    if (terms.length && !terms.includes(importTerm)) { setNote(t.noTerm.replace("{term}", termName(importTerm))); return; }
    cancelLookup.current = startImportLookup(pasted.sections, importTerm, (state) => {
      setLookup({ ...state, term: importTerm, context });
      if (!state.busy && state.found.some((item) => !item.problem)) countUse("import");
    }, { previous: retry ? result?.found : undefined });
  };

  const load = () => {
    if (!result || busy || !importCourses.length) return;
    onImport(importCourses, replace, result.term);
    close();
  };

  // Last term's (or this term's) registered courses count as in progress when planning a later term.
  const markTaken = () => {
    if (!result || busy) return;
    const current = readTaken();
    const codes = result.found.filter((item) => !item.problem).map((item) => item.courseId);
    const inProgress = [...new Set([...(current?.inProgress ?? []), ...codes])].filter((code) => !current?.completed.includes(code));
    writeTaken({ completed: current?.completed ?? [], inProgress, ...(current?.credits === undefined ? {} : { credits: current.credits }), ...(current?.terms ? { terms: current.terms } : {}), source: "manual" });
    const saved = readTaken();
    if (codes.every((code) => saved?.completed.includes(code) || saved?.inProgress.includes(code))) setDone((now) => ({ ...now, taken: true }));
    else setNote(t.weekFailed);
  };

  // The registered sections' times and rooms as My week (which /week and /rooms use for between-class rooms).
  const saveWeek = () => {
    if (!result || busy) return;
    const sections = result.found.filter((item) => !item.problem).map((item) => ({ course_id: item.courseId, course_title: item.title ?? item.courseId, section_id: `${item.courseId}-${item.section}`, meetings: item.meetings }));
    if (writeMyWeek(weekFromSections(sections, result.term, termName(result.term, "en")))) { setDone((now) => ({ ...now, week: true })); countUse("week"); }
    else setNote(t.weekFailed);
  };

  if (!open) return <div className="text-xs">
    <button type="button" onClick={() => { setOpen(true); setNote(""); }} className="min-h-6 font-medium text-[#a34a39] hover:underline">{t.open}</button>
    {note && <p role="status" className="mt-1 text-[#48534f]">✓ {note}</p>}
  </div>;

  const okCount = result?.found.filter((item) => !item.problem).length ?? 0;
  const failedCount = result?.found.filter((item) => item.problem === "lookup").length ?? 0;
  const button = "rounded-lg px-3 py-2 text-xs font-semibold";
  return <div ref={box} className="text-xs text-[#48534f]">
    <p className="leading-5">{t.steps}</p>
    <textarea value={text} onChange={(event) => { clearLookup(); setText(event.target.value); }} rows={4} placeholder={t.placeholder} aria-label={t.open} className="mt-2 w-full rounded-lg border border-[#dedbd3] bg-white px-3 py-2 text-xs text-[#273c38]" />
    <p className="mt-1 text-[11px] leading-5 text-[#646c68]">{t.privacy}</p>
    {note && <p role="alert" className="mt-2 rounded-lg bg-[#fff8e8] px-3 py-2 leading-5 text-[#745424]">{note}</p>}
    {result && <div role="status" aria-busy={busy} className="mt-2 rounded-lg border border-[#e0ddd5] bg-white px-3 py-2">
      <p className="font-semibold">{t.preview}</p>
      {result.term === term && planCount > 0 && <fieldset className="my-2 rounded-lg border border-[#e0ddd5] px-3 pb-2 pt-1">
        <legend className="px-1 text-[11px] font-medium">{t.mode}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <label className="inline-flex items-center gap-1.5"><input type="radio" name="testudo-import-mode" checked={mode === "add"} onChange={() => setMode("add")} />{t.addMode}</label>
          <label className="inline-flex items-center gap-1.5"><input type="radio" name="testudo-import-mode" checked={mode === "replace"} onChange={() => setMode("replace")} />{t.replaceMode}</label>
        </div>
        {replace && <p className="mt-2 text-[#8f4538]">{t.replaceHint}</p>}
      </fieldset>}
      <p className="font-semibold">{t.found.replace("{n}", String(okCount)).replace("{total}", String(result.found.length)).replace("{term}", termName(result.term))}</p>
      <ul className="mt-1 grid gap-1">{preview.map(({ item, action, reason }) => <li key={item.courseId} className={item.problem || action === "skip" ? "text-[#8f4538]" : "text-[#315c43]"}>
        <span className="font-semibold">{item.problem === "pending" ? t.pending : item.problem ? t.skip : action === "add" ? t.willAdd : action === "update" ? t.willUpdate : t.skip}</span> · {item.courseId} {item.section}
        {item.problem && item.problem !== "pending" ? ` · ${item.problem === "course" ? t.noCourse : item.problem === "section" ? t.noSection.replace("{section}", item.section) : t.lookupFailed}` : item.title && item.title !== item.courseId ? ` · ${item.title}` : ""}
        {reason && ` · ${reason === "capacity" ? t.limit : t.duplicate}`}
      </li>)}</ul>
      {result.term !== term && <p className="mt-2 leading-5">{t.otherTerm.replace("{pasted}", termName(result.term)).replace("{term}", termName(term))}</p>}
      {!busy && okCount > 0 && okCount < result.found.length && <p className="mt-2 font-medium text-[#745424]">{t.partial}</p>}
      {!busy && okCount > 0 && <p className="mt-2 text-[11px] leading-5 text-[#646c68]">{t.verifiedCount.replace("{n}", String(okCount))}</p>}
      {okCount > 0 && !done.week && <p className="mt-2 text-[11px] leading-5 text-[#646c68]">{t.weekHint}</p>}
      {!busy && preview.some((row) => row.reason === "capacity") && <p className="mt-1 text-[11px] leading-5 text-[#646c68]">{t.weekAllFound}</p>}
      {done.week && <p className="mt-2 font-semibold text-[#315c43]">✓ {t.weekSaved} · <a href="/week" className="text-[#a34a39] hover:underline">{t.weekOpen}</a></p>}
      {done.taken && <p className="mt-1 leading-5 text-[#315c43]">✓ {t.takenDone.replace("{term}", termName(term))}</p>}
    </div>}
    <div className="mt-2 flex flex-wrap gap-2">
      {!result && <button type="button" onClick={() => read()} disabled={!text.trim()} className={`${button} bg-[#273c38] text-white hover:bg-[#1d302c] disabled:opacity-50`}>{t.read}</button>}
      {busy && <><span className="self-center" role="status">{t.reading}</span><button type="button" onClick={stop} className={`${button} border border-[#536d64] bg-white text-[#273c38]`}>{t.stop}</button></>}
      {result && !busy && failedCount > 0 && <button type="button" onClick={() => read(true)} className={`${button} border border-[#536d64] bg-white text-[#273c38]`}>{t.retry.replace("{n}", String(failedCount))}</button>}
      {result && !busy && importCourses.length > 0 && <button type="button" onClick={load} className={`${button} bg-[#273c38] text-white hover:bg-[#1d302c]`}>{result.term === term ? t.importing.replace("{n}", String(importCourses.length)) : t.switchLoad.replace("{term}", termName(result.term))}</button>}
      {result && !busy && okCount > 0 && <button type="button" onClick={saveWeek} disabled={done.week} className={`${button} border border-[#536d64] bg-white text-[#273c38] disabled:opacity-60`}>{done.week ? "✓ " + t.weekSaved : t.week}</button>}
      {result && !busy && okCount > 0 && result.term < term && <button type="button" onClick={markTaken} disabled={done.taken} className={`${button} border border-[#536d64] bg-white text-[#273c38] disabled:opacity-60`}>{done.taken ? "✓ " + t.takenMarked : t.asTaken}</button>}
      <button type="button" onClick={close} className={`${button} border border-[#d9d6ce] bg-white text-[#48534f]`}>{done.week || done.taken ? t.close : t.cancel}</button>
    </div>
  </div>;
}
