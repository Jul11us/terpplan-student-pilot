"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FIRST_DEMO_WEEK, nextDemoWeek, PERSONAL_COMMITMENTS, PREFERENCES, weekBlocks, weekExplanation, weekSignature, type DemoWeek, type Meeting, type Preference } from "@/lib/home-timetable";

type Language = "en" | "zh";
// Course colours, muted to sit with the page's greens and brick reds: a soft fill, a deeper accent and dark text from
// one hue. The week's courses take them in order, so no two share a colour, and a course that replaces another
// takes its colour.
const TONES = [
  { fill: "#f8e6e0", accent: "#c4624b", text: "#6f2a1c" },
  { fill: "#e2eee6", accent: "#5b9474", text: "#21493a" },
  { fill: "#e4e9f3", accent: "#6782b3", text: "#24395e" },
  { fill: "#f6ecd3", accent: "#c99a32", text: "#5b4110" },
  { fill: "#eee4f1", accent: "#94689e", text: "#4b2a55" },
  { fill: "#dfeeed", accent: "#3f8f8c", text: "#1c4a48" },
];
const toneFor = (week: DemoWeek, id: string) => TONES[Math.max(0, week.courses.indexOf(id)) % TONES.length]!;
// A job or practice is time that is taken, not a class: soft stripes inside a dashed outline.
const HATCH = "repeating-linear-gradient(135deg, rgba(120, 113, 100, .11) 0 4px, transparent 4px 9px)";
const OWN_STYLE: CSSProperties = { backgroundColor: "#f4f2ed", backgroundImage: HATCH, color: "#56605b", outline: "1px dashed #c9c3b7", outlineOffset: "-1px" };
const at = (hour: number) => ((hour - 8) / 10) * 100;
// Labels every two hours from 8am to 6pm; a hairline every hour inside each day.
const TIME_MARKS = [8, 10, 12, 14, 16, 18];
const HOUR_LINES = [9, 10, 11, 12, 13, 14, 15, 16, 17];
const hourLabel = (hour: number, language: Language) => language === "zh" ? `${hour}:00` : hour === 12 ? "12pm" : hour < 12 ? `${hour}am` : `${hour - 12}pm`;
const minutes = (hour: number) => Math.round((hour % 1) * 60);
// "9:30–10:45" / "1–4" in English (the hours beside the grid say am or pm), "13:00–16:00" in Chinese.
function timeRange(start: number, end: number, language: Language) {
  if (language === "zh") return [start, end].map((hour) => `${Math.floor(hour)}:${String(minutes(hour)).padStart(2, "0")}`).join("–");
  const short = (hour: number) => `${((Math.floor(hour) + 11) % 12) + 1}${minutes(hour) ? `:${String(minutes(hour)).padStart(2, "0")}` : ""}`;
  return `${short(start)}–${short(end)}`;
}
// Long enough (75-minute classes, jobs) to show the time under the name.
const showsTime = (meeting: Meeting) => meeting.end - meeting.start >= 1.2;
// Inside its day, with a little air around it.
const position = (meeting: Meeting): CSSProperties => ({
  left: `calc(${meeting.day} * (100% + 6px) / 5 + 2px)`, width: "calc((100% - 24px) / 5 - 4px)",
  top: `calc(${at(meeting.start)}% + 1px)`, height: `calc(${at(meeting.end) - at(meeting.start)}% - 2px)`,
});
// The time a preference keeps free, shaded in the green of its chip.
const keptFree = (preference: Preference, day: number): { top: number; bottom: number } | null =>
  preference === "earlyEnd" ? { top: at(15), bottom: 100 } : preference === "lateStart" ? { top: 0, bottom: at(10) } : preference === "noFriday" && day === 4 ? { top: 0, bottom: 100 } : null;
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

// Small line drawings for the personal commitments, by kind.
function CommitmentIcon({ kind }: { kind: string }) {
  const paths: Record<string, ReactNode> = {
    Job: <><rect x="2.5" y="5" width="11" height="8" rx="1.5" /><path d="M6 5V3.8A1.3 1.3 0 0 1 7.3 2.5h1.4A1.3 1.3 0 0 1 10 3.8V5M2.5 8.5h11" /></>,
    Gym: <path d="M1.5 8h13M4 4.5v7M12 4.5v7M2 6v4M14 6v4" />,
    Club: <><circle cx="6" cy="5.5" r="2.2" /><path d="M2 13c.4-2.3 2-3.6 4-3.6s3.6 1.3 4 3.6" /><path d="M10.5 3.6a2 2 0 0 1 0 3.9M12 9.6c1.2.5 2 1.6 2.2 3.4" /></>,
    Lunch: <><path d="M3 6.5h8.5v3A3.5 3.5 0 0 1 8 13H6.5A3.5 3.5 0 0 1 3 9.5z" /><path d="M11.5 7.5h.8a1.8 1.8 0 0 1 0 3.6h-1" /><path d="M6 2.5v2M8.5 2.5v2" /></>,
    Practice: <path d="M4 14V2.5M4 3h8l-1.6 3L12 9H4" />,
  };
  return <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{paths[kind] ?? paths.Job}</svg>;
}

export function TimetableSketch({ language }: { language: Language }) {
  const days = language === "zh" ? ["周一", "周二", "周三", "周四", "周五"] : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const [preview, setPreview] = useState<{ before: DemoWeek | null; week: DemoWeek; step: number }>({ before: null, week: FIRST_DEMO_WEEK, step: 0 });
  const [paused, setPaused] = useState(false);
  const figure = useRef<HTMLElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const rectangles = useRef(new Map<string, DOMRect>());
  const animations = useRef<Animation[]>([]);
  const recent = useRef([weekSignature(FIRST_DEMO_WEEK)]);
  const onScreen = useRef(true);
  const { week } = preview;
  const blocks = weekBlocks(week, language);
  const currentKeys = new Set(blocks.map((block) => block.key));
  const exiting = preview.before ? weekBlocks(preview.before, language).filter((block) => !currentKeys.has(block.key)) : [];
  const explanation = weekExplanation(preview.before, week, language);
  const own = PERSONAL_COMMITMENTS[week.own]!;
  const preference = PREFERENCES[week.preference];

  const advance = useCallback(() => {
    // Capture the visible positions before React moves them, including an interrupted transition.
    const previous = new Map<string, DOMRect>();
    grid.current?.querySelectorAll<HTMLElement>("[data-sketch-block]").forEach((element) => previous.set(element.dataset.sketchBlock!, element.getBoundingClientRect()));
    rectangles.current = previous;
    setPreview((current) => ({ before: current.week, week: nextDemoWeek(current.week, current.step, recent.current), step: current.step + 1 }));
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { onScreen.current = entry?.isIntersecting ?? false; }, { threshold: 0.15 });
    if (figure.current) observer.observe(figure.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (paused) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Give the result and caption time to settle. Offscreen/background demos do no work.
    const timer = window.setInterval(() => {
      if (!reduced.matches && onScreen.current && !document.hidden) advance();
    }, 4500);
    return () => window.clearInterval(timer);
  }, [advance, paused]);

  useLayoutEffect(() => {
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
    const signature = weekSignature(week);
    if (recent.current.at(-1) !== signature) recent.current = [...recent.current.slice(-11), signature];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !preview.before) return;
    grid.current?.querySelectorAll<HTMLElement>("[data-sketch-block]").forEach((element) => {
      const next = element.getBoundingClientRect();
      const before = rectangles.current.get(element.dataset.sketchBlock!);
      if (before) {
        const dx = before.left - next.left, dy = before.top - next.top;
        const sx = before.width / next.width, sy = before.height / next.height;
        if (dx || dy || sx !== 1 || sy !== 1) animations.current.push(element.animate([
          { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
          { transform: "none" },
        ], { duration: 650, easing: EASING }));
        // A class that moved glows briefly once it lands, so the eye finds what the caption describes.
        if (dx || dy) animations.current.push(element.animate([
          { boxShadow: "0 0 0 0 rgba(39, 60, 56, 0)" }, { boxShadow: "0 0 0 3px rgba(39, 60, 56, .28)" }, { boxShadow: "0 0 0 0 rgba(39, 60, 56, 0)" },
        ], { duration: 1400, delay: 550, easing: "ease-out" }));
      } else animations.current.push(element.animate([
        { opacity: 0, transform: "translateY(6px) scale(.96)" },
        { opacity: 1, transform: "none" },
      ], { duration: 400, delay: 100, easing: EASING, fill: "backwards" }));
      if (!before) animations.current.push(element.animate([
        { boxShadow: "0 0 0 0 rgba(39, 60, 56, 0)" }, { boxShadow: "0 0 0 3px rgba(39, 60, 56, .28)" }, { boxShadow: "0 0 0 0 rgba(39, 60, 56, 0)" },
      ], { duration: 1400, delay: 450, easing: "ease-out" }));
    });
    return () => animations.current.forEach((animation) => animation.cancel());
  }, [week, preview.before]);

  // One block: a class (its colour, an accent bar, the code and, when there is room, the time) or a commitment.
  const block = (item: ReturnType<typeof weekBlocks>[number], owner: DemoWeek, extra: { className?: string; sketchKey?: string }) => {
    const { label, personal, meeting } = item;
    const tone = personal ? null : toneFor(owner, label);
    const short = !showsTime(meeting);
    const style: CSSProperties = { ...position(meeting), ...(tone ? { backgroundColor: tone.fill, color: tone.text, outline: `1px solid ${tone.accent}26`, outlineOffset: "-1px" } : OWN_STYLE) };
    return <div key={extra.sketchKey ?? `exit-${preview.step}-${item.key}`} data-sketch-block={extra.sketchKey} style={style}
      className={`absolute flex origin-top-left flex-col overflow-hidden rounded-[7px] leading-tight shadow-[0_1px_2px_rgba(32,39,40,.06)] ${personal ? "items-center justify-center px-1 text-center" : `pl-[9px] pr-1 sm:pl-[10px] ${short ? "justify-center" : "justify-start pt-1"}`} ${extra.className ?? ""}`}>
      {tone && <span aria-hidden="true" className="absolute bottom-[3px] left-[3px] top-[3px] w-[3px] rounded-full" style={{ backgroundColor: tone.accent }} />}
      {personal ? <>
        <span className="flex items-center gap-1 text-[9px] font-semibold sm:text-[10.5px]"><CommitmentIcon kind={PERSONAL_COMMITMENTS[owner.own]!.label.en} /><span className="truncate">{label}</span></span>
        {!short && <span className="mt-0.5 hidden truncate text-[9.5px] font-medium opacity-75 sm:block">{timeRange(meeting.start, meeting.end, language)}</span>}
      </> : <>
        {/* Phone columns are too narrow for "CMSC132" on one line: department over number there. */}
        <span className="text-[9px] font-semibold leading-[1.05] sm:hidden">{label.slice(0, 4)}<br />{label.slice(4)}</span>
        <span className="hidden truncate text-[11px] font-semibold tracking-[.01em] sm:block">{label}</span>
        {!short && <span className="mt-0.5 hidden truncate text-[9.5px] font-medium tabular-nums opacity-75 sm:block">{timeRange(meeting.start, meeting.end, language)}</span>}
      </>}
    </div>;
  };

  return <figure ref={figure} className="timetable-sketch rounded-2xl border border-[#e4e0d8] bg-white p-3 shadow-[0_1px_2px_rgba(32,39,40,.04),0_18px_40px_-22px_rgba(32,39,40,.28)] sm:p-4">
    <div className="mb-2 flex items-center justify-between gap-2 px-1">
      <span className="text-[11px] font-semibold tracking-wide text-[#5d6561]">{language === "zh" ? "示例课表 · 5 门课" : "Sample schedule · 5 courses"}</span>
      <div className="flex items-center gap-1">
        <button type="button" aria-label={language === "zh" ? paused ? "继续课表动画" : "暂停课表动画" : paused ? "Resume schedule animation" : "Pause schedule animation"} aria-pressed={paused} onClick={() => setPaused((value) => !value)} className="sketch-control flex h-8 w-8 items-center justify-center rounded-full text-[#646c68] hover:bg-[#f1efe9] hover:text-[#273c38] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#536d64]">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">{paused ? <path d="M4 2.5 13 8l-9 5.5z" /> : <><rect x="4" y="3" width="3" height="10" rx=".6" /><rect x="9" y="3" width="3" height="10" rx=".6" /></>}</svg>
        </button>
        <button type="button" onClick={advance} aria-label={language === "zh" ? "换一个课表组合" : "Show another schedule"} className="sketch-control flex h-8 w-8 items-center justify-center rounded-full text-[#646c68] hover:bg-[#f1efe9] hover:text-[#273c38] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#536d64]">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h9M8 4l4 4-4 4" /></svg>
        </button>
      </div>
    </div>
    {/* What the schedule was built around, keyed like the grid: hatched for a commitment, green for a preference. */}
    <div aria-hidden="true" className="mb-3 flex min-h-7 content-start flex-wrap items-start gap-1.5 px-1 text-[11px] font-semibold">
      <span key={`own-${week.own}`} className="sketch-copy inline-flex items-center gap-1.5 rounded-full border border-[#e6e2da] bg-[#faf9f6] px-2.5 py-1 text-[#48534f]">
        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: "#f4f2ed", backgroundImage: HATCH, outline: "1px dashed #b9b2a5", outlineOffset: "-1px" }} />{own.text[language]}
      </span>
      {preference && <span key={week.preference} className="sketch-copy inline-flex items-center gap-1.5 rounded-full border border-[#d3e2d8] bg-[#f1f6f2] px-2.5 py-1 text-[#273c38]">
        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] border border-[#8fb19c] bg-[#d9e8de]" />{preference[language]}
      </span>}
    </div>
    <div aria-hidden="true" className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-1.5 gap-y-2 sm:grid-cols-[30px_minmax(0,1fr)] sm:gap-x-2">
      <span />
      <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] font-semibold text-[#5d6561]">{days.map((day, index) => <span key={day} className={`transition-opacity duration-500 motion-reduce:transition-none ${language === "en" ? "uppercase tracking-[.08em]" : ""} ${week.preference === "noFriday" && index === 4 ? "opacity-40" : ""}`}>{day}</span>)}</div>
      <div className="relative h-64 text-[9px] tabular-nums text-[#959b96] sm:h-[19rem] sm:text-[10px]">
        {TIME_MARKS.map((hour) => <span key={hour} data-sketch-time={hour} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${at(hour)}%` }}>{hourLabel(hour, language)}</span>)}
      </div>
      <div ref={grid} className="relative grid h-64 grid-cols-5 gap-1.5 sm:h-[19rem]">
        {days.map((day, index) => {
          const free = (["earlyEnd", "lateStart", "noFriday"] as const).map((kind) => ({ kind, span: keptFree(kind, index) }));
          return <div key={day} className="relative overflow-hidden rounded-lg bg-[#f8f6f2]">
            {HOUR_LINES.map((hour) => <span key={hour} className="absolute inset-x-0 h-px" style={{ top: `${at(hour)}%`, backgroundColor: hour % 2 ? "rgba(32, 39, 40, .035)" : "rgba(32, 39, 40, .07)" }} />)}
            {/* Every kind of kept-free time is drawn, and the one in use fades in. */}
            {free.map(({ kind, span }) => span && <span key={kind} className={`absolute inset-x-0 transition-opacity duration-500 motion-reduce:transition-none ${week.preference === kind ? "opacity-100" : "opacity-0"}`}
              style={{ top: `${span.top}%`, bottom: `${100 - span.bottom}%`, backgroundColor: "rgba(83, 129, 104, .09)", borderTop: span.top > 0 ? "1px dashed rgba(83, 129, 104, .45)" : undefined, borderBottom: span.bottom < 100 ? "1px dashed rgba(83, 129, 104, .45)" : undefined }} />)}
          </div>;
        })}
        {exiting.map((item) => block(item, preview.before!, { className: "sketch-out pointer-events-none" }))}
        {blocks.map((item) => block(item, week, { sketchKey: item.key }))}
      </div>
    </div>
    <figcaption className="mt-3 flex min-h-14 items-start gap-2 border-t border-[#eeece6] px-1 pt-3 text-xs leading-5 text-[#48534f]">
      <span aria-hidden="true" className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#315c43] text-[9px] font-bold text-white">✓</span>
      <span key={`${preview.step}-${language}`} className="sketch-copy">{explanation}</span>
    </figcaption>
  </figure>;
}
