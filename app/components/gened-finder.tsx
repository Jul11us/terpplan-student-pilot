"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GEN_ED_CATEGORIES } from "@/lib/gened-categories";
import { hasUnknownTime, isOnlineOnly, meetingsConflict, type MeetingTime } from "@/lib/meeting-time";
import { formatSeatReadTime } from "@/lib/seat-time";

type Language = "en" | "zh";
type GenEdSection = { section_id?: string; open_seats?: string | number | null; meetings?: MeetingTime[] };
type GenEdCourse = { course_id: string; name: string; credits: string | null; genEd: string[]; hasPrerequisite?: boolean; hasRestriction?: boolean; sections: GenEdSection[] };

// Historical averages are looked up for at most this many listed courses (in requests of up to 30).
const GPA_LOOKUP_LIMIT = 90;

// The schedule option the student last viewed in the planner, used to check time conflicts.
// planKey ties it to the plan it was generated from, so an edited plan is not checked against old results.
export type ReferenceSchedule = { term: string; planKey: string; sectionIds: string[]; meetings: MeetingTime[] };

const copy = {
  en: {
    lighter: "Lighter-load options", noPrereq: "No prerequisites or enrollment restrictions", lowerLevel: "Only 100–200 level (introductory)",
    sortGpa: "Sort by historical average GPA", sortDefault: "Default order", gpaLoading: "Loading historical averages…", gpaError: "Historical averages could not be loaded.",
    gpaNote: `Historical average GPA comes from PlanetTerp. It averages every past term and instructor, so it is not a promise about this term. Looked up for the first ${GPA_LOOKUP_LIMIT} courses listed.`,
    avgGpa: "Hist. avg GPA",
    counts: (n: number) => `Counts for ${n}`, fromAudit: (codes: string) => `Selected from your degree audit: ${codes}. Courses that count for more of them are listed first.`,
    category: "Gen Ed categories · pick one or more", choose: "Pick one or more categories above.", clear: "Clear",
    matchAll: "Only courses that count for every selected category (one course, several requirements)", loading: "Loading courses…", error: "Gen Ed courses could not be loaded. Try again shortly.",
    fitsOnly: "Only sections that fit my schedule", openOnly: "Only sections with open seats",
    against: "Checking against your schedule:", noReference: "Generate a schedule in step 02 to check time conflicts. Until then, every section counts as fitting.",
    fitting: (n: number) => n === 1 ? "1 section fits" : `${n} sections fit`, none: "No section fits",
    tba: (n: number) => `+ ${n} time TBA`, online: (n: number) => `incl. ${n} online, no set time`, staleReference: "Updating your schedule for the latest change; conflicts are checked again in a moment. If this stays, check your preferences in step 02.", inPlan: "In your plan",
    credits: "cr", empty: "No courses match these filters.", count: (shown: number, total: number) => `${shown} of ${total} courses`,
    fcNote: "Freshman Connection (FC) sections are not counted.", view: "View sections →", quickAdd: "Add", inPlanShort: "In plan",
  },
  zh: {
    lighter: "想轻松一点？", noPrereq: "无先修要求和选课限制", lowerLevel: "只看 100–200 级入门课",
    sortGpa: "按历史平均 GPA 排序", sortDefault: "恢复默认排序", gpaLoading: "正在读取历史平均 GPA…", gpaError: "暂时无法读取历史平均 GPA。",
    gpaNote: `历史平均 GPA 来自 PlanetTerp，是这门课过去所有学期、所有老师的平均，不代表这学期的给分。只查询列表中前 ${GPA_LOOKUP_LIMIT} 门课。`,
    avgGpa: "历史平均 GPA",
    counts: (n: number) => `抵 ${n} 项`, fromAudit: (codes: string) => `已按学位审计选好：${codes}。能同时抵多项要求的课排在前面。`,
    category: "Gen Ed 类别 · 可多选", choose: "在上方选择一个或多个类别。", clear: "清除",
    matchAll: "只看同时满足所有所选类别的课（一门课抵多项要求）", loading: "正在读取课程…", error: "暂时无法读取 Gen Ed 课程，请稍后再试。",
    fitsOnly: "只看和我的课表不冲突的班", openOnly: "只看有空位的班",
    against: "对照的课表：", noReference: "先在「02 排课」生成方案，才能检查时间冲突；在那之前所有班都算不冲突。",
    fitting: (n: number) => `${n} 个班可选`, none: "没有合适的班",
    tba: (n: number) => `另有 ${n} 个时间待定`, online: (n: number) => `含 ${n} 个线上班（无固定时间）`, staleReference: "正在根据最新改动更新方案，稍后会重新检查冲突。如果一直显示这句，请到「02 排课」检查排课偏好。", inPlan: "已在排课中",
    credits: "学分", empty: "没有符合筛选条件的课程。", count: (shown: number, total: number) => `显示 ${shown} / ${total} 门课`,
    fcNote: "不计入 Freshman Connection（FC）班。", view: "查看班次 →", quickAdd: "加入", inPlanShort: "已加入",
  },
} as const;

const count = (value: unknown) => typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null;

export default function GenEdFinder({ term, language, reference, referenceStale, planCourseIds, onOpenCourse, onAddCourse, initialCodes = [], fromAudit = false }: {
  term: string;
  language: Language;
  // Only passed when it matches the current plan; referenceStale says an older one was dropped.
  reference: ReferenceSchedule | null;
  referenceStale: boolean;
  planCourseIds: string[];
  onOpenCourse: (course: { course_id: string; name: string }) => void;
  onAddCourse: (course: { course_id: string; name: string }) => void;
  // Categories chosen elsewhere (the degree audit page); the parent remounts this finder when they change.
  initialCodes?: string[];
  fromAudit?: boolean;
}) {
  const t = copy[language];
  const [codes, setCodes] = useState<string[]>(initialCodes);
  const [matchAll, setMatchAll] = useState(false);
  // Loaded category lists, keyed by term|code, so adding or removing a category never reloads the others.
  const [lists, setLists] = useState<Record<string, { courses: GenEdCourse[]; seatCheckedAt: string | null }>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const requested = useRef(new Set<string>());
  const [fitsOnly, setFitsOnly] = useState(true);
  const [openOnly, setOpenOnly] = useState(true);
  const [noPrereq, setNoPrereq] = useState(false);
  const [lowerLevel, setLowerLevel] = useState(false);
  const [sortByGpa, setSortByGpa] = useState(false);
  const [gpa, setGpa] = useState<Record<string, number | null>>({});
  const [gpaLoading, setGpaLoading] = useState(false);
  const [gpaError, setGpaError] = useState(false);
  const gpaRequested = useRef(new Set<string>());
  // Every course carries all of its Gen Ed tags, so "every selected category" needs only one list.
  const neededKeys = useMemo(() => (matchAll ? codes.slice(0, 1) : codes).map((code) => `${term}|${code}`), [codes, matchAll, term]);

  useEffect(() => {
    for (const key of neededKeys) {
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      const code = key.split("|")[1]!;
      fetch(`/api/gened?term=${encodeURIComponent(term)}&code=${encodeURIComponent(code)}`)
        .then(async (response) => {
          const payload = await response.json() as { courses?: GenEdCourse[]; seatCheckedAt?: string };
          if (!response.ok) throw new Error("gened");
          setLists((current) => ({ ...current, [key]: { courses: payload.courses ?? [], seatCheckedAt: payload.seatCheckedAt ?? null } }));
        })
        .catch(() => {
          requested.current.delete(key);
          setFailed((current) => ({ ...current, [key]: true }));
        });
    }
  }, [neededKeys, term]);

  const toggleCode = (code: string) => {
    setFailed({});
    setCodes((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  };
  const loadedAll = neededKeys.length > 0 && neededKeys.every((key) => lists[key]);
  const loading = neededKeys.length > 0 && !loadedAll && !neededKeys.some((key) => failed[key]);
  const current = useMemo(() => {
    if (!loadedAll) return null;
    const byId = new Map<string, GenEdCourse>();
    for (const key of neededKeys) for (const course of lists[key]!.courses) byId.set(course.course_id, course);
    const courses = [...byId.values()].filter((course) => !matchAll || codes.every((code) => course.genEd.includes(code)));
    const times = neededKeys.map((key) => lists[key]!.seatCheckedAt).filter((value): value is string => Boolean(value)).sort();
    return { courses, seatCheckedAt: times[0] ?? null };
  }, [loadedAll, neededKeys, lists, matchAll, codes]);
  const referenceForTerm = reference?.term === term ? reference : null;

  const baseRows = useMemo(() => (current?.courses ?? []).filter((course) =>
    (!noPrereq || (!course.hasPrerequisite && !course.hasRestriction))
    // Course numbers start at the 5th character (AAAS100 -> 1); 100/200 are introductory levels.
    && (!lowerLevel || /^[12]$/.test(course.course_id.charAt(4)))).map((course) => {
    const usable = course.sections.filter((section) => !/-FC[A-Z0-9]*$/i.test(section.section_id ?? ""))
      .filter((section) => !openOnly || (count(section.open_seats) ?? 0) > 0);
    // Sections without a set time cannot be checked, so they are counted apart rather than called "fitting".
    const tba = usable.filter((section) => hasUnknownTime(section.meetings ?? []));
    const fitting = usable.filter((section) => !hasUnknownTime(section.meetings ?? [])
      && (!fitsOnly || !referenceForTerm || !meetingsConflict(section.meetings ?? [], referenceForTerm.meetings)));
    // How many of the selected categories this one course would satisfy at once.
    const matched = codes.filter((code) => course.genEd.includes(code)).length;
    return { course, matched, fitting: fitting.length, online: fitting.filter((section) => isOnlineOnly(section.meetings ?? [])).length, tba: tba.length };
  }).sort((a, b) => Number(b.fitting > 0) - Number(a.fitting > 0) || b.matched - a.matched || Number(b.tba > 0) - Number(a.tba > 0) || a.course.course_id.localeCompare(b.course.course_id)), [current, openOnly, fitsOnly, referenceForTerm, codes, noPrereq, lowerLevel]);
  const baseShown = useMemo(() => baseRows.filter((row) => row.fitting > 0 || row.tba > 0 || (!fitsOnly && !openOnly)), [baseRows, fitsOnly, openOnly]);
  // Averages are fetched for the default-order list, so re-sorting by them never triggers more lookups.
  const gpaIds = useMemo(() => baseShown.slice(0, GPA_LOOKUP_LIMIT).map((row) => row.course.course_id), [baseShown]);
  useEffect(() => {
    if (!sortByGpa) return;
    const missing = gpaIds.filter((id) => !gpaRequested.current.has(id));
    if (!missing.length) return;
    missing.forEach((id) => gpaRequested.current.add(id));
    const batches = Array.from({ length: Math.ceil(missing.length / 30) }, (_, index) => missing.slice(index * 30, index * 30 + 30));
    setGpaLoading(true); setGpaError(false);
    Promise.all(batches.map(async (courseIds) => {
      const response = await fetch("/api/audit/grades", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseIds }) });
      if (!response.ok) throw new Error("grades");
      return (await response.json() as { averages?: Record<string, number | null> }).averages ?? {};
    })).then((results) => setGpa((current) => Object.assign({}, current, ...results)))
      .catch(() => { missing.forEach((id) => gpaRequested.current.delete(id)); setGpaError(true); })
      .finally(() => setGpaLoading(false));
  }, [sortByGpa, gpaIds]);
  const shown = useMemo(() => sortByGpa
    ? [...baseShown].sort((a, b) => Number(b.fitting > 0) - Number(a.fitting > 0) || (gpa[b.course.course_id] ?? -1) - (gpa[a.course.course_id] ?? -1) || b.matched - a.matched || a.course.course_id.localeCompare(b.course.course_id))
    : baseShown, [baseShown, sortByGpa, gpa]);

  return <div>
    {fromAudit && initialCodes.length > 0 && <p className="mb-3 rounded-lg bg-[#edf3ef] px-3 py-2 text-xs leading-5 text-[#315c43]">{t.fromAudit(initialCodes.join(", "))}</p>}
    <div className="flex items-center justify-between gap-3"><p className="text-xs font-medium text-[#68716e]">{t.category}</p>{codes.length > 0 && <button type="button" onClick={() => setCodes([])} className="text-[11px] font-medium text-[#8b5148] hover:underline">{t.clear}</button>}</div>
    <div className="mt-2 flex flex-wrap gap-1.5">{GEN_ED_CATEGORIES.map((item) => {
      const on = codes.includes(item.code);
      return <button key={item.code} type="button" aria-pressed={on} title={item[language]} onClick={() => toggleCode(item.code)} className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${on ? "border-[#273c38] bg-[#273c38] text-white" : "border-[#dedbd3] bg-white text-[#48534f] hover:border-[#9aa8a1]"}`}><span className="font-semibold">{item.code}</span><span className={`ml-1 ${on ? "text-white/80" : "text-[#89908c]"}`}>{item[language]}</span></button>;
    })}</div>
    {codes.length > 1 && <label className="mt-3 flex items-start gap-2 text-xs text-[#48534f]"><input type="checkbox" className="mt-0.5" checked={matchAll} onChange={(event) => setMatchAll(event.target.checked)} />{t.matchAll}</label>}
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#68716e]">
      <label className="inline-flex items-center gap-2"><input type="checkbox" checked={fitsOnly} onChange={(event) => setFitsOnly(event.target.checked)} />{t.fitsOnly}</label>
      <label className="inline-flex items-center gap-2"><input type="checkbox" checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} />{t.openOnly}</label>
    </div>
    <div className="mt-3 rounded-lg border border-[#e3e0d8] bg-[#f6f4ef] p-3 text-xs text-[#68716e]">
      <p className="font-semibold text-[#48534f]">{t.lighter}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={noPrereq} onChange={(event) => setNoPrereq(event.target.checked)} />{t.noPrereq}</label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={lowerLevel} onChange={(event) => setLowerLevel(event.target.checked)} />{t.lowerLevel}</label>
      </div>
      <button type="button" aria-pressed={sortByGpa} onClick={() => setSortByGpa((value) => !value)} className={`mt-2 rounded-lg border px-2.5 py-1.5 font-medium ${sortByGpa ? "border-[#273c38] bg-[#273c38] text-white" : "border-[#d9d6ce] bg-white text-[#273c38]"}`}>{sortByGpa ? t.sortDefault : t.sortGpa}</button>
      {sortByGpa && <p className="mt-2 text-[11px] leading-5 text-[#858d89]">{gpaLoading ? t.gpaLoading : gpaError ? t.gpaError : t.gpaNote}</p>}
    </div>
    <p className="mt-2 text-[11px] leading-5 text-[#858d89]">{referenceStale && !referenceForTerm ? <span className="font-medium text-[#745424]">{t.staleReference}</span> : referenceForTerm ? <>{t.against} <span className="font-medium text-[#48534f]">{referenceForTerm.sectionIds.join(" · ")}</span></> : t.noReference} {t.fcNote}</p>

    {loading && <p className="py-5 text-sm text-[#737b77]">{t.loading}</p>}
    {!codes.length && <p className="py-5 text-sm text-[#737b77]">{t.choose}</p>}
    {neededKeys.some((key) => failed[key]) && !current && <p role="alert" className="py-5 text-sm text-[#8c352c]">{t.error}</p>}
    {current && <>
      <p className="mt-4 text-[11px] text-[#858d89]">{t.count(shown.length, current.courses.length)}{current.seatCheckedAt ? ` · ${formatSeatReadTime(current.seatCheckedAt, language)}` : ""}</p>
      {!shown.length && <p className="py-5 text-sm text-[#737b77]">{t.empty}</p>}
      <div className="mt-1 divide-y divide-[#ece9e2]">{shown.map(({ course, matched, fitting, online, tba }) => { const inPlan = planCourseIds.includes(course.course_id); const courseId = course.course_id; const onAdd = () => onAddCourse({ course_id: course.course_id, name: course.name }); return <div key={course.course_id} className="flex items-start gap-2 pr-1"><button type="button" onClick={() => onOpenCourse({ course_id: course.course_id, name: course.name })} className="flex min-w-0 flex-1 flex-col items-start gap-2 py-3.5 text-left hover:bg-[#f6f4ef]">
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{course.course_id}<span className="mt-1 block font-normal leading-5 text-[#606966]">{course.name}</span></span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[#89908c]">
            {course.credits && <span>{course.credits} {t.credits}</span>}
            {typeof gpa[course.course_id] === "number" && <span className="font-medium text-[#536d64]">{t.avgGpa} {gpa[course.course_id]!.toFixed(2)}</span>}
            {codes.length > 1 && matched > 1 && <span className="rounded bg-[#a34a39] px-1.5 py-0.5 font-semibold text-white">{t.counts(matched)}</span>}
            {course.genEd.map((tag) => <span key={tag} className={`rounded px-1.5 py-0.5 font-semibold ${codes.includes(tag) ? "bg-[#273c38] text-white" : "bg-[#eeece6] text-[#59635f]"}`}>{tag}</span>)}
            
          </span>
        </span>
        <span className="text-xs">
          <span className={`block font-semibold ${fitting ? "text-[#367047]" : "text-[#8f4538]"}`}>{fitting ? t.fitting(fitting) : t.none}</span>{online > 0 && <span className="block text-[11px] text-[#536d64]">{t.online(online)}</span>}{tba > 0 && <span className="block text-[11px] text-[#8a918e]">{t.tba(tba)}</span>}
          <span className="mt-1 block text-[#a34a39]">{t.view}</span>
        </span>
      </button><span className="pt-3.5"><button type="button" onClick={() => onAdd()} disabled={inPlan} aria-label={inPlan ? t.inPlanShort : `${t.quickAdd} ${courseId}`} title={inPlan ? t.inPlanShort : t.quickAdd} className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${inPlan ? "border-[#cddbd1] bg-[#edf3ef] text-[#315c43]" : "border-[#536d64] text-[#273c38] hover:bg-[#edf3ef]"}`}>{inPlan ? `✓ ${t.inPlanShort}` : `+ ${t.quickAdd}`}</button></span></div>; })}</div>
    </>}
  </div>;
}
