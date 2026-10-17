"use client";

import { useEffect, useState } from "react";
import { offeringVerdict } from "@/app/components/offering-history";
import type { OfferingHistory } from "@/lib/seat-trends";
import type { SeatSummary } from "@/lib/seat-summary";

type Language = "en" | "zh";
type Verdict = NonNullable<ReturnType<typeof offeringVerdict>>;

type WatchPreviewProps = {
  term: string;
  language: Language;
  courses: Array<{ courseId: string; courseTitle: string }>;
  // The section of each course in the schedule chosen in step 02, when there is one.
  chosen: Record<string, string>;
  watchedIds: Set<string>;
  // Sections the student asked to watch while signed out: watched right after they sign in.
  pendingIds: string[];
  onWatch: (courseId: string, sectionId: string) => void;
};

const texts = {
  en: {
    title: "Which sections to watch",
    intro: "Courses that filled up in past semesters lose their open seats soon after registration opens. Watch your section, and TerpPlan emails you when a seat opens in it.",
    pickFirst: "Generate a schedule in step 02, and you can watch the sections you chose right here.",
    loading: "Reading seats…",
    verdict: { full: "Past {season} semesters filled up", busy: "Past {season} semesters were nearly full", room: "Past {season} semesters usually had seats left" } as Record<Verdict, string>,
    noHistory: "No past semesters to compare",
    seasons: { "01": "spring", "05": "summer", "08": "fall", "12": "winter" } as Record<string, string>,
    yours: "Your section {id}", open: "{n} open seats now", full: "full now", unknown: "seats not listed",
    sections: "{open} of {n} sections have open seats",
    watch: "Watch {id}", watching: "Watching", afterSignIn: "Watched after you sign in",
  },
  zh: {
    title: "哪些班值得关注",
    intro: "往年坐满的课，开放选课后空位很快就会没有。关注你选的班，有空位时 TerpPlan 会发邮件提醒你。",
    pickFirst: "先在“排课”里生成课表，就能在这里直接关注你选的班。",
    loading: "正在读取空位…",
    verdict: { full: "往年{season}基本坐满", busy: "往年{season}大多接近坐满", room: "往年{season}通常还有空位" } as Record<Verdict, string>,
    noHistory: "没有往年数据可比",
    seasons: { "01": "春季", "05": "夏季", "08": "秋季", "12": "冬季" } as Record<string, string>,
    yours: "你选的班 {id}", open: "现在有 {n} 个空位", full: "现在已满", unknown: "没有列出空位",
    sections: "{n} 个班里 {open} 个有空位",
    watch: "关注 {id}", watching: "已关注", afterSignIn: "登录后就会关注",
  },
} as const;

const VERDICT_CLASS: Record<Verdict, string> = {
  full: "border-[#ead8b5] bg-[#fff8e8] text-[#745424]",
  busy: "border-[#ead8b5] bg-[#fffbf0] text-[#745424]",
  room: "border-[#cddbd1] bg-[#edf3ef] text-[#315c43]",
};

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));

// The plan's courses with what says whether to watch them: how full past semesters of the same season got,
// and the seats now in the section chosen in step 02. Courses that filled up come first.
export function WatchPreview({ term, language, courses, chosen, watchedIds, pendingIds, onWatch }: WatchPreviewProps) {
  const t = texts[language];
  const key = term + "|" + courses.map((course) => course.courseId).sort().join(",");
  const [data, setData] = useState<{ key: string; seats: Record<string, SeatSummary>; verdicts: Record<string, { verdict: Verdict | null; season: string }> } | null>(null);
  useEffect(() => {
    // The key stands for the term and the course list.
    const [keyTerm, list] = key.split("|");
    const ids = list.split(",").filter(Boolean);
    if (!ids.length) return;
    let active = true;
    const seats = fetch(`/api/seats?term=${encodeURIComponent(keyTerm)}&ids=${ids.join(",")}`)
      .then(async (response) => response.ok ? ((await response.json()) as { seats?: Record<string, SeatSummary> }).seats ?? {} : {})
      .catch(() => ({} as Record<string, SeatSummary>));
    const verdicts = Promise.all(ids.map((id) => fetch(`/api/trends/offerings?id=${encodeURIComponent(id)}&lang=en`)
      .then(async (response) => response.ok ? (await response.json()) as OfferingHistory : null)
      .catch(() => null)
      .then((history) => [id, { verdict: history?.terms.length ? offeringVerdict(history.terms) : null, season: history?.terms[0]?.term.slice(4) ?? "" }] as const)));
    void Promise.all([seats, verdicts]).then(([seatList, verdictList]) => { if (active) setData({ key, seats: seatList, verdicts: Object.fromEntries(verdictList) }); });
    return () => { active = false; };
  }, [key]);
  if (!courses.length) return null;
  const ready = data?.key === key ? data : null;
  const rank = (courseId: string) => ({ full: 0, busy: 1, room: 2 })[ready?.verdicts[courseId]?.verdict ?? "room"];
  const ordered = [...courses].sort((a, b) => rank(a.courseId) - rank(b.courseId));
  const anyChosen = courses.some((course) => chosen[course.courseId]);
  return <div className="mt-6 rounded-xl border border-[#e3dfd6] bg-white p-4 sm:p-5">
    <h3 className="text-sm font-semibold text-[#24312d]">{t.title}</h3>
    <p className="mt-1 text-xs leading-5 text-[#5d6561]">{t.intro}</p>
    {!anyChosen && <p className="mt-2 text-xs leading-5 text-[#745424]">{t.pickFirst}</p>}
    {!ready ? <p className="mt-3 text-xs text-[#646c68]">{t.loading}</p> : <ul className="mt-3 divide-y divide-[#ece9e2] border-t border-[#ece9e2]">{ordered.map((course) => {
      const verdict = ready.verdicts[course.courseId];
      const summary = ready.seats[course.courseId];
      const sectionId = chosen[course.courseId];
      const slot = sectionId ? summary?.slots?.find((item) => item.id === sectionId) : undefined;
      const seats = !sectionId || !summary ? null : slot?.open === null || slot === undefined ? t.unknown : slot.open > 0 ? fill(t.open, { n: slot.open }) : t.full;
      const watched = sectionId ? watchedIds.has(sectionId) : false;
      const pending = sectionId ? pendingIds.includes(sectionId) : false;
      return <li key={course.courseId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
        <div className="min-w-0">
          <p className="text-sm"><span className="font-semibold">{course.courseId}</span> <span className="text-[#646c68]">{course.courseTitle}</span></p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#5d6561]">
            {verdict?.verdict ? <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${VERDICT_CLASS[verdict.verdict]}`}>{fill(t.verdict[verdict.verdict], { season: t.seasons[verdict.season] ?? "" })}</span> : <span className="text-[#646c68]">{t.noHistory}</span>}
            {sectionId && <span>{fill(t.yours, { id: sectionId })}{seats ? ` · ${seats}` : ""}</span>}
            {summary && summary.sections > 0 && <span className="text-[#646c68]">{fill(t.sections, { open: summary.openSections, n: summary.sections })}</span>}
          </p>
        </div>
        {sectionId && (watched
          ? <span className="shrink-0 rounded-full bg-[#eaf4ec] px-2.5 py-1 text-xs font-semibold text-[#367047]">✓ {t.watching}</span>
          : pending ? <span className="shrink-0 text-xs text-[#745424]">{t.afterSignIn}</span>
          : <button type="button" onClick={() => onWatch(course.courseId, sectionId)} className="shrink-0 rounded-lg border border-[#536d64] px-3 py-1.5 text-xs font-semibold text-[#273c38] hover:bg-[#edf3ef]">{fill(t.watch, { id: sectionId })}</button>)}
      </li>;
    })}</ul>}
  </div>;
}
