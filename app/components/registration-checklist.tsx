"use client";

import { useState } from "react";

type Language = "en" | "zh";
type ChecklistSection = { course_id: string; course_title: string; section_id: string; open_seats?: string | number | null };
type ChecklistOption = { selectedSections: ChecklistSection[] };

const REGISTRAR = "https://registrar.umd.edu/registration/register-classes";
// Official pages only: TerpPlan does not describe Testudo's screens, which can change.
const LINKS = {
  steps: `${REGISTRAR}/steps-register`,
  blocks: `${REGISTRAR}/blocks-special-permissions-exceptions-policy`,
  waitlist: `${REGISTRAR}/waitlist-hold-file`,
};

const copy = {
  en: {
    title: "Registration checklist",
    intro: "The course and section numbers for this option, ready to enter when you register in Testudo.",
    course: "Course", section: "Section", copy: "Copy", copied: "Copied", copyAll: "Copy all", full: "Full",
    backups: "Backup sections from the other options",
    before: "Before your registration time",
    tips: [
      ["Check your registration date and time and follow the official steps to register.", "steps", "Steps to register"],
      ["Clear any registration block ahead of time; blocks can stop you from registering.", "blocks", "Blocks & permissions"],
      ["If a section is full, a waitlist or hold file may be available.", "waitlist", "Waitlist & hold file"],
    ],
    confirm: "Seat counts can lag. Confirm every section in Testudo when you register.",
    copyFailed: "Copy failed. Select the text and copy it manually.",
  },
  zh: {
    title: "选课清单",
    intro: "这个方案的课程号和班号，注册时可以直接对照填写。",
    course: "课程", section: "班号", copy: "复制", copied: "已复制", copyAll: "全部复制", full: "已满",
    backups: "其他方案里的备选班次",
    before: "注册之前",
    tips: [
      ["确认自己的注册日期和时间，并按官方步骤操作。", "steps", "官方选课步骤"],
      ["提前处理选课限制（block），否则可能无法注册。", "blocks", "选课限制与特别许可"],
      ["班次已满时，可能可以加入候补（waitlist / hold file）。", "waitlist", "候补说明"],
    ],
    confirm: "余位数据可能有延迟，注册时请在 Testudo 中确认每个班次。",
    copyFailed: "复制失败，请手动选中文字复制。",
  },
} as const;

const sectionNumber = (section: ChecklistSection) => section.section_id.slice(section.course_id.length + 1) || section.section_id;
const isFull = (section: ChecklistSection) => section.open_seats !== null && section.open_seats !== undefined && section.open_seats !== "" && Number(section.open_seats) === 0;

export default function RegistrationChecklist({ option, others, language }: { option: ChecklistOption; others: ChecklistOption[]; language: Language }) {
  const t = copy[language];
  const [copied, setCopied] = useState("");
  const [failed, setFailed] = useState(false);

  const write = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key); setFailed(false);
      window.setTimeout(() => setCopied((current) => current === key ? "" : current), 1500);
    } catch {
      setFailed(true);
    }
  };

  const chosenIds = new Set(option.selectedSections.map((section) => section.section_id));
  const backups = [...new Map(others.flatMap((other) => other.selectedSections)
    .filter((section) => !chosenIds.has(section.section_id))
    .map((section) => [section.section_id, section])).values()];
  const allText = option.selectedSections.map((section) => `${section.course_id} ${sectionNumber(section)}`).join("\n");
  const chip = (key: string, text: string) => <button type="button" onClick={() => void write(key, text)} title={t.copy} className="rounded-md border border-[#dedbd3] bg-[#fbfaf8] px-2 py-1 font-mono text-xs font-semibold text-[#24312d] hover:bg-white">{copied === key ? `✓ ${t.copied}` : text}</button>;

  return <section className="mt-6 rounded-xl border border-[#cddbd1] bg-[#f4f8f5] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h4 className="font-semibold">{t.title}</h4><p className="mt-1 text-xs leading-5 text-[#59635f]">{t.intro}</p></div>
      <button type="button" onClick={() => void write("all", allText)} className="rounded-lg bg-[#273c38] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d302c]">{copied === "all" ? `✓ ${t.copied}` : t.copyAll}</button>
    </div>
    <div className="mt-3 overflow-hidden rounded-lg border border-[#dfe7e1] bg-white">
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-[#eef2ef] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#737b77]"><span /><span>{t.course}</span><span>{t.section}</span></div>
      {option.selectedSections.map((section) => <div key={section.section_id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-[#eef2ef] px-3 py-2 last:border-b-0">
        <span className="min-w-0 truncate text-xs text-[#59635f]">{section.course_title}{isFull(section) && <span className="ml-2 rounded-full bg-[#f5e9e5] px-1.5 py-0.5 text-[10px] font-semibold text-[#8f4538]">{t.full}</span>}</span>
        {chip(`${section.section_id}:course`, section.course_id)}
        {chip(`${section.section_id}:section`, sectionNumber(section))}
      </div>)}
    </div>
    {backups.length > 0 && <div className="mt-3"><p className="text-xs font-medium text-[#48534f]">{t.backups}</p><div className="mt-1.5 flex flex-wrap gap-2">{backups.map((section) => <span key={section.section_id}>{chip(`${section.section_id}:backup`, `${section.course_id} ${sectionNumber(section)}`)}</span>)}</div></div>}
    <p className="mt-4 text-xs font-medium text-[#48534f]">{t.before}</p>
    <ul className="mt-1.5 space-y-1 text-xs leading-5 text-[#59635f]">{t.tips.map(([text, link, label]) => <li key={link}>• {text} <a href={LINKS[link]} target="_blank" rel="noreferrer" className="font-medium text-[#a34a39] underline underline-offset-2">{label} ↗</a></li>)}</ul>
    <p className="mt-3 text-[11px] leading-5 text-[#858d89]">{t.confirm}</p>
    {failed && <p role="alert" className="mt-2 text-xs text-[#8c352c]">{t.copyFailed}</p>}
  </section>;
}
