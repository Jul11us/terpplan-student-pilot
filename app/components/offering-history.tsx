"use client";

import type { OfferingHistory } from "@/lib/seat-trends";
import { formatOfferingPattern } from "@/lib/seat-trends";

type OfferingHistoryProps = {
  history: OfferingHistory;
  lang: "en" | "zh";
};

type Term = OfferingHistory["terms"][number];

const texts = {
  en: {
    title: "How full it got",
    pattern: "Pattern",
    noHistory: "No historical data available",
    notOffered: "Not offered",
    noneRecent: "Not offered in these semesters",
    sections: "{n} sections · {seats} seats",
    past: "{p}% filled by the end · {open} seats left",
    current: "In progress · {open} seats open now",
    upcoming: "Registration · {open} seats open now",
    fullSections: "{full} of {n} sections full",
    unknown: "Seat counts not recorded",
    progressNow: "Since TerpPlan started reading: {a} open on {d1} → {b} on {d2}",
    progressFull: "90% full {n} days after TerpPlan's first reading",
    progressFullSameDay: "90% full on the day of TerpPlan's first reading",
    progressNever: "Not 90% full while TerpPlan was reading it",
    verdictFull: "Past {season} semesters ended almost full: register as soon as your time opens.",
    verdictBusy: "Past {season} semesters ended mostly full and many sections filled, so don't wait long.",
    verdictRoom: "Past {season} semesters usually had seats left at the end.",
    seasons: { "01": "spring", "05": "summer", "08": "fall", "12": "winter" } as Record<string, string>,
    note: "End-of-term numbers from UMD's Schedule of Classes. Students who dropped during the semester freed seats, so demand at registration was higher. Future semesters may differ.",
  },
  zh: {
    title: "往年坐满程度",
    pattern: "开课规律",
    noHistory: "暂无历史数据",
    notOffered: "未开课",
    noneRecent: "这几个学期都没开课",
    sections: "{n} 个班次 · {seats} 座位",
    past: "期末填满 {p}% · 剩 {open} 座",
    current: "本学期进行中 · 目前剩 {open} 座",
    upcoming: "注册中 · 目前剩 {open} 座",
    fullSections: "{full} / {n} 个班满员",
    unknown: "没有记录余位",
    progressNow: "TerpPlan 记录以来：{d1} 剩 {a} 座 → {d2} 剩 {b} 座",
    progressFull: "TerpPlan 开始记录后第 {n} 天就填满 90%",
    progressFullSameDay: "TerpPlan 开始记录当天就填满 90%",
    progressNever: "记录期间没有填满 90%",
    verdictFull: "往年{season}基本坐满：选课时间一开放就尽快注册。",
    verdictBusy: "往年{season}大多接近坐满，不少班次满员，别拖太久。",
    verdictRoom: "往年{season}到期末通常还有空位。",
    seasons: { "01": "春季", "05": "夏季", "08": "秋季", "12": "冬季" } as Record<string, string>,
    note: "数字来自 UMD 课表在学期结束时的余位。学期中有人退课会空出座位，所以注册时其实比这更抢手。不能据此保证未来学期的情况。",
  },
};

const REGULAR = new Set(["every-fall", "every-spring", "fall-spring", "all-terms"]);

const fillPercent = (term: Term) => term.openSeats === null || !term.totalSeats ? null : Math.round(100 * (term.totalSeats - term.openSeats) / term.totalSeats);
const format = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

// From finished semesters of the same season as the newest listed term (fall and spring can differ a lot:
// ENGL101 ends nearly full in fall and with seats in spring): the average fill and the share of sections
// that ended full.
export function offeringVerdict(terms: Term[]) {
  const season = terms[0]?.term.slice(4);
  const past = terms.filter((term) => term.status === "past" && term.term.slice(4) === season && term.sectionCount > 0 && fillPercent(term) !== null && term.fullSections !== null);
  if (!past.length) return null;
  const average = past.reduce((sum, term) => sum + fillPercent(term)!, 0) / past.length;
  const fullShare = past.reduce((sum, term) => sum + term.fullSections!, 0) / past.reduce((sum, term) => sum + term.sectionCount, 0);
  if (average >= 97 || fullShare >= 0.6) return "full" as const;
  if (average >= 88 || fullShare >= 0.3) return "busy" as const;
  return "room" as const;
}

const VERDICT_CLASS = {
  full: "border-[#ead8b5] bg-[#fff8e8] text-[#745424]",
  busy: "border-[#ead8b5] bg-[#fffbf0] text-[#745424]",
  room: "border-[#cddbd1] bg-[#edf3ef] text-[#315c43]",
} as const;

const shortDate = (value: string, lang: "en" | "zh") => new Date(value).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });

function progressText(term: Term, lang: "en" | "zh") {
  const t = texts[lang], progress = term.progress;
  if (!progress) return null;
  if (term.status !== "past") return format(t.progressNow, { a: progress.firstOpen, b: progress.lastOpen, d1: shortDate(progress.firstAt, lang), d2: shortDate(progress.lastAt, lang) });
  if (progress.daysTo90 === null) return t.progressNever;
  return progress.daysTo90 === 0 ? t.progressFullSameDay : format(t.progressFull, { n: progress.daysTo90 });
}

export function OfferingHistory({ history, lang }: OfferingHistoryProps) {
  const t = texts[lang];

  if (!history.terms.length) {
    return <p className="my-3 rounded-xl border border-[#e3e0d8] bg-white px-4 py-6 text-center text-xs text-[#646c68]">{t.noHistory}</p>;
  }

  const recentTerms = history.terms.slice(0, 6);
  // Every listed term checked and empty: say so rather than "no consistent pattern".
  const noneOffered = history.terms.every((term) => !term.sectionCount);
  const patternLabel = noneOffered ? t.noneRecent : formatOfferingPattern(history.pattern, lang);
  const patternClass = noneOffered ? "border-[#e0ddd5] bg-[#f6f4ef] text-[#48534f]"
    : REGULAR.has(history.pattern) ? "border-[#cddbd1] bg-[#edf3ef] text-[#315c43]"
    : "border-[#ead8b5] bg-[#fff8e8] text-[#745424]";
  const outlook = offeringVerdict(history.terms);

  return (
    <div className="my-3 rounded-xl border border-[#e3e0d8] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-[#24312d]">{t.title}</h4>
        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${patternClass}`}>
          {t.pattern}: <strong className="font-semibold">{patternLabel}</strong>
        </span>
      </div>
      {outlook && <p className={`mt-3 rounded-lg border px-3 py-2 text-xs font-medium ${VERDICT_CLASS[outlook]}`}>{format(outlook === "full" ? t.verdictFull : outlook === "busy" ? t.verdictBusy : t.verdictRoom, { season: t.seasons[history.terms[0].term.slice(4)] ?? "" })}</p>}

      <ul className="mt-2 divide-y divide-[#f0ede7]">
        {recentTerms.map((term) => {
          const percent = fillPercent(term);
          const final = term.status === "past";
          return <li key={term.term} className="py-2.5 text-xs">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className={term.sectionCount ? "font-medium text-[#24312d]" : "text-[#646c68]"}>{term.termName}</span>
              <span className="text-[#5d6561]">{term.sectionCount ? format(t.sections, { n: term.sectionCount, seats: term.totalSeats }) : t.notOffered}</span>
            </div>
            {term.sectionCount > 0 && (percent === null ? <p className="mt-1 text-[11px] text-[#646c68]">{t.unknown}</p> : <>
              <div className="mt-1.5 h-1.5 rounded-full bg-[#ece9e2]" aria-hidden="true">
                <div className={`h-full rounded-full ${final ? (percent >= 97 ? "bg-[#a34a39]" : percent >= 88 ? "bg-[#b8873a]" : "bg-[#536d64]") : "bg-[#9aa5a0]"}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
              </div>
              <p className="mt-1 flex flex-wrap justify-between gap-x-3 text-[11px] text-[#5d6561]">
                <span>{format(final ? t.past : term.status === "current" ? t.current : t.upcoming, { p: percent, open: term.openSeats ?? 0 })}</span>
                {term.fullSections !== null && <span>{format(t.fullSections, { full: term.fullSections, n: term.sectionCount })}</span>}
              </p>
            </>)}
            {term.sectionCount > 0 && progressText(term, lang) && <p className="mt-0.5 text-[11px] text-[#315c43]">{progressText(term, lang)}</p>}
          </li>;
        })}
      </ul>
      <p className="mt-2 text-[11px] leading-4 text-[#646c68]">{t.note}</p>
    </div>
  );
}
