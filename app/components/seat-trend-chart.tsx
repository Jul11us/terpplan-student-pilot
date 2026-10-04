"use client";

import type { SeatTrend } from "@/lib/seat-trends";

type SeatTrendChartProps = {
  trend: SeatTrend;
  lang: "en" | "zh";
};

const texts = {
  en: {
    openSeats: "Open Seats",
    days: "days before last check",
    velocity: "Fill Rate",
    seatsPerDay: "seats/day",
    daysToFull: "Est. Full In",
    daysUnit: "days",
    alreadyFull: "Full",
    demand: "Demand",
    lastObserved: "Last observed: ",
    note: "Estimates need at least a day of observations and assume the recent rate continues.",
  },
  zh: {
    openSeats: "剩余座位",
    days: "天前（相对末次读取）",
    velocity: "填充速度",
    seatsPerDay: "座位/天",
    daysToFull: "预计满员",
    daysUnit: "天",
    alreadyFull: "已满",
    demand: "热门指数",
    lastObserved: "末次读取：",
    note: "预测依据最近变化，至少需要一天的数据；不保证届时满员。",
  },
};

const ACCENT = "#536d64";
const GRID = "#e7e4dc";
const DAY = 1000 * 60 * 60 * 24;

// Demand from calm green to amber to red, in the site's palette.
function demandColor(index: number) {
  return index >= 80 ? "#8c352c" : index >= 60 ? "#a34a39" : index >= 40 ? "#745424" : "#315c43";
}

export function SeatTrendChart({ trend, lang }: SeatTrendChartProps) {
  const t = texts[lang];
  const { snapshots, currentOpen, daysToFull, velocity, demandIndex } = trend;

  if (snapshots.length < 2) {
    return null;
  }

  const maxSeats = Math.max(1, ...snapshots.flatMap((s) => [s.totalSeats, s.openSeats]));
  const now = Date.parse(snapshots[snapshots.length - 1].checkedAt);
  const firstTime = Date.parse(snapshots[0].checkedAt);
  const span = Math.max(1, now - firstTime);
  const xPosition = (checkedAt: string) => (Date.parse(checkedAt) - firstTime) / span * 400;
  const yPosition = (open: number) => 100 - (open / maxSeats) * 100;
  const points = snapshots.map((s) => `${xPosition(s.checkedAt)} ${yPosition(s.openSeats)}`);
  const gradientId = `gradient-${trend.sectionId}`;

  return (
    <div className="my-3 rounded-xl border border-[#e3e0d8] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h4 className="text-sm font-semibold text-[#24312d]">{t.openSeats}</h4>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#5d6561]">
          <span>{t.velocity}: <strong className="font-semibold text-[#24312d]">{velocity > 0 ? `+${velocity.toFixed(1)}` : velocity.toFixed(1)}</strong> {t.seatsPerDay}</span>
          {daysToFull !== null && <span>{t.daysToFull}: <strong className="font-semibold text-[#24312d]">{daysToFull}</strong> {t.daysUnit}</span>}
          {daysToFull === null && currentOpen === 0 && <span className="font-semibold text-[#8c352c]">{t.alreadyFull}</span>}
          <span>{t.demand}: <strong className="font-semibold" style={{ color: demandColor(demandIndex) }}>{demandIndex}</strong></span>
        </div>
      </div>

      <svg viewBox="-5 -5 410 115" className="mt-3 block h-auto max-h-56 w-full" role="img" aria-label={`${t.openSeats}: ${currentOpen}`}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.25" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0.03" />
          </linearGradient>
        </defs>
        <line x1="0" y1="100" x2="400" y2="100" stroke={GRID} strokeWidth="1" />
        <line x1="0" y1="50" x2="400" y2="50" stroke={GRID} strokeWidth="0.5" strokeDasharray="2,2" />
        <path d={`M 0 100 ${points.map((point) => `L ${point}`).join(" ")} L 400 100 Z`} fill={`url(#${gradientId})`} />
        <path d={`M ${points.join(" L ")}`} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {snapshots.map((s, i) => (
          <g key={i}>
            <circle cx={xPosition(s.checkedAt)} cy={yPosition(s.openSeats)} r="3" fill={ACCENT} />
            <title>{s.openSeats} {t.openSeats} ({Math.floor((now - Date.parse(s.checkedAt)) / DAY)} {t.days})</title>
          </g>
        ))}
      </svg>

      <div className="mt-2 flex justify-between gap-2 text-[11px] text-[#646c68]">
        <span>{Math.floor((now - firstTime) / DAY)} {t.days}</span>
        <span>{t.openSeats}: {currentOpen}</span>
        <span>0 {t.days}</span>
      </div>

      <p className="mt-3 text-[11px] leading-4 text-[#646c68]">{t.lastObserved}{snapshots[snapshots.length - 1].checkedAt.replace("T", " ").replace(".000Z", " UTC")}. {t.note}</p>
    </div>
  );
}
