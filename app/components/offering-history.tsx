"use client";

import type { OfferingHistory } from "@/lib/seat-trends";
import { formatOfferingPattern } from "@/lib/seat-trends";

type OfferingHistoryProps = {
  history: OfferingHistory;
  lang: "en" | "zh";
};

const texts = {
  en: {
    title: "Offering History",
    pattern: "Pattern",
    recentTerms: "Recent Terms",
    sections: "sections",
    seats: "seats",
    noHistory: "No historical data available",
    notOffered: "Not offered",
    noneRecent: "Not offered in these semesters",
    note: "Fall and spring semesters from UMD's schedule data, plus terms seen on TerpPlan. Future offerings may differ.",
  },
  zh: {
    title: "开课历史",
    pattern: "开课规律",
    recentTerms: "近期学期",
    sections: "节",
    seats: "座位",
    noHistory: "暂无历史数据",
    notOffered: "未开课",
    noneRecent: "这几个学期都没开课",
    note: "来自 UMD 课表数据的近几个秋季和春季学期，加上 TerpPlan 读取过的学期；不能据此保证未来开课。",
  },
};

// A regular pattern reads as good news (green); an irregular one as a caution (amber).
const REGULAR = new Set(["every-fall", "every-spring", "fall-spring", "all-terms"]);

export function OfferingHistory({ history, lang }: OfferingHistoryProps) {
  const t = texts[lang];

  if (!history.terms.length) {
    return <p className="my-3 rounded-xl border border-[#e3e0d8] bg-white px-4 py-6 text-center text-xs text-[#646c68]">{t.noHistory}</p>;
  }

  // Every listed term checked and empty: say so rather than "no consistent pattern".
  const noneOffered = history.terms.every((term) => !term.sectionCount);
  const patternLabel = noneOffered ? t.noneRecent : formatOfferingPattern(history.pattern, lang);
  const recentTerms = history.terms.slice(0, 6);
  const patternClass = noneOffered ? "border-[#e0ddd5] bg-[#f6f4ef] text-[#48534f]" : REGULAR.has(history.pattern) ? "border-[#cddbd1] bg-[#edf3ef] text-[#315c43]"
    : history.pattern === "irregular" ? "border-[#ead8b5] bg-[#fff8e8] text-[#745424]"
    : "border-[#e0ddd5] bg-[#f6f4ef] text-[#48534f]";

  return (
    <div className="my-3 rounded-xl border border-[#e3e0d8] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-[#24312d]">{t.title}</h4>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${patternClass}`}>
          {t.pattern}: <strong className="font-semibold">{patternLabel}</strong>
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-[#646c68]">{t.note}</p>

      <p className="mt-3 border-b border-[#ece9e2] pb-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-[#5d6561]">{t.recentTerms}</p>
      <ul className="divide-y divide-[#f0ede7]">
        {recentTerms.map((term) => (
          <li key={term.term} className="flex items-center justify-between gap-3 py-2 text-xs">
            <span className={term.sectionCount ? "font-medium text-[#24312d]" : "text-[#646c68]"}>{term.termName}</span>
            <span className="text-[#5d6561]">{term.sectionCount ? <>{term.sectionCount} {t.sections} · {term.totalSeats} {t.seats}</> : t.notOffered}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
