"use client";

import { useEffect, useMemo, useState } from "react";
import { GEN_ED_CATEGORIES } from "@/lib/gened-categories";
import { hasUnknownTime, isOnlineOnly, meetingsConflict, type MeetingTime } from "@/lib/meeting-time";
import { formatSeatReadTime } from "@/lib/seat-time";

type Language = "en" | "zh";
type GenEdSection = { section_id?: string; open_seats?: string | number | null; meetings?: MeetingTime[] };
type GenEdCourse = { course_id: string; name: string; credits: string | null; genEd: string[]; sections: GenEdSection[] };

// The schedule option the student last viewed in the planner, used to check time conflicts.
// planKey ties it to the plan it was generated from, so an edited plan is not checked against old results.
export type ReferenceSchedule = { term: string; planKey: string; sectionIds: string[]; meetings: MeetingTime[] };

const copy = {
  en: {
    category: "Gen Ed category", choose: "Choose a category", loading: "Loading courses…", error: "Gen Ed courses could not be loaded. Try again shortly.",
    fitsOnly: "Only sections that fit my schedule", openOnly: "Only sections with open seats",
    against: "Checking against your schedule:", noReference: "Generate a schedule in step 02 to check time conflicts. Until then, every section counts as fitting.",
    fitting: (n: number) => n === 1 ? "1 section fits" : `${n} sections fit`, none: "No section fits",
    tba: (n: number) => `+ ${n} time TBA`, online: (n: number) => `incl. ${n} online, no set time`, staleReference: "Your plan changed since the last generated schedule. Generate it again in step 02 to check conflicts; until then conflicts are not checked.", inPlan: "In your plan",
    credits: "cr", empty: "No courses match these filters.", count: (shown: number, total: number) => `${shown} of ${total} courses`,
    fcNote: "Freshman Connection (FC) sections are not counted.", view: "View sections →",
  },
  zh: {
    category: "Gen Ed 类别", choose: "选择一个类别", loading: "正在读取课程…", error: "暂时无法读取 Gen Ed 课程，请稍后再试。",
    fitsOnly: "只看和我的课表不冲突的班", openOnly: "只看有空位的班",
    against: "对照的课表：", noReference: "先在「02 排课」生成方案，才能检查时间冲突；在那之前所有班都算不冲突。",
    fitting: (n: number) => `${n} 个班可选`, none: "没有合适的班",
    tba: (n: number) => `另有 ${n} 个时间待定`, online: (n: number) => `含 ${n} 个线上班（无固定时间）`, staleReference: "排课计划在上次生成方案后改过了。请回「02 排课」重新生成，才能检查冲突；在那之前暂不检查冲突。", inPlan: "已在排课中",
    credits: "学分", empty: "没有符合筛选条件的课程。", count: (shown: number, total: number) => `显示 ${shown} / ${total} 门课`,
    fcNote: "不计入 Freshman Connection（FC）班。", view: "查看班次 →",
  },
} as const;

const count = (value: unknown) => typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null;

export default function GenEdFinder({ term, language, reference, referenceStale, planCourseIds, onOpenCourse }: {
  term: string;
  language: Language;
  // Only passed when it matches the current plan; referenceStale says an older one was dropped.
  reference: ReferenceSchedule | null;
  referenceStale: boolean;
  planCourseIds: string[];
  onOpenCourse: (course: { course_id: string; name: string }) => void;
}) {
  const t = copy[language];
  const [code, setCode] = useState("");
  const [data, setData] = useState<{ key: string; courses: GenEdCourse[]; seatCheckedAt: string | null } | null>(null);
  const [failedKey, setFailedKey] = useState("");
  const [fitsOnly, setFitsOnly] = useState(true);
  const [openOnly, setOpenOnly] = useState(true);
  const requestKey = code ? `${term}|${code}` : "";

  useEffect(() => {
    if (!requestKey) return;
    const controller = new AbortController();
    fetch(`/api/gened?term=${encodeURIComponent(term)}&code=${encodeURIComponent(code)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { courses?: GenEdCourse[]; seatCheckedAt?: string };
        if (!response.ok) throw new Error("gened");
        setData({ key: requestKey, courses: payload.courses ?? [], seatCheckedAt: payload.seatCheckedAt ?? null });
      })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setFailedKey(requestKey); });
    return () => controller.abort();
  }, [requestKey, term, code]);

  const current = data?.key === requestKey ? data : null;
  const loading = Boolean(requestKey) && !current && failedKey !== requestKey;
  const referenceForTerm = reference?.term === term ? reference : null;

  const rows = useMemo(() => (current?.courses ?? []).map((course) => {
    const usable = course.sections.filter((section) => !/-FC[A-Z0-9]*$/i.test(section.section_id ?? ""))
      .filter((section) => !openOnly || (count(section.open_seats) ?? 0) > 0);
    // Sections without a set time cannot be checked, so they are counted apart rather than called "fitting".
    const tba = usable.filter((section) => hasUnknownTime(section.meetings ?? []));
    const fitting = usable.filter((section) => !hasUnknownTime(section.meetings ?? [])
      && (!fitsOnly || !referenceForTerm || !meetingsConflict(section.meetings ?? [], referenceForTerm.meetings)));
    return { course, fitting: fitting.length, online: fitting.filter((section) => isOnlineOnly(section.meetings ?? [])).length, tba: tba.length };
  }).sort((a, b) => Number(b.fitting > 0) - Number(a.fitting > 0) || Number(b.tba > 0) - Number(a.tba > 0) || a.course.course_id.localeCompare(b.course.course_id)), [current, openOnly, fitsOnly, referenceForTerm]);
  const shown = rows.filter((row) => row.fitting > 0 || row.tba > 0 || (!fitsOnly && !openOnly));

  return <div>
    <label className="grid gap-1.5 text-xs font-medium text-[#68716e]">{t.category}
      <select value={code} onChange={(event) => setCode(event.target.value)} className="min-w-0 w-full rounded-lg border border-[#dedbd3] bg-white px-3 py-2.5 text-sm text-[#202728]">
        <option value="">{t.choose}</option>
        {GEN_ED_CATEGORIES.map((item) => <option key={item.code} value={item.code}>{item.code} · {item[language]}</option>)}
      </select>
    </label>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#68716e]">
      <label className="inline-flex items-center gap-2"><input type="checkbox" checked={fitsOnly} onChange={(event) => setFitsOnly(event.target.checked)} />{t.fitsOnly}</label>
      <label className="inline-flex items-center gap-2"><input type="checkbox" checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} />{t.openOnly}</label>
    </div>
    <p className="mt-2 text-[11px] leading-5 text-[#858d89]">{referenceStale && !referenceForTerm ? <span className="font-medium text-[#8c352c]">{t.staleReference}</span> : referenceForTerm ? <>{t.against} <span className="font-medium text-[#48534f]">{referenceForTerm.sectionIds.join(" · ")}</span></> : t.noReference} {t.fcNote}</p>

    {loading && <p className="py-5 text-sm text-[#737b77]">{t.loading}</p>}
    {failedKey === requestKey && requestKey && !current && <p role="alert" className="py-5 text-sm text-[#8c352c]">{t.error}</p>}
    {current && <>
      <p className="mt-4 text-[11px] text-[#858d89]">{t.count(shown.length, rows.length)}{current.seatCheckedAt ? ` · ${formatSeatReadTime(current.seatCheckedAt, language)}` : ""}</p>
      {!shown.length && <p className="py-5 text-sm text-[#737b77]">{t.empty}</p>}
      <div className="mt-1 divide-y divide-[#ece9e2]">{shown.map(({ course, fitting, online, tba }) => <button key={course.course_id} type="button" onClick={() => onOpenCourse({ course_id: course.course_id, name: course.name })} className="flex w-full flex-col items-start gap-2 py-3.5 text-left hover:bg-[#f6f4ef]">
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{course.course_id}<span className="mt-1 block font-normal leading-5 text-[#606966]">{course.name}</span></span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[#89908c]">
            {course.credits && <span>{course.credits} {t.credits}</span>}
            {course.genEd.map((tag) => <span key={tag} className={`rounded px-1.5 py-0.5 font-semibold ${tag === code ? "bg-[#273c38] text-white" : "bg-[#eeece6] text-[#59635f]"}`}>{tag}</span>)}
            {planCourseIds.includes(course.course_id) && <span className="rounded bg-[#edf3ef] px-1.5 py-0.5 font-semibold text-[#315c43]">{t.inPlan}</span>}
          </span>
        </span>
        <span className="text-xs">
          <span className={`block font-semibold ${fitting ? "text-[#367047]" : "text-[#8f4538]"}`}>{fitting ? t.fitting(fitting) : t.none}</span>{online > 0 && <span className="block text-[11px] text-[#536d64]">{t.online(online)}</span>}{tba > 0 && <span className="block text-[11px] text-[#8a918e]">{t.tba(tba)}</span>}
          <span className="mt-1 block text-[#a34a39]">{t.view}</span>
        </span>
      </button>)}</div>
    </>}
  </div>;
}
