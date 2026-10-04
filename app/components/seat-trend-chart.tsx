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
  },
};

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

  return (
    <div className="seat-trend-chart">
      <div className="chart-header">
        <h4>{t.openSeats}</h4>
        <div className="metrics">
          <span className="velocity">
            {t.velocity}: <strong>{velocity > 0 ? `+${velocity.toFixed(1)}` : velocity.toFixed(1)}</strong> {t.seatsPerDay}
          </span>
          {daysToFull !== null && (
            <span className="days-to-full">
              {t.daysToFull}: <strong>{daysToFull}</strong> {t.daysUnit}
            </span>
          )}
          {daysToFull === null && currentOpen === 0 && <span className="already-full">{t.alreadyFull}</span>}
          <span className={`demand-index demand-${Math.floor(demandIndex / 20)}`}>
            {t.demand}: <strong>{demandIndex}</strong>
          </span>
        </div>
      </div>

      <div className="chart-area">
        <svg viewBox="0 0 400 120" className="trend-svg">
          <defs>
            <linearGradient id={`gradient-${trend.sectionId}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1="0" y1="100" x2="400" y2="100" stroke="var(--border)" strokeWidth="1" />
          <line x1="0" y1="50" x2="400" y2="50" stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2,2" />

          {/* Area fill */}
          <path
            d={`M 0 100 ${snapshots
              .map((s) => {
                const x = xPosition(s.checkedAt);
                const y = 100 - (s.openSeats / maxSeats) * 100;
                return `L ${x} ${y}`;
              })
              .join(" ")} L 400 100 Z`}
            fill={`url(#gradient-${trend.sectionId})`}
          />

          {/* Line */}
          <path
            d={`M ${snapshots
              .map((s) => {
                const x = xPosition(s.checkedAt);
                const y = 100 - (s.openSeats / maxSeats) * 100;
                return `${x} ${y}`;
              })
              .join(" L ")}`}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data points */}
          {snapshots.map((s, i) => {
            const x = xPosition(s.checkedAt);
            const y = 100 - (s.openSeats / maxSeats) * 100;
            const daysAgo = Math.floor((now - new Date(s.checkedAt).getTime()) / (1000 * 60 * 60 * 24));
            return (
              <g key={i}>
                <circle cx={x} cy={y} r="3" fill="var(--accent)" />
                <title>
                  {s.openSeats} {t.openSeats} ({daysAgo} {t.days})
                </title>
              </g>
            );
          })}
        </svg>

        <div className="chart-labels">
          <span>{snapshots.length > 1 ? Math.floor((now - new Date(snapshots[0]!.checkedAt).getTime()) / (1000 * 60 * 60 * 24)) : 0} {t.days}</span>
          <span>{t.openSeats}: {currentOpen}</span>
          <span>0 {t.days}</span>
        </div>
      </div>

      <p className="text-xs text-[#646c68]">{lang === "zh" ? "末次读取：" : "Last observed: "}{snapshots[snapshots.length - 1].checkedAt.replace("T", " ").replace(".000Z", " UTC")}. {lang === "zh" ? "预测依据最近变化，至少需要一天的数据；不保证届时满员。" : "Estimates need at least a day of observations and assume the recent rate continues."}</p>

      <style jsx>{`
        .seat-trend-chart {
          --accent: #3b82f6;
          --border: #e5e7eb;
          background: #fafafa;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 1rem;
          margin-block: 0.75rem;
        }

        .chart-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.75rem;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .chart-header h4 {
          margin: 0;
          font-size: 0.9375rem;
          font-weight: 600;
        }

        .metrics {
          display: flex;
          gap: 1rem;
          font-size: 0.8125rem;
          color: #6b7280;
          flex-wrap: wrap;
        }

        .metrics strong {
          color: #111827;
        }

        .already-full {
          color: #dc2626;
          font-weight: 600;
        }

        .demand-index {
          font-weight: 500;
        }

        .demand-0 strong { color: #10b981; }
        .demand-1 strong { color: #22c55e; }
        .demand-2 strong { color: #eab308; }
        .demand-3 strong { color: #f59e0b; }
        .demand-4 strong { color: #ef4444; }
        .demand-5 strong { color: #dc2626; }

        .chart-area {
          position: relative;
        }

        .trend-svg {
          width: 100%;
          height: auto;
          display: block;
        }

        .chart-labels {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          color: #9ca3af;
          margin-top: 0.5rem;
        }

        @media (prefers-color-scheme: dark) {
          .seat-trend-chart {
            --border: #374151;
            background: #1f2937;
          }

          .chart-header h4,
          .metrics strong {
            color: #f9fafb;
          }

          .metrics {
            color: #9ca3af;
          }

          .chart-labels {
            color: #6b7280;
          }
        }
      `}</style>
    </div>
  );
}
