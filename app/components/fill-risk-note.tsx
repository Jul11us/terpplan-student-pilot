"use client";

import { useEffect, useState } from "react";
import { formatTermName } from "@/lib/seat-trends";

type Language = "en" | "zh";
export type FillRisk = { level: "hours" | "day" | "days" | "full"; hours: number | null; term: string };

// "full" rests on one full reading (the latest), so it says the course has filled before, not that it often does.
const copy = {
  en: {
    badge: { hours: "Fills in hours", day: "Fills within a day", days: "Fills within days", full: "Filled up before" },
    note: {
      hours: "Filled within about {span} after TerpPlan first observed seats being taken in {term} — register the moment your time starts, with a backup section ready.",
      day: "Filled within about a day after TerpPlan first observed seats being taken in {term} — register for it early, with a backup section ready.",
      days: "Filled within about {span} after TerpPlan first observed seats being taken in {term}.",
      full: "Full or nearly full when {term} was last read — keep a backup section in mind.",
    },
    hours: (n: number) => n === 1 ? "an hour" : `${n} hours`,
    days: (n: number) => `${n} days`,
  },
  zh: {
    badge: { hours: "几小时内抢满", day: "一天内抢满", days: "数天内抢满", full: "曾经满员" },
    note: {
      hours: "{term}首次观测到座位被选走后，约 {span}就满了——注册时间一开始就先选它，并准备好备选班次。",
      day: "{term}首次观测到座位被选走后，约一天内就满了——尽早选它，并准备好备选班次。",
      days: "{term}首次观测到座位被选走后，约 {span}内满员。",
      full: "最近一次读取{term}的余位时，已经满员或接近满员——心里备好替代班次。",
    },
    hours: (n: number) => `${n} 小时`,
    days: (n: number) => `${n} 天`,
  },
} as const;

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

// One answer per term and course list for the page's lifetime; the risk itself comes from the database.
// A failed request answers null and is not kept, so asking again (another course, or the retry below) tries again.
const answers = new Map<string, Promise<Record<string, FillRisk | null> | null>>();

export function loadFillRisks(term: string, courses: string[]): Promise<Record<string, FillRisk | null> | null> {
  const key = `${term}|${courses.join(",")}`;
  const cached = answers.get(key);
  if (cached) return cached;
  const promise = fetch(`/api/fill-risk?term=${encodeURIComponent(term)}&courses=${courses.map(encodeURIComponent).join(",")}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Fill risk answered ${response.status}`);
      return ((await response.json()) as { risk?: Record<string, FillRisk | null> }).risk ?? {};
    })
    .catch(() => { answers.delete(key); return null; });
  answers.set(key, promise);
  return promise;
}

// The database can be briefly busy (a registration morning), so a failed lookup is tried once more after this.
const RETRY_MS = 20_000;

// The fill risk of each course, filled in as the one request arrives.
export function useFillRisks(courseIds: string[], term: string) {
  const key = `${term}|${[...new Set(courseIds)].sort().join(",")}`;
  const [risks, setRisks] = useState<Record<string, FillRisk | null>>({});
  useEffect(() => {
    let active = true, retry = 0;
    const courses = key.split("|")[1]!.split(",").filter(Boolean);
    const ask = (last: boolean) => void loadFillRisks(term, courses).then((result) => {
      if (!active) return;
      setRisks(result ?? {});
      if (!result && !last) retry = window.setTimeout(() => ask(true), RETRY_MS);
    });
    if (courses.length) ask(false);
    return () => { active = false; window.clearTimeout(retry); };
  }, [key, term]);
  return risks;
}

const BADGE: Record<FillRisk["level"], string> = {
  hours: "border-[#edcfc7] bg-[#f5e9e5] text-[#8f4538]",
  day: "border-[#ead8b5] bg-[#fff8e8] text-[#745424]",
  days: "border-[#dedbd3] bg-[#f2f0eb] text-[#5d6561]",
  full: "border-[#dedbd3] bg-[#f2f0eb] text-[#5d6561]",
};

// "Fills within a day" as a badge, or the whole sentence with what to do about it. Rendered null when
// nothing says the course has been hard to get.
export function FillRiskNote({ risk, language, compact = false }: { risk: FillRisk | null | undefined; language: Language; compact?: boolean }) {
  if (!risk) return null;
  const t = copy[language];
  // Hours rounded (at least one); days rounded up, so "within 3 days" holds (a "days" risk took over a day: 2 or 3).
  const span = risk.hours === null ? "" : risk.level === "days" ? t.days(Math.ceil(risk.hours / 24)) : t.hours(Math.max(1, Math.round(risk.hours)));
  const sentence = fill(t.note[risk.level], { span, term: formatTermName(risk.term, language) });
  if (compact) return <span title={sentence} className={`ml-1.5 inline-block rounded-full border px-2 py-0.5 align-middle text-[10px] font-semibold ${BADGE[risk.level]}`}>{t.badge[risk.level]}</span>;
  return <p className={`mt-1 text-xs font-medium ${risk.level === "hours" || risk.level === "day" ? "text-[#8f4538]" : "text-[#745424]"}`}>{risk.level === "hours" ? "⚡ " : ""}{sentence}</p>;
}
