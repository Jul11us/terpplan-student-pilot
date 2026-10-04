"use client";

import { useEffect, useState } from "react";
import { SeatTrendChart } from "./seat-trend-chart";
import { OfferingHistory } from "./offering-history";
import type { SeatTrend, OfferingHistory as OfferingHistoryType } from "@/lib/seat-trends";

type CourseTrendsProps = {
  courseId: string;
  term: string;
  sectionIds: string[];
  lang: "en" | "zh";
};

const texts = {
  en: {
    title: "Historical Data & Trends",
    loading: "Loading trends...",
    noData: "Not enough historical data yet",
    failed: "Some history could not be loaded. Please try again.",
    demandHigh: "High demand",
    demandModerate: "Moderate demand",
    demandLow: "Low demand",
  },
  zh: {
    title: "历史数据与趋势",
    loading: "加载趋势中...",
    noData: "暂无足够历史数据",
    failed: "部分历史数据暂时无法加载，请稍后重试。",
    demandHigh: "热门课程",
    demandModerate: "中等热度",
    demandLow: "较冷门",
  },
};

export function CourseTrends({ courseId, term, sectionIds, lang }: CourseTrendsProps) {
  const t = texts[lang];
  const sectionKey = sectionIds.slice(0, 10).join(",");
  const requestKey = JSON.stringify([courseId, term, sectionKey, lang]);
  const [result, setResult] = useState<{ key: string; trends: Map<string, SeatTrend>; history: OfferingHistoryType | null; failed: boolean } | null>(null);
  const current = result?.key === requestKey ? result : null;
  const trends = current?.trends ?? new Map<string, SeatTrend>();
  const history = current?.history ?? null;
  const loading = !current;

  useEffect(() => {
    const controller = new AbortController();

    // Fetch seat trends and offering history in parallel
    Promise.all([
      sectionKey ? fetch(`/api/trends/seats?term=${encodeURIComponent(term)}&sections=${encodeURIComponent(sectionKey)}`, { signal: controller.signal }).then((res) => res.ok ? res.json() : null) : Promise.resolve({ trends: {} }),
      fetch(`/api/trends/offerings?id=${encodeURIComponent(courseId)}&lang=${lang}`, { signal: controller.signal }).then((res) => res.ok ? res.json() : null),
    ])
      .then(([seatData, offeringData]) => {
        if (controller.signal.aborted) return;
        const trendMap = new Map<string, SeatTrend>();
        if (seatData && typeof seatData === 'object' && 'trends' in seatData && seatData.trends) {
          Object.entries(seatData.trends as Record<string, SeatTrend>).forEach(([sectionId, trend]) => {
            trendMap.set(sectionId, trend);
          });
        }
        setResult({ key: requestKey, trends: trendMap, history: offeringData as OfferingHistoryType | null, failed: !seatData || !offeringData });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key: requestKey, trends: new Map(), history: null, failed: true });
      });

    return () => {
      controller.abort();
    };
  }, [courseId, term, sectionKey, lang, requestKey]);

  if (loading) {
    return <p className="my-3 text-center text-xs text-[#646c68]">{t.loading}</p>;
  }

  const hasTrends = trends.size > 0;
  const hasHistory = history && history.terms.length > 0;

  if (!hasTrends && !hasHistory) {
    return <p role={current?.failed ? "alert" : undefined} className="my-3 rounded-xl border border-[#e3e0d8] bg-white px-4 py-6 text-center text-xs text-[#646c68]">{current?.failed ? t.failed : t.noData}</p>;
  }

  // Show the trend with the highest demand index
  const topTrend = Array.from(trends.values()).sort((a, b) => b.demandIndex - a.demandIndex)[0];

  return (
    <div className="my-6">
      <h3 className="mb-3 text-[15px] font-semibold text-[#24312d]">{t.title}</h3>
      {current?.failed && <p role="alert" className="text-xs text-[#8c352c]">{t.failed}</p>}

      {topTrend && <SeatTrendChart trend={topTrend} lang={lang} />}

      {hasHistory && <OfferingHistory history={history!} lang={lang} />}
    </div>
  );
}
