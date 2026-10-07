"use client";

import { useEffect, useState } from "react";
import type { ReferenceSchedule } from "@/app/components/gened-finder";
import { isAsyncOnline, meetingDays, type MeetingTime } from "@/lib/meeting-time";
import { scheduleWithout, sectionFit, type Opening } from "@/lib/seat-swap";

type Language = "en" | "zh";
type Section = { section_id?: string; open_seats?: string | number | null; seats?: string | number | null; instructors?: string[]; meetings?: MeetingTime[] };
type Loaded = { status: "loading" } | { status: "error" } | { status: "ok"; title: string; sections: Section[] };

const copy = {
  en: {
    title: (id: string) => `A seat opened in ${id}`, close: "Close",
    register: "Register in Testudo", registerNote: "Seats go fast, and TerpPlan cannot register you. Checking it against your schedule here is optional.",
    seatsNow: (n: number) => `${n} open ${n === 1 ? "seat" : "seats"} right now`, seatsGone: "No open seats right now; someone may have taken it already.", seatsUnknown: "Seat count not available right now.",
    loading: "Looking up the section…", error: "This section could not be loaded. You can still register in Testudo.", missing: "This section is no longer listed for that term.",
    noPlan: "There is no TerpPlan schedule on this device. Open this link on the device where you plan, or bring your plan here with \"Continue on another device\".",
    waiting: "Reading the schedule you picked in TerpPlan… (open Build a schedule if this does not finish)",
    fits: "Fits your schedule: no clash with your other classes or personal commitments.",
    conflict: "Clashes with another class or a personal commitment in your schedule.",
    unknown: "This section's time is not listed, so it cannot be checked.",
    already: "This is already the section in your TerpPlan schedule.",
    notInPlan: "This course is not in the plan on this device.",
    now: "Your section now", opened: "Opened section", none: "—", online: "Online, no set time", tba: "Time to be announced",
    swap: "Switch to this section in TerpPlan", add: "Add the course with this section", swapped: (id: string) => `Switched to ${id} in TerpPlan. Remember to register for it in Testudo.`,
    planFull: "Your plan already has 10 courses.",
    weekdays: { Mon: "Mon", Tue: "Tue", Wed: "Wed", Thu: "Thu", Fri: "Fri", Sat: "Sat", Sun: "Sun" } as Record<string, string>,
  },
  zh: {
    title: (id: string) => `${id} 有空位了`, close: "关闭",
    register: "去 Testudo 注册", registerNote: "空位很快会被抢走，TerpPlan 不能替你注册。在这里对比课表是可选的。",
    seatsNow: (n: number) => `现在有 ${n} 个空位`, seatsGone: "现在没有空位了，可能已经被别人抢走。", seatsUnknown: "暂时读不到座位数。",
    loading: "正在读取这个班次…", error: "暂时读不到这个班次，你仍然可以直接去 Testudo 注册。", missing: "这个学期已经没有这个班次了。",
    noPlan: "这台设备上没有你的 TerpPlan 课表。请在你排课用的设备上打开这个链接，或者在那台设备上用“在其他设备上继续”把课表同步过来。",
    waiting: "正在读取你在 TerpPlan 里选中的课表方案…（如果一直没有结果，请打开“排课”）",
    fits: "适合你的课表：和其他课、个人日程都不冲突。",
    conflict: "和你课表里的其他课或个人日程时间冲突。",
    unknown: "这个班次的时间还没公布，无法检查。",
    already: "这已经是你 TerpPlan 课表里的班次了。",
    notInPlan: "这门课不在这台设备的课表方案里。",
    now: "你现在的班次", opened: "空出来的班次", none: "—", online: "线上，无固定时间", tba: "时间待定",
    swap: "在 TerpPlan 里换成这个班", add: "把这门课加入方案并选这个班", swapped: (id: string) => `已在 TerpPlan 换成 ${id}。记得去 Testudo 正式注册。`,
    planFull: "你的方案里已经有 10 门课了。",
    weekdays: { Mon: "周一", Tue: "周二", Wed: "周三", Thu: "周四", Fri: "周五", Sat: "周六", Sun: "周日" } as Record<string, string>,
  },
} as const;

const count = (value: unknown) => typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null;

function meetingLines(section: Section | undefined, t: (typeof copy)[Language]) {
  if (!section) return [t.none];
  const meetings = section.meetings ?? [];
  if (!meetings.length) return [t.tba];
  return meetings.map((meeting) => {
    if (isAsyncOnline(meeting)) return t.online;
    const days = meetingDays(meeting.days).map((day) => t.weekdays[day] ?? day).join(" ");
    if (!days || !meeting.start_time || !meeting.end_time) return t.tba;
    const room = [meeting.building, meeting.room].filter(Boolean).join(" ");
    return `${days} ${meeting.start_time}–${meeting.end_time}${room ? " · " + room : ""}`;
  });
}

export function OpeningCheck({ opening, planCourseIds, planFull, reference, language, onPin, onClose }: {
  opening: Opening;
  planCourseIds: string[];
  planFull: boolean;
  // The schedule chosen in the planner for the current plan and term, or null while it is not ready.
  reference: ReferenceSchedule | null;
  language: Language;
  onPin: (courseId: string, courseTitle: string, sectionId: string) => void;
  onClose: () => void;
}) {
  const t = copy[language];
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [swapped, setSwapped] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch(`/api/course?id=${encodeURIComponent(opening.courseId)}&term=${encodeURIComponent(opening.term)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("course");
        const payload = await response.json() as { course?: { name?: string }; sections?: Section[] };
        if (active) setLoaded({ status: "ok", title: payload.course?.name ?? opening.courseId, sections: payload.sections ?? [] });
      })
      .catch(() => { if (active) setLoaded({ status: "error" }); });
    return () => { active = false; };
  }, [opening.courseId, opening.term]);

  const sections = loaded.status === "ok" ? loaded.sections : [];
  const opened = sections.find((section) => section.section_id === opening.sectionId);
  const inPlan = planCourseIds.includes(opening.courseId);
  const currentId = reference?.sectionIds.find((id) => id.startsWith(opening.courseId + "-"));
  const current = sections.find((section) => section.section_id === currentId);
  const fit = opened && reference ? sectionFit(opened.meetings ?? [], scheduleWithout(reference.meetings, current?.meetings ?? [])) : null;
  const open = count(opened?.open_seats);

  let status: { text: string; tone: "ok" | "bad" | "info" } | null = null;
  if (loaded.status === "loading") status = { text: t.loading, tone: "info" };
  else if (loaded.status === "error") status = { text: t.error, tone: "info" };
  else if (!opened) status = { text: t.missing, tone: "info" };
  else if (swapped) status = { text: t.swapped(opening.sectionId), tone: "ok" };
  else if (!planCourseIds.length) status = { text: t.noPlan, tone: "info" };
  else if (!reference) status = { text: t.waiting, tone: "info" };
  else if (currentId === opening.sectionId) status = { text: t.already, tone: "ok" };
  else if (fit === "fits") status = { text: (inPlan ? "" : t.notInPlan + " ") + t.fits, tone: "ok" };
  else if (fit === "conflict") status = { text: (inPlan ? "" : t.notInPlan + " ") + t.conflict, tone: "bad" };
  else if (fit === "unknown") status = { text: t.unknown, tone: "info" };
  const canPin = Boolean(opened && reference && !swapped && currentId !== opening.sectionId && fit !== "conflict" && (inPlan || !planFull));

  const tone = { ok: "border-[#cddbd1] bg-[#edf3ef] text-[#315c43]", bad: "border-[#e7c6bf] bg-[#fff0ec] text-[#8c352c]", info: "border-[#e0ddd5] bg-[#fbfaf8] text-[#5d6561]" };
  return <section aria-label={t.title(opening.sectionId)} className="mb-5 rounded-2xl border border-[#ead8b5] bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-serif text-2xl text-[#24312d]">{t.title(opening.sectionId)}</h2>
        {loaded.status === "ok" && <p className="mt-1 text-sm text-[#48534f]">{loaded.title}{opened ? " · " : ""}{opened && <span className={open === 0 ? "font-semibold text-[#8c352c]" : open ? "font-semibold text-[#367047]" : ""}>{open === null ? t.seatsUnknown : open > 0 ? t.seatsNow(open) : t.seatsGone}</span>}</p>}
      </div>
      <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xs font-medium text-[#646c68] hover:bg-[#f1efe9]">{t.close} ✕</button>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <a href="https://app.testudo.umd.edu/" target="_blank" rel="noreferrer" className="rounded-lg bg-[#a34a39] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8f3f30]">{t.register} ↗</a>
      <p className="text-xs leading-5 text-[#646c68]">{t.registerNote}</p>
    </div>
    {status && <p role="status" className={`mt-3 rounded-xl border px-3 py-2 text-sm ${tone[status.tone]}`}>{status.text}</p>}
    {opened && <div className={`mt-3 grid gap-3 ${current ? "sm:grid-cols-2" : ""}`}>
      {/* "Your section now" only when the schedule has one for this course. */}
      {[...(current ? [[t.now, current, currentId]] : []), [t.opened, opened, opening.sectionId]].map(([label, section, id]) => <div key={String(label)} className="rounded-xl border border-[#e3e0d8] bg-[#fbfaf8] p-3 text-xs text-[#48534f]">
        <p className="font-medium text-[#5d6561]">{String(label)}</p>
        <p className="mt-1 text-sm font-semibold text-[#24312d]">{(id as string | undefined) ?? t.none}</p>
        <ul className="mt-1 space-y-0.5">{meetingLines(section as Section | undefined, t).map((line, index) => <li key={index}>{line}</li>)}</ul>
        {(section as Section | undefined)?.instructors?.length ? <p className="mt-1 text-[#646c68]">{(section as Section).instructors!.join(", ")}</p> : null}
      </div>)}
    </div>}
    {canPin && <button type="button" onClick={() => { onPin(opening.courseId, loaded.status === "ok" ? loaded.title : opening.courseId, opening.sectionId); setSwapped(true); }} className="mt-3 rounded-lg border border-[#536d64] px-3 py-2 text-xs font-semibold text-[#273c38] hover:bg-[#edf3ef]">{inPlan ? t.swap : t.add}</button>}
    {!inPlan && planFull && opened && <p className="mt-2 text-xs text-[#8c352c]">{t.planFull}</p>}
  </section>;
}
