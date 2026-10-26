"use client";

import { useEffect, useId, useState } from "react";
import { comparisonDifferences, comparisonKey, comparisonMetrics, comparisonPlans, initialComparison, startPlanComparison, type ComparisonColumn, type ComparisonInput, type ComparisonSnapshot, type PlanSlot } from "@/lib/plan-comparison";
import type { PlanPreferences } from "@/lib/planner";
import type { SavedPlanCourse } from "@/lib/saved-state";

type Language = "en" | "zh";
const copy = {
  en: {
    title: "Compare Plan A and B", show: "Compare", hide: "Close comparison", refresh: "Compare again",
    note: "Both plans use your current preferences. Comparing is a preview; it does not change your pick or registration checklist.",
    plan: "Plan", loading: "Checking this plan…", empty: "No courses in this plan.", error: "Could not load this plan. Try comparing again.",
    invalid: "Complete the preferred time window above before comparing.", unavailable: "No schedule found with the current courses and preferences.",
    saved: "Your picked schedule", unpicked: "Recommendation preview · not picked", changed: "Previous pick unavailable · recommendation preview",
    placed: "Placed / planned courses", credits: "Credits", first: "Earliest class", days: "Class days / week", gaps: "Gaps / week", walk: "Estimated walking / week", full: "Full sections",
    minutes: "min", unknownSeats: "with unknown seats", noFixed: "No fixed time", unknown: "Unknown",
    partial: "Not placed", timeNote: "Some meeting times are not announced, so time and walking totals are unknown.",
    loadNote: "The course loads may differ. Compare the tradeoffs rather than treating one total as an overall winner.",
    differences: "Course and section differences", same: "The placed courses and sections are the same.", absent: "Not in plan", notPlaced: "Not placed",
  },
  zh: {
    title: "并排比较方案 A / B", show: "展开比较", hide: "收起比较", refresh: "重新比较",
    note: "两份方案都按当前偏好检查。这里只作比较，不会改变你的选择或选课清单。",
    plan: "方案", loading: "正在检查这份方案…", empty: "这个方案还没有课程。", error: "暂时无法读取这份方案，请重新比较。",
    invalid: "请先在上方补全有效的偏好时间段，再比较。", unavailable: "按当前课程和偏好，未找到课表。",
    saved: "你选的课表", unpicked: "推荐预览 · 尚未选定", changed: "原选择无法恢复 · 推荐预览",
    placed: "排入 / 计划课程", credits: "学分", first: "最早上课", days: "每周有课天数", gaps: "每周课间空档", walk: "每周预计步行", full: "已满班次",
    minutes: "分钟", unknownSeats: "个余位未知", noFixed: "无固定时间", unknown: "未知",
    partial: "未排入", timeNote: "部分上课时间尚未公布，时间和步行统计暂时未知。",
    loadNote: "两边的课程负担可能不同，请按取舍比较，各项总量不代表整体优劣。",
    differences: "课程与班次差异", same: "已排入的课程与班次相同。", absent: "不在此方案", notPlaced: "未排入",
  },
} as const;

export default function PlanComparison({ term, language, activeSlot, currentCourses, otherCourses, preferences, choices }: {
  term: string; language: Language; activeSlot: PlanSlot;
  currentCourses: SavedPlanCourse[]; otherCourses: SavedPlanCourse[];
  preferences: PlanPreferences; choices: Record<string, string[]>;
}) {
  const t = copy[language];
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  const [visit, setVisit] = useState(0);
  const [run, setRun] = useState<{ key: string; state: ComparisonSnapshot } | null>(null);
  const input: ComparisonInput = { term, plans: comparisonPlans(activeSlot, currentCourses, otherCourses), preferences, choices };
  // Each reopening has a new identity, so a closed or abandoned loading snapshot cannot reappear.
  const key = `${comparisonKey(input)}:${visit}`;
  useEffect(() => {
    if (!open) return;
    return startPlanComparison(input, (state) => setRun({ key, state }));
    // The key represents the exact requests, including the A/B picks, filters and anonymous preferences.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);
  const state = run?.key === key ? run.state : initialComparison(input);
  const metrics = { A: comparisonMetrics(state.A), B: comparisonMetrics(state.B) };
  const differences = comparisonDifferences(state);
  const describe = (column: ComparisonColumn) => column.state === "ready"
    ? column.pick === "saved" ? t.saved : column.pick === "invalid" ? t.changed : t.unpicked
    : t[column.state];
  const rows = ["placed", "credits", "first", "days", "gaps", "walk", "full"] as const;
  const value = (slot: PlanSlot, row: typeof rows[number]) => {
    const metric = metrics[slot];
    if (row === "placed") return `${metric?.placed ?? (state[slot].state === "empty" ? 0 : "—")} / ${state[slot].courses.length}`;
    if (!metric) return "—";
    if (row === "credits") return metric.credits === null ? "—" : String(metric.credits);
    if (row === "first") return metric.earliestStart ?? (metric.incompleteTime || metric.incompletePlan ? t.unknown : t.noFixed);
    if (row === "full") return `${metric.full}${metric.unknownSeats ? ` · ${metric.unknownSeats} ${t.unknownSeats}` : ""}`;
    const amount = row === "days" ? metric.days : row === "gaps" ? metric.gaps : metric.walking;
    return amount === null ? "—" : `${amount}${row === "days" ? "" : ` ${t.minutes}`}`;
  };
  const sectionText = (sections: string[] | null) => sections === null ? t.absent : sections.length ? sections.join(", ") : t.notPlaced;

  return <section className="mt-4 rounded-xl border border-[#d9e3dc] bg-[#f7faf7] p-4">
    <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => { setOpen(!open); setVisit((current) => current + 1); }} className="flex min-h-8 w-full items-center justify-between gap-3 text-left text-sm font-semibold text-[#273c38]">
      <span>{t.title}</span><span className="shrink-0 text-xs font-medium text-[#536d64]">{open ? t.hide : t.show} <span aria-hidden="true">{open ? "▲" : "▼"}</span></span>
    </button>
    {open && <div id={bodyId} aria-busy={state.A.state === "loading" || state.B.state === "loading"} className="mt-2">
      <p className="text-xs leading-5 text-[#5d6561]">{t.note}</p>
      <div className="mt-3 overflow-hidden rounded-lg border border-[#d9e3dc] bg-white">
        <table className="w-full table-fixed text-left text-xs leading-5">
          <thead className="bg-[#edf3ef] text-[#273c38]"><tr>
            <th scope="col" className="w-[36%] px-3 py-2"><span className="sr-only">{t.title}</span></th>
            {(["A", "B"] as const).map((slot) => <th key={slot} scope="col" className="break-words px-2 py-2 align-top">
              <span className="block text-sm">{t.plan} {slot}</span><span role="status" className="mt-1 block text-[11px] font-normal text-[#5d6561]">{describe(state[slot])}</span>
            </th>)}
          </tr></thead>
          <tbody>{rows.map((row) => <tr key={row} className="border-t border-[#edf0eb]">
            <th scope="row" className="px-3 py-2 font-medium text-[#48534f]">{t[row]}</th>
            {(["A", "B"] as const).map((slot) => <td key={slot} className="break-words px-2 py-2 align-top text-[#273c38]">{value(slot, row)}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
      {(["A", "B"] as const).map((slot) => state[slot].missing?.length ? <p key={slot} role="status" className="mt-2 text-xs leading-5 text-[#8f4538]">{t.plan} {slot} · {t.partial}: {state[slot].missing!.join(", ")}</p> : null)}
      {(metrics.A?.incompleteTime || metrics.B?.incompleteTime) && <p className="mt-2 text-[11px] leading-5 text-[#745424]">{t.timeNote}</p>}
      <p className="mt-2 text-[11px] leading-5 text-[#646c68]">{t.loadNote}</p>
      {differences !== null && <div className="mt-3">
        <h4 className="text-xs font-semibold text-[#48534f]">{t.differences}</h4>
        {differences.length ? <table className="mt-1 w-full table-fixed text-left text-xs leading-5">
          <thead className="sr-only"><tr><th scope="col">{t.differences}</th><th scope="col">{t.plan} A</th><th scope="col">{t.plan} B</th></tr></thead>
          <tbody>{differences.map((difference) => <tr key={difference.courseId} className="border-t border-[#e3e8e1]">
            <th scope="row" className="w-[36%] break-all px-2 py-2 font-medium text-[#48534f]">{difference.courseId}</th>
            <td className="break-all px-2 py-2 align-top text-[#5d6561]">{sectionText(difference.A)}</td>
            <td className="break-all px-2 py-2 align-top text-[#5d6561]">{sectionText(difference.B)}</td>
          </tr>)}</tbody>
        </table> : <p className="mt-1 text-xs text-[#646c68]">{t.same}</p>}
      </div>}
      <button type="button" onClick={() => setVisit((current) => current + 1)} className="mt-3 min-h-8 rounded-lg border border-[#b9c9be] bg-white px-3 py-1.5 text-xs font-semibold text-[#273c38] hover:bg-[#edf3ef]">{t.refresh}</button>
    </div>}
  </section>;
}
