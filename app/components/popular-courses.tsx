"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { sharingEnabled, sharingId, setSharing, subscribeSharing } from "@/lib/popularity-sharing";
import type { PopularCourse } from "@/lib/seat-trends";

type Language = "en" | "zh";

type PopularCoursesProps = {
  term: string;
  lang: Language;
  courseIds: string[];
  onCourseClick?: (courseId: string) => void;
};

// A list from a handful of shared plans would read like a campus ranking, so it waits for a few courses.
const MIN_COURSES = 3;
const SHOWN = 8;

const texts = {
  en: {
    title: "Popular in shared plans",
    share: "Share anonymous course counts from this plan for the popularity list (optional)",
    shareNote: "Sharing sends the term, course codes and a random browser ID. Counts reflect voluntary shared plans, not campus enrollment.",
    syncFailed: "Shared counts have not been updated. Please try again later.",
    waiting: "The list appears once enough plans are shared.",
    browsers: (n: number) => `in ${n} shared plan${n === 1 ? "" : "s"}`,
    stillPlanned: (n: number) => `${n} still planned`,
    rising: "↗ Rising",
    stable: "→ Stable",
    falling: "↘ Falling",
  },
  zh: {
    title: "共享计划里的热门课程",
    share: "分享当前计划的匿名课程统计，帮助生成热门榜（可随时关闭）",
    shareNote: "开启后仅发送学期、课程编号和随机浏览器编号。榜单来自自愿共享的样本；不代表全校选课人数。",
    syncFailed: "共享统计尚未更新，请稍后重试。",
    waiting: "共享的计划够多之后，这里会显示榜单。",
    browsers: (n: number) => `${n} 个共享计划加过`,
    stillPlanned: (n: number) => `${n} 个仍在计划中`,
    rising: "↗ 上升",
    stable: "→ 稳定",
    falling: "↘ 下降",
  },
} as const;

const TREND_CLASS = {
  rising: "border-[#cddbd1] bg-[#edf3ef] text-[#315c43]",
  stable: "border-[#e0ddd5] bg-[#f6f4ef] text-[#48534f]",
  falling: "border-[#ead8b5] bg-[#fff8e8] text-[#745424]",
} as const;

export function PopularCourses({ term, lang, courseIds, onCourseClick }: PopularCoursesProps) {
  const t = texts[lang];
  const shared = useSyncExternalStore(subscribeSharing, sharingEnabled, () => false);
  const [revision, setRevision] = useState(0);
  const [syncFailed, setSyncFailed] = useState(false);
  const courseKey = [...new Set(courseIds)].sort().join(",");
  useEffect(() => {
    const id = sharingId();
    if (!id) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch("/api/trends/activity", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ term, id, courseIds: shared ? courseKey.split(",").filter(Boolean) : [], withdraw: !shared }), signal: controller.signal })
        .then((response) => { if (!response.ok) throw new Error("sharing"); if (!controller.signal.aborted) { setSyncFailed(false); setRevision((value) => value + 1); } })
        .catch(() => { if (!controller.signal.aborted) setSyncFailed(true); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term, courseKey, shared]);
  return <section aria-label={t.title} className="mb-5 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] px-4 py-3 sm:px-5">
    <PopularCourseList key={term + "|" + revision} term={term} lang={lang} onCourseClick={onCourseClick} />
    <label className="flex items-start gap-2 text-xs text-[#48534f]"><input type="checkbox" checked={shared} onChange={(event) => setSharing(event.target.checked)} className="mt-0.5 accent-[#273c38]" />{t.share}</label>
    <p className="mt-1 pl-5 text-[11px] leading-4 text-[#646c68]">{t.shareNote}</p>
    {syncFailed && <p role="alert" className="mt-1 pl-5 text-xs text-[#8c352c]">{t.syncFailed}</p>}
  </section>;
}

function PopularCourseList({ term, lang, onCourseClick }: { term: string; lang: Language; onCourseClick?: (courseId: string) => void }) {
  const t = texts[lang];
  const [state, setState] = useState<{ courses: PopularCourse[]; error: boolean } | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/trends/popular?term=${encodeURIComponent(term)}&limit=20`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        if (!data || typeof data !== "object" || !("courses" in data) || !Array.isArray(data.courses)) throw new Error("Invalid popularity response");
        if (mounted) setState({ courses: data.courses as PopularCourse[], error: false });
      })
      .catch(() => { if (mounted) setState({ courses: [], error: true }); });
    return () => { mounted = false; };
  }, [term]);

  // Nothing while loading or on error (only the sharing choice shows); a short line while there are too few
  // courses for a list.
  if (!state || state.error) return null;
  if (state.courses.length < MIN_COURSES) return <p className="mb-2 text-xs text-[#646c68]"><span className="font-semibold text-[#48534f]">{t.title}</span> · {t.waiting}</p>;

  return <div className="mb-3">
    <p className="text-xs font-semibold uppercase tracking-[.13em] text-[#9a5040]">{t.title}</p>
    <ol className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{state.courses.slice(0, SHOWN).map((course, index) => <li key={course.courseId} className={index >= 4 ? "hidden sm:block" : undefined}>
      <button type="button" disabled={!onCourseClick} onClick={() => onCourseClick?.(course.courseId)} className="flex h-full w-full items-start gap-2.5 rounded-xl border border-[#e3e0d8] bg-white px-3 py-2.5 text-left enabled:hover:border-[#536d64] enabled:hover:bg-[#f7faf8]">
        <span className="mt-0.5 w-5 shrink-0 text-xs font-semibold text-[#646c68]">{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-[#24312d]">{course.courseId}</span><span className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium ${TREND_CLASS[course.trendDirection]}`}>{t[course.trendDirection]}</span></span>
          <span className="mt-0.5 block truncate text-xs text-[#5d6561]">{course.courseTitle}</span>
          <span className="mt-1 block text-[11px] text-[#646c68]">{t.browsers(course.planCount)} · {t.stillPlanned(course.activeCount)}</span>
        </span>
      </button>
    </li>)}</ol>
  </div>;
}
