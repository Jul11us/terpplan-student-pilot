import type { CreditMeter as CreditMeterData } from "@/lib/plan-credits";
import { historicalGpaSummary, weekLoad, WEEK_DAYS } from "@/lib/week-load";
import type { ScheduledSection } from "@/lib/planner";

type Language = "en" | "zh";

const copy = {
  en: {
    credits: "Credit load", markFullTime: "12 · full-time", markBeforeClasses: "{n} · before classes start", markMax: "{n} · limit",
    level: { under: "Below full-time (12 credits)", ok: "Within the usual range", caution: "Above what you can register for before classes start", over: "Above the credit limit" },
    weekLoad: "Hours in class each day", hours: "h", gap: "gap", noClasses: "No class", busiest: "Busiest day: {day}", total: "{h} hours of scheduled class a week",
    weekNote: "Counts meetings with listed times. Time TBA and online work without a set time are not included.",
    gpa: "Historical grades in these sections", gpaAverage: "Credit-weighted average {gpa}", gpaRange: "Range across courses {low}–{high}", gpaCoverage: "Known for {k} of {n} sections",
    gpaNote: "PlanetTerp averages of grades these instructors gave in past terms. They describe past students, not the grade you will get.",
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  },
  zh: {
    credits: "学分负担", markFullTime: "12 · 全日制", markBeforeClasses: "{n} · 开学前上限", markMax: "{n} · 上限",
    level: { under: "低于全日制（12 学分）", ok: "在常规范围内", caution: "超过开学前可注册的学分", over: "超过学分上限" },
    weekLoad: "每天上课时长", hours: "小时", gap: "空档", noClasses: "无课", busiest: "最忙的一天：{day}", total: "每周排定上课 {h} 小时",
    weekNote: "只统计有明确时间的课。时间待定和无固定时间的网课未计入。",
    gpa: "这些班次的历史成绩", gpaAverage: "按学分加权平均 {gpa}", gpaRange: "各课程范围 {low}–{high}", gpaCoverage: "{n} 个班次中有 {k} 个有数据",
    gpaNote: "来自 PlanetTerp：这些老师过去学期给出的平均成绩，只反映以往学生，不代表你会得到的成绩。",
    weekdays: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
  },
} as const;

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
const hours = (minutes: number) => String(Math.round(minutes / 6) / 10);

const LEVEL_COLOR = { under: "#9aa59f", ok: "#536d64", caution: "#c08a2e", over: "#a34a39" } as const;

export function CreditMeter({ meter, language }: { meter: CreditMeterData; language: Language }) {
  const t = copy[language];
  const percent = (value: number) => `${Math.min(100, (value / meter.scaleMax) * 100)}%`;
  const color = LEVEL_COLOR[meter.level];
  const amount = meter.min === meter.max ? String(meter.min) : `${meter.min}–${meter.max}`;
  const markLabel = (kind: (typeof meter.marks)[number]["kind"], value: number) =>
    kind === "fullTime" ? t.markFullTime : fill(kind === "max" ? t.markMax : t.markBeforeClasses, { n: value });
  return <div className="mt-6 rounded-xl border border-[#e3e0d8] bg-white px-4 pb-3 pt-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
      <span className="font-semibold text-[#273c38]">{t.credits}</span>
      <span className="font-medium" style={{ color }}>{t.level[meter.level]}</span>
    </div>
    <div role="meter" aria-label={t.credits} aria-valuemin={0} aria-valuemax={meter.scaleMax} aria-valuenow={meter.min} aria-valuetext={`${amount} · ${t.level[meter.level]}`} className="relative mt-2 h-3 rounded-full bg-[#eeece6]">
      <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300" style={{ width: percent(meter.min), backgroundColor: color }} />
      {meter.max > meter.min && <div className="absolute inset-y-0 rounded-r-full opacity-35" style={{ left: percent(meter.min), width: `calc(${percent(meter.max)} - ${percent(meter.min)})`, backgroundColor: color }} />}
      {meter.marks.map((mark) => <span key={mark.kind} aria-hidden="true" className="absolute -inset-y-1 w-px bg-[#48534f]" style={{ left: percent(mark.value) }} />)}
    </div>
    {/* Labels alternate above/below would crowd on a phone, so they sit in one row as a legend under the bar. */}
    <div aria-hidden="true" className="relative mt-1 h-4 text-[10px] text-[#646c68]">
      {meter.marks.map((mark) => <span key={mark.kind} className="absolute whitespace-nowrap" style={{ left: percent(mark.value), transform: mark.kind === "max" ? "translateX(-100%)" : "translateX(-50%)" }}>{mark.kind === "fullTime" ? "12" : mark.value}</span>)}
    </div>
    <p className="text-[10px] leading-4 text-[#646c68]">{meter.marks.map((mark) => markLabel(mark.kind, mark.value)).join(" · ")}</p>
  </div>;
}

export function WeekLoadChart({ sections, language }: { sections: ScheduledSection[]; language: Language }) {
  const t = copy[language];
  const load = weekLoad(sections);
  if (!load.totalClassMinutes) return null;
  // Bars share one scale so days compare at a glance; at least 4 hours keeps a light week from looking full.
  const scale = Math.max(240, ...load.days.map((day) => day.classMinutes + day.gapMinutes));
  const label = (day: (typeof WEEK_DAYS)[number]) => t.weekdays[WEEK_DAYS.indexOf(day)];
  const gpa = historicalGpaSummary(sections);
  // Side by side with the grades card when there is one; otherwise the chart uses the full width.
  return <div className={`mb-3 grid gap-3 ${gpa ? "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" : ""}`}>
    <div className="rounded-xl border border-[#e3e0d8] bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h5 className="text-xs font-semibold text-[#273c38]">{t.weekLoad}</h5><span className="text-[11px] text-[#646c68]">{fill(t.total, { h: hours(load.totalClassMinutes) })}</span></div>
      <ul className="mt-3 space-y-1.5">{load.days.map((day) => <li key={day.day} className="grid grid-cols-[2.5rem_minmax(0,1fr)_7.5rem] items-center gap-2 text-[11px]">
        <span className={day.day === load.busiest ? "font-semibold text-[#273c38]" : "text-[#59635f]"}>{label(day.day)}</span>
        <span className="flex h-2.5 overflow-hidden rounded-full bg-[#f2f0eb]" aria-hidden="true">
          <span className="h-full bg-[#536d64]" style={{ width: `${(day.classMinutes / scale) * 100}%` }} />
          <span className="h-full bg-[repeating-linear-gradient(45deg,#cfd8d3_0,#cfd8d3_3px,transparent_3px,transparent_6px)]" style={{ width: `${(day.gapMinutes / scale) * 100}%` }} />
        </span>
        <span className="text-right tabular-nums text-[#59635f]">{day.classMinutes ? `${hours(day.classMinutes)} ${t.hours}${day.gapMinutes ? ` · ${t.gap} ${hours(day.gapMinutes)} ${t.hours}` : ""}` : t.noClasses}</span>
      </li>)}</ul>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#646c68]">
        {load.busiest && <span>{fill(t.busiest, { day: label(load.busiest) })}</span>}
        <span className="inline-flex items-center gap-1"><i className="h-2 w-3 rounded-sm bg-[#536d64]" />{language === "zh" ? "上课" : "In class"}</span>
        <span className="inline-flex items-center gap-1"><i className="h-2 w-3 rounded-sm bg-[repeating-linear-gradient(45deg,#cfd8d3_0,#cfd8d3_3px,transparent_3px,transparent_6px)]" />{language === "zh" ? "课间空档" : "Gap between classes"}</span>
      </p>
      <p className="mt-1 text-[10px] leading-4 text-[#646c68]">{t.weekNote}</p>
    </div>
    {gpa && <div className="rounded-xl border border-[#e3e0d8] bg-white p-3 sm:p-4">
      <h5 className="text-xs font-semibold text-[#273c38]">{t.gpa}</h5>
      <p className="mt-2 font-serif text-2xl tabular-nums text-[#273c38]">{gpa.average.toFixed(2)}</p>
      <div className="relative mt-2 h-2 rounded-full bg-[#f2f0eb]" aria-hidden="true">
        <span className="absolute inset-y-0 rounded-full bg-[#b9c5be]" style={{ left: `${(gpa.low / 4) * 100}%`, width: `${Math.max(1, ((gpa.high - gpa.low) / 4) * 100)}%` }} />
        <span className="absolute -inset-y-0.5 w-1 -translate-x-1/2 rounded-full bg-[#273c38]" style={{ left: `${(gpa.average / 4) * 100}%` }} />
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-[#646c68]" aria-hidden="true"><span>0</span><span>2.0</span><span>4.0</span></div>
      <p className="mt-2 text-[11px] leading-5 text-[#59635f]">{fill(t.gpaAverage, { gpa: gpa.average.toFixed(2) })} · {fill(t.gpaRange, { low: gpa.low.toFixed(2), high: gpa.high.toFixed(2) })} · {fill(t.gpaCoverage, { k: gpa.known, n: gpa.total })}</p>
      <p className="mt-1 text-[10px] leading-4 text-[#646c68]">{t.gpaNote}</p>
    </div>}
  </div>;
}
