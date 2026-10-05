"use client";

import { useEffect, useState } from "react";
import { seasonOnly, termSeason, type Season } from "@/lib/offering-season";

type Language = "en" | "zh";

const copy = {
  en: {
    badge: { fall: "Fall only", spring: "Spring only" },
    now: { fall: "Only offered in fall lately: skip it this fall and the next chance is next fall.", spring: "Only offered in spring lately: skip it this spring and the next chance is next spring." },
    other: { fall: "Only offered in fall lately.", spring: "Only offered in spring lately." },
  },
  zh: {
    badge: { fall: "只在秋季开", spring: "只在春季开" },
    now: { fall: "最近只在秋季开课：这学期不修，下次要等到明年秋季。", spring: "最近只在春季开课：这学期不修，下次要等到明年春季。" },
    other: { fall: "最近只在秋季开课。", spring: "最近只在春季开课。" },
  },
} as const;

// One answer per course for the page's lifetime; the offering history itself is cached on the server.
const pending = new Map<string, Promise<Season | null>>();
let running = 0;
const queue: Array<() => void> = [];

function load(courseId: string): Promise<Season | null> {
  const cached = pending.get(courseId);
  if (cached) return cached;
  // At most four at a time: a course seen for the first time reads a few semesters from Testudo.
  const promise = new Promise<void>((resolve) => { if (running < 4) { running += 1; resolve(); } else queue.push(() => { running += 1; resolve(); }); })
    .then(() => fetch(`/api/trends/offerings?id=${encodeURIComponent(courseId)}&lang=en`))
    .then(async (response) => response.ok ? seasonOnly(((await response.json()) as { terms?: { term: string; sectionCount: number }[] }).terms ?? []) : null)
    .catch(() => null)
    .finally(() => { running -= 1; queue.shift()?.(); });
  pending.set(courseId, promise);
  return promise;
}

// The season each course is limited to, filled in as the answers arrive.
export function useOfferingSeasons(courseIds: string[]) {
  const key = [...new Set(courseIds)].sort().join(",");
  const [seasons, setSeasons] = useState<Record<string, Season | null>>({});
  useEffect(() => {
    let active = true;
    for (const id of key.split(",").filter(Boolean)) {
      void load(id).then((season) => { if (active) setSeasons((current) => current[id] === season && id in current ? current : { ...current, [id]: season }); });
    }
    return () => { active = false; };
  }, [key]);
  return seasons;
}

// "Spring only" as a badge, or the full sentence; the sentence warns when the course's one season is the
// term being planned.
export function SeasonNote({ season, term, language, compact = false }: { season: Season | null | undefined; term: string; language: Language; compact?: boolean }) {
  if (!season) return null;
  const t = copy[language];
  const sentence = termSeason(term) === season ? t.now[season] : t.other[season];
  if (compact) return <span title={sentence} className="ml-2 inline-block rounded-full border border-[#ead8b5] bg-[#fff8e8] px-2 py-0.5 align-middle text-[10px] font-semibold text-[#745424]">{t.badge[season]}</span>;
  return <p className="mt-1 text-xs font-medium text-[#745424]">⏳ {sentence}</p>;
}
