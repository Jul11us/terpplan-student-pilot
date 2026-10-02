"use client";

import Link from "next/link";
import { useState } from "react";
import { parseCourseCodes, writeTaken, type TakenCourses } from "@/lib/taken-courses";

const copy = {
  en: {
    none: "Add the courses you've taken to check prerequisites.",
    some: (n: number) => `Checking prerequisites against ${n} course${n === 1 ? "" : "s"} you've taken`,
    fromAudit: " (from your degree audit)",
    add: "Add courses",
    edit: "Edit",
    label: "Courses you've finished or are taking now",
    placeholder: "e.g. CMSC131, MATH140, ENGL101",
    help: "Saved in this browser only. Grades aren't checked, so a course counts once it's listed.",
    save: "Save",
    clear: "Clear",
    cancel: "Cancel",
    audit: "Import from your degree audit →",
  },
  zh: {
    none: "填写修过的课程，就能检查先修课。",
    some: (n: number) => `正在按你修过的 ${n} 门课检查先修课`,
    fromAudit: "（来自学位审计）",
    add: "填写课程",
    edit: "修改",
    label: "已修完或正在修的课程",
    placeholder: "例如 CMSC131, MATH140, ENGL101",
    help: "只保存在这个浏览器里。不检查成绩，列出的课程都算修过。",
    save: "保存",
    clear: "清空",
    cancel: "取消",
    audit: "从学位审计导入 →",
  },
} as const;

export default function TakenCoursesEditor({ taken, language }: { taken: TakenCourses | null; language: "en" | "zh" }) {
  const t = copy[language];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const all = taken ? [...taken.completed, ...taken.inProgress] : [];
  const start = () => { setDraft(all.join(", ")); setOpen(true); };
  const save = () => {
    const codes = parseCourseCodes(draft);
    writeTaken(codes.length ? { completed: codes, inProgress: [], source: "manual" } : null);
    setOpen(false);
  };

  if (!open) {
    return <p className="text-xs text-[#68716e]">
      {all.length ? <>{t.some(all.length)}{taken?.source === "audit" ? t.fromAudit : ""}</> : t.none}{" "}
      <button type="button" onClick={start} className="font-semibold text-[#9a5040] underline-offset-2 hover:underline">{all.length ? t.edit : t.add}</button>
    </p>;
  }
  return <div className="rounded-xl border border-[#e0ddd5] bg-white p-3">
    <label className="block text-xs font-semibold text-[#48534f]">{t.label}
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t.placeholder} rows={2} className="mt-1.5 w-full rounded-lg border border-[#dedbd3] px-3 py-2 text-sm font-normal text-[#202728]" />
    </label>
    <p className="mt-1 text-[11px] text-[#858d89]">{t.help}</p>
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button type="button" onClick={save} className="rounded-lg bg-[#273c38] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d302c]">{t.save}</button>
      {all.length > 0 && <button type="button" onClick={() => { writeTaken(null); setOpen(false); }} className="rounded-lg border border-[#d9d6ce] px-3 py-1.5 text-xs font-semibold text-[#48534f] hover:bg-[#f7f5f0]">{t.clear}</button>}
      <button type="button" onClick={() => setOpen(false)} className="px-2 py-1.5 text-xs font-medium text-[#68716e] hover:underline">{t.cancel}</button>
      <Link href="/audit" className="ml-auto text-xs font-medium text-[#a34a39] hover:underline">{t.audit}</Link>
    </div>
  </div>;
}
