"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FIRST_DEMO_WEEK, nextDemoWeek, PERSONAL_COMMITMENTS, PREFERENCES, weekBlocks, weekExplanation, weekSignature, type DemoWeek, type Meeting } from "@/lib/home-timetable";

type Language = "en" | "zh";
// Each course: a soft fill, its text colour and a darker stripe down the left edge, like a calendar event.
const TONES = [
  "bg-[#fbe3e0] text-[#7c2f27] border-[#d9786a]", "bg-[#dcf0e9] text-[#24524a] border-[#5fae96]", "bg-[#f7ebc6] text-[#5f4316] border-[#d1a23c]", "bg-[#e5e0f4] text-[#3e3470] border-[#8b7fd0]",
  "bg-[#e0ecf8] text-[#24496b] border-[#6d9ccc]", "bg-[#fbe5d2] text-[#7a3f12] border-[#e08c4c]", "bg-[#e8f1da] text-[#3d5520] border-[#8db45a]",
];
const toneOf = (id: string) => TONES[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % TONES.length]!;
// A job or practice is time that is taken, not a class: grey stripes inside a dashed outline.
const OWN_TONE = "border-transparent text-[#5d6561] outline-dashed outline-1 -outline-offset-1 outline-[#bdb8ad]";
const OWN_FILL = { backgroundImage: "repeating-linear-gradient(135deg, #ece9e2 0 6px, #e4e0d8 6px 12px)" };
const at = (hour: number) => ((hour - 8) / 10) * 100;
// Every two hours from 8am to 6pm; lines between, labels on all.
const TIME_MARKS = [8, 10, 12, 14, 16, 18];
const hourLabel = (hour: number, language: Language) => language === "zh" ? `${hour}:00` : hour === 12 ? "12pm" : hour < 12 ? `${hour}am` : `${hour - 12}pm`;
const minutes = (hour: number) => Math.round((hour % 1) * 60);
// "9:30–10:45" / "1–4pm" in English, "13:00–16:00" in Chinese.
function timeRange(start: number, end: number, language: Language) {
  if (language === "zh") return [start, end].map((hour) => `${Math.floor(hour)}:${String(minutes(hour)).padStart(2, "0")}`).join("–");
  const short = (hour: number) => `${((Math.floor(hour) + 11) % 12) + 1}${minutes(hour) ? `:${String(minutes(hour)).padStart(2, "0")}` : ""}`;
  return `${short(start)}–${short(end)}${end >= 12 ? "pm" : "am"}`;
}
// Long enough (75-minute classes, jobs) to show the time under the name.
const showsTime = (meeting: Meeting) => meeting.end - meeting.start >= 1.2;
const position = (meeting: Meeting) => ({ left: `calc(${meeting.day} * (100% + 6px) / 5)`, width: "calc((100% - 24px) / 5)", top: `${at(meeting.start)}%`, height: `${at(meeting.end) - at(meeting.start)}%` });
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

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

  return <figure ref={figure} className="timetable-sketch rounded-2xl border border-[#e0ddd5] bg-white p-3 shadow-sm">
    <div className="mb-2 flex items-center justify-between gap-2 px-1">
      <span className="text-[10px] font-semibold tracking-wide text-[#7a817d]">{language === "zh" ? "示例课表 · 5 门课" : "Sample schedule · 5 courses"}</span>
      <div className="flex items-center gap-1">
        <button type="button" aria-label={language === "zh" ? paused ? "继续课表动画" : "暂停课表动画" : paused ? "Resume schedule animation" : "Pause schedule animation"} aria-pressed={paused} onClick={() => setPaused((value) => !value)} className="sketch-control flex h-8 w-8 items-center justify-center rounded-full text-[#646c68] hover:bg-[#f1efe9] hover:text-[#273c38] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#536d64]">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">{paused ? <path d="M4 2.5 13 8l-9 5.5z" /> : <><rect x="4" y="3" width="3" height="10" rx=".6" /><rect x="9" y="3" width="3" height="10" rx=".6" /></>}</svg>
        </button>
        <button type="button" onClick={advance} aria-label={language === "zh" ? "换一个课表组合" : "Show another schedule"} className="sketch-control flex h-8 w-8 items-center justify-center rounded-full text-[#646c68] hover:bg-[#f1efe9] hover:text-[#273c38] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#536d64]">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h9M8 4l4 4-4 4" /></svg>
        </button>
      </div>
    </div>
    <div aria-hidden="true" className="mb-3 flex min-h-7 content-start flex-wrap items-start gap-1.5 px-1 text-[11px] font-semibold">
      <span key={`own-${week.own}`} className="sketch-copy rounded-full bg-[#f1efe9] px-2.5 py-1 text-[#48534f]">{own.text[language]}</span>
      {preference && <span key={week.preference} className="sketch-copy rounded-full bg-[#edf3ef] px-2.5 py-1 text-[#273c38]">{preference[language]}</span>}
    </div>
    <div aria-hidden="true" className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-1.5 gap-y-2 sm:grid-cols-[28px_minmax(0,1fr)] sm:gap-x-2">
      <span />
      <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] font-semibold text-[#646c68]">{days.map((day, index) => <span key={day} className={`transition-opacity duration-500 motion-reduce:transition-none ${week.preference === "noFriday" && index === 4 ? "opacity-40" : ""}`}>{day}</span>)}</div>
      <div className="relative h-64 text-[9px] tabular-nums text-[#858d87] sm:h-72 sm:text-[10px]">
        {TIME_MARKS.map((hour) => <span key={hour} data-sketch-time={hour} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${at(hour)}%` }}>{hourLabel(hour, language)}</span>)}
      </div>
      <div ref={grid} className="relative grid h-64 grid-cols-5 gap-1.5 overflow-hidden rounded-md sm:h-72">
        {days.map((day, index) => <div key={day} className={`rounded-md transition-colors duration-500 motion-reduce:transition-none ${week.preference === "noFriday" && index === 4 ? "bg-[#efece6]" : "bg-[#f7f5f0]"}`} />)}
        {TIME_MARKS.slice(1, -1).map((hour) => <span key={hour} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[#e4e0d8]" style={{ top: `${at(hour)}%` }} />)}
        {exiting.map(({ key, label, personal, meeting }) => <div key={`exit-${preview.step}-${key}`} className={`sketch-out pointer-events-none absolute flex flex-col justify-center overflow-hidden rounded-md border-l-[3px] px-1 text-[9px] font-semibold leading-tight sm:px-1.5 sm:text-[10px] ${personal ? OWN_TONE : toneOf(label)}`} style={{ ...position(meeting), ...(personal ? OWN_FILL : {}) }}>{label}</div>)}
        {blocks.map(({ key, label, personal, meeting }) => <div key={key} data-sketch-block={key} className={`absolute flex origin-top-left flex-col justify-center overflow-hidden rounded-md border-l-[3px] px-1 text-[9px] font-semibold leading-tight sm:px-1.5 shadow-[0_1px_2px_rgba(32,39,40,.06)] ${personal ? `${OWN_TONE} items-center` : toneOf(label)}`} style={{ ...position(meeting), ...(personal ? OWN_FILL : {}) }}>
          {personal ? <span className="truncate sm:text-[10px]">{label}</span> : <>
            {/* Phone columns are too narrow for "CMSC132" on one line: department over number there. */}
            <span className="text-[9px] leading-[1.05] sm:hidden">{label.slice(0, 4)}<br />{label.slice(4)}</span>
            <span className="hidden truncate text-[10px] sm:block">{label}</span>
          </>}
          {showsTime(meeting) && <span className="mt-0.5 hidden truncate text-[9px] font-medium opacity-75 sm:block">{timeRange(meeting.start, meeting.end, language)}</span>}
        </div>)}
      </div>
    </div>
    <figcaption className="mt-3 flex min-h-14 items-start gap-2 border-t border-[#eeece6] px-1 pt-3 text-xs leading-5 text-[#48534f]">
      <span aria-hidden="true" className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#edf3ef] text-[10px] font-bold text-[#315c43]">✓</span>
      <span key={`${preview.step}-${language}`} className="sketch-copy">{explanation}</span>
    </figcaption>
  </figure>;
}
