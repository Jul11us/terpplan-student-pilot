"use client";

// The details behind an instructor's name: their PlanetTerp rating, the average GPA they gave, how those
// grades were spread, and a few comment excerpts. It opens on hover for a mouse, on focus for a keyboard,
// and on tap for a phone, where hover does not exist. Nothing is fetched until it is opened, so a page
// listing thirty instructors still makes no requests until one is asked about.

import { useEffect, useId, useRef, useState } from "react";
import type { ProfessorCard } from "@/lib/planetterp";
import ReviewThemes from "@/app/components/review-themes";

type Language = "en" | "zh";

// Cards already fetched in this page view, so moving back over a name does not ask again. Bounded, because
// a long session of searching could otherwise keep every instructor ever hovered.
const CACHE_LIMIT = 60;
const cache = new Map<string, ProfessorCard>();

const cacheKey = (name: string, courseId: string) => name.trim().toLocaleLowerCase("en-US") + "|" + courseId;

function remember(key: string, card: ProfessorCard) {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, card);
}

const labels = {
  en: {
    rating: "Rating", reviews: "{n} reviews", noRating: "No average rating",
    gpaCourse: "Average GPA in {course}", gpaAll: "Average GPA, all their courses",
    students: "{n} students", semesters: "{n} semesters", withdrew: "{n} withdrew",
    gradesCourse: "Grades given in {course}", gradesAll: "Grades given, all their courses",
    comments: "What students wrote", source: "Full profile on PlanetTerp",
    loading: "Loading…", failed: "PlanetTerp details could not be loaded.", unmatched: "Not matched on PlanetTerp",
    noGrades: "No grade data on PlanetTerp yet.", noComments: "No usable comments yet.",
    open: "Instructor details", close: "Close",
    note: "Student-submitted ratings and comments, and UMD grade data, from PlanetTerp. Past grades are not a promise about this term.",
  },
  zh: {
    rating: "评分", reviews: "{n} 条评价", noRating: "暂无平均分",
    gpaCourse: "{course} 平均 GPA", gpaAll: "所有课程平均 GPA",
    students: "{n} 名学生", semesters: "{n} 个学期", withdrew: "{n} 人退课",
    gradesCourse: "{course} 给分分布", gradesAll: "所有课程给分分布",
    comments: "学生怎么说", source: "在 PlanetTerp 查看完整主页",
    loading: "正在加载…", failed: "暂时无法加载 PlanetTerp 详情。", unmatched: "未能在 PlanetTerp 确认该教师",
    noGrades: "PlanetTerp 暂无该教师的成绩数据。", noComments: "暂无可展示的评论。",
    open: "教师详情", close: "关闭",
    note: "评分与评论来自 PlanetTerp 学生投稿，给分数据来自 UMD 历史成绩。过去的给分不代表本学期。",
  },
} as const;

const BAND_COLORS: Record<string, string> = {
  A: "bg-[#4e7d5c]", B: "bg-[#7fa07f]", C: "bg-[#c8b06a]", D: "bg-[#c08a5e]", F: "bg-[#a8584a]",
};

function GradeBar({ grades, language }: { grades: NonNullable<ProfessorCard["grades"]>; language: Language }) {
  const t = labels[language];
  return <div className="mt-1.5">
    {/* The bar is decoration for the numbers listed under it, which are the accessible form of the same data. */}
    <div aria-hidden="true" className="flex h-2.5 overflow-hidden rounded-full bg-[#eceae3]">
      {grades.bands.filter((band) => band.students > 0).map((band) => <span key={band.band} style={{ width: `${band.percent}%` }} className={BAND_COLORS[band.band]} />)}
    </div>
    {/* Each letter is wrapped in a div, the only element HTML allows to group a dt/dd pair inside a dl. */}
    <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[#5d6561]">
      {grades.bands.map((band) => <div key={band.band} className="inline-flex items-center gap-1">
        <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-sm ${BAND_COLORS[band.band]}`} />
        <dt className="font-semibold">{band.band}</dt>
        <dd>{band.percent}%</dd>
      </div>)}
    </dl>
    <p className="mt-1 text-[11px] text-[#646c68]">
      {[t.students.replace("{n}", grades.students.toLocaleString()), grades.semesters ? t.semesters.replace("{n}", String(grades.semesters)) : null, grades.withdrew ? t.withdrew.replace("{n}", String(grades.withdrew)) : null].filter(Boolean).join(" · ")}
    </p>
  </div>;
}

function CardBody({ card, courseId, language }: { card: ProfessorCard; courseId: string; language: Language }) {
  const t = labels[language];
  const course = card.courseId ?? courseId;
  if (card.status === "failed") return <p className="text-xs text-[#8c352c]">{t.failed}</p>;
  if (!card.matched) return <p className="text-xs text-[#5d6561]">{t.unmatched}</p>;
  return <>
    <p className="text-xs font-semibold text-[#3e4945]">{card.name}</p>
    <p className="mt-1 text-xs text-[#48534f]">
      {card.averageRating === null ? t.noRating : <>★ {card.averageRating.toFixed(2)} / 5</>}
      {card.reviewCount ? <span className="ml-1.5 text-[#646c68]">{t.reviews.replace("{n}", String(card.reviewCount))}</span> : null}
    </p>
    {card.gpa && <p className="mt-2 text-xs text-[#48534f]">
      <span className="font-medium">{(card.gpa.scope === "course" ? t.gpaCourse : t.gpaAll).replace("{course}", course)}:</span> {card.gpa.gpa.toFixed(2)}
    </p>}
    <section className="mt-2">
      <h4 className="text-[11px] font-semibold text-[#5d6561]">{(card.grades?.scope === "course" ? t.gradesCourse : t.gradesAll).replace("{course}", course)}</h4>
      {card.grades ? <GradeBar grades={card.grades} language={language} /> : <p className="mt-1 text-[11px] text-[#646c68]">{t.noGrades}</p>}
    </section>
    <section className="mt-3 border-t border-[#ece9e2] pt-2">
      <ReviewThemes themes={card.themes} total={card.reviewCount} language={language} compact />
      <h4 className="mt-2 text-[11px] font-semibold text-[#5d6561]">{t.comments}</h4>
      {card.highlights.length ? <ul className="mt-1 space-y-1.5">
        {card.highlights.map((item, index) => <li key={index} className="text-[11px] leading-5 text-[#3e4945]">
          <span className="text-[#646c68]">{[item.courseId ?? course, item.rating !== null ? `★ ${item.rating}/5` : null].filter(Boolean).join(" · ")}</span>
          <span className="mt-0.5 block">{item.excerpt}</span>
        </li>)}
      </ul> : <p className="mt-1 text-[11px] text-[#646c68]">{t.noComments}</p>}
    </section>
    {card.sourceUrl && <a href={card.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[11px] font-semibold text-[#9a5040] hover:underline">{t.source} ↗</a>}
    <p className="mt-2 text-[10px] leading-4 text-[#8b918d]">{t.note}</p>
  </>;
}

export default function ProfessorDetailCard({ name, courseId, language, children }: { name: string; courseId: string; language: Language; children: React.ReactNode }) {
  const t = labels[language];
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<ProfessorCard | null>(() => cache.get(cacheKey(name, courseId)) ?? null);
  const [loading, setLoading] = useState(false);
  // Hovering across the gap between the name and the panel should not count as leaving.
  const closeTimer = useRef<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); abort.current?.abort(); }, []);

  const load = async () => {
    const key = cacheKey(name, courseId);
    const cached = cache.get(key);
    if (cached) { setCard(cached); return; }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams({ name });
      if (courseId) params.set("course", courseId);
      const response = await fetch("/api/professor-card?" + params.toString(), { signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error("card");
      remember(key, payload as ProfessorCard);
      setCard(payload as ProfessorCard);
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      setCard({ name, matched: false, status: "failed", averageRating: null, reviewCount: null, sourceUrl: null, highlights: [], gpa: null, grades: null, courseId: courseId || null });
    } finally {
      setLoading(false);
    }
  };

  const show = () => {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
    setOpen(true);
    void load();
  };
  // Closing is delayed only for a pointer leaving; focus and Escape close at once.
  const hide = (delay = 120) => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), delay);
  };

  // The name itself is left exactly as the caller rendered it, which keeps the existing link to the
  // instructor's page working; the card gets its own small trigger next to it. Hover anywhere over the pair
  // opens the card, and the button is what a keyboard tabs to and a phone taps.
  return <div className="relative inline-flex items-center gap-1" onMouseEnter={show} onMouseLeave={() => hide()} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hide(0); }} onKeyDown={(event) => { if (event.key === "Escape" && open) { event.stopPropagation(); hide(0); } }}>
    {children}
    <button
      type="button"
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      aria-label={`${t.open}: ${name}`}
      onFocus={show}
      // Focus and hover may open the panel before click fires. A click should keep it open.
      onClick={show}
      className="grid h-4 w-4 flex-none place-items-center rounded-full border border-[#9aa59f] text-[10px] font-bold leading-none text-[#59635f] hover:border-[#536d64] hover:text-[#273c38]"
    >i</button>
    {/* A div, not a span, because the body inside is block content; and a group rather than a tooltip, since
        a tooltip is meant to be a short label and this panel has headings and links a student can reach. */}
    {open && <div
      id={panelId}
      role="group"
      aria-label={`${t.open}: ${name}`}
      // On a phone the panel is a full-width sheet under the name; on a wider screen it floats beside it.
      className="absolute left-0 top-full z-30 mt-1 w-[min(20rem,calc(100vw-2.5rem))] rounded-xl border border-[#e0ddd5] bg-white p-3 text-left font-normal shadow-lg"
    >
      <div className="mb-1 flex justify-end"><button type="button" onClick={() => hide(0)} className="rounded px-1.5 py-0.5 text-[11px] text-[#5d6561] hover:bg-[#f2f0eb]">{t.close}</button></div>
      {card ? <CardBody card={card} courseId={courseId} language={language} /> : <p className="text-xs text-[#5d6561]">{loading ? t.loading : t.failed}</p>}
    </div>}
  </div>;
}
