"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_BUSY_BLOCKS, WEEKDAYS, validBusyBlocks, type BusyBlock } from "@/lib/personal-schedule";
import type { PlanDiagnosis, PlanRepair, ScheduleOption, ScheduledSection } from "@/lib/planner";
import { roomLabel } from "@/lib/room";
import { formatSeatReadTime } from "@/lib/seat-time";

type Language = "en" | "zh";
const weekdays = { en: WEEKDAYS, zh: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] };
const field = "min-w-0 rounded-lg border border-[#dedbd3] bg-white px-3 py-2 text-sm text-[#202728]";
const button = "rounded-lg border border-[#536d64] px-3 py-2 text-xs font-semibold text-[#273c38] hover:bg-[#edf3ef] disabled:opacity-50";
const dayLabel = (day: string, language: Language) => weekdays[language][WEEKDAYS.indexOf(day as typeof WEEKDAYS[number])] ?? day;

export function PersonalSchedule({ blocks, buffer, onBlocks, onBuffer, language }: { blocks: BusyBlock[]; buffer: number; onBlocks: (blocks: BusyBlock[]) => void; onBuffer: (buffer: number) => void; language: Language }) {
  const zh = language === "zh";
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<string[]>(["Mon"]);
  const [start, setStart] = useState("12:00");
  const [end, setEnd] = useState("13:00");
  const [invalid, setInvalid] = useState(false);
  const reset = () => { setEditing(null); setLabel(""); setInvalid(false); };
  return <section className="mt-5 border-t border-[#e8e5dd] pt-5">
    <h4 className="font-semibold">{zh ? "个人日程与课间缓冲" : "Personal schedule & class buffer"}</h4>
    <p className="mt-1 text-xs leading-5 text-[#646c68]">{zh ? "固定日程每周重复，排课和换班会避开这些时段。日程名称不会随排课请求发送；登录后会和方案一起同步到你的账号。" : "Weekly commitments reserve these times when generating or changing sections. Event names are not sent with scheduling requests; when you are signed in, they sync to your account with your plan."}</p>
    <label className="mt-3 flex flex-wrap items-center gap-3 text-xs font-medium text-[#5d6561]">{zh ? "两次上课之间至少留出" : "Minimum time between classes"}
      <select aria-label={zh ? "课间缓冲" : "Class buffer"} value={buffer} onChange={(event) => onBuffer(Number(event.target.value))} className={field}>
        {[...new Set([0, 5, 10, 15, 20, 30, 45, 60, 90, 120, buffer])].sort((a, b) => a - b).map((value) => <option key={value} value={value}>{value} {zh ? "分钟" : "min"}</option>)}
      </select>
    </label>
    <p className="mt-1 text-[11px] leading-5 text-[#646c68]">{zh ? "缓冲用于上课之间，不扩展个人日程；这是你设定的预留时间，不是步行时间估算。" : "The buffer applies between classes, without extending personal commitments. It reserves your chosen time; it is not a walking-time estimate."}</p>
    {blocks.length > 0 && <ul className="mt-4 space-y-2">{blocks.map((block) => <li key={block.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f3f1eb] px-3 py-2 text-xs">
      <div><strong>{block.label || (zh ? "固定日程" : "Commitment")}</strong><span className="ml-2 text-[#5d6561]">{block.days.map((day) => dayLabel(day, language)).join(" / ")} · {block.start}–{block.end}</span></div>
      <div className="flex gap-2"><button type="button" className={button} onClick={() => { setEditing(block.id); setLabel(block.label ?? ""); setDays(block.days); setStart(block.start); setEnd(block.end); setInvalid(false); }}>{zh ? "编辑" : "Edit"}</button><button type="button" className={button} onClick={() => { onBlocks(blocks.filter((item) => item.id !== block.id)); if (editing === block.id) reset(); }}>{zh ? "删除" : "Delete"}</button></div>
    </li>)}</ul>}
    <form className="mt-4 space-y-3" onSubmit={(event) => {
      event.preventDefault();
      const block: BusyBlock = { id: editing ?? crypto.randomUUID(), label: label.trim(), days, start, end };
      if (!validBusyBlocks([block])) { setInvalid(true); return; }
      const next = editing ? blocks.map((item) => item.id === editing ? block : item) : [...blocks, block];
      if (!validBusyBlocks(next)) { setInvalid(true); return; }
      onBlocks(next); reset();
    }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-xs text-[#5d6561]">{zh ? "日程名称（可选）" : "Event name (optional)"}<input aria-label={zh ? "日程名称" : "Event name"} value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} placeholder={zh ? "例如：打工、午饭" : "e.g. work, lunch"} className={field} /></label>
        <label className="grid gap-1 text-xs text-[#5d6561]">{zh ? "日程开始" : "Commitment starts"}<input type="time" value={start} onChange={(event) => setStart(event.target.value)} className={field} /></label>
        <label className="grid gap-1 text-xs text-[#5d6561]">{zh ? "日程结束" : "Commitment ends"}<input type="time" value={end} onChange={(event) => setEnd(event.target.value)} className={field} /></label>
      </div>
      <fieldset><legend className="mb-2 text-xs text-[#5d6561]">{zh ? "重复日期" : "Repeats on"}</legend><div className="flex flex-wrap gap-2">{WEEKDAYS.map((day) => <label key={day} className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={days.includes(day)} onChange={(event) => setDays((current) => event.target.checked ? [...current, day] : current.filter((item) => item !== day))} />{dayLabel(day, language)}</label>)}</div></fieldset>
      {invalid && <p role="alert" className="text-xs text-[#8c352c]">{zh ? "请选择至少一天，并填写开始早于结束的同一天时段；最多保存 24 项日程。" : "Choose at least one day and a same-day interval with start before end. Save up to 24 commitments."}</p>}
      <div className="flex gap-2"><button type="submit" className={button} disabled={!editing && blocks.length >= MAX_BUSY_BLOCKS}>{editing ? (zh ? "保存日程" : "Save commitment") : (zh ? "添加固定日程" : "Add commitment")}</button>{editing && <button type="button" className={button} onClick={reset}>{zh ? "取消" : "Cancel"}</button>}</div>
    </form>
  </section>;
}

function diagnosisText(item: PlanDiagnosis, blocks: BusyBlock[], language: Language) {
  const zh = language === "zh", courses = item.courseIds.join(" / ");
  const event = blocks.find((block) => block.id === item.blockId);
  if (item.code === "bufferConflict" && item.courseIds.length === 1) return zh ? `${courses} 的讲课、讨论课或实验课之间无法留出要求的课间缓冲。` : `${courses} has meetings that leave less than your required class buffer.`;
  switch (item.code) {
    case "excludedDay": return zh ? `${courses} 的班次被“避开${dayLabel(item.day!, language)}”限制排除。` : `${courses}: sections are excluded by avoiding ${item.day}.`;
    case "earliestStart": return zh ? `${courses} 有班次早于最早上课时间 ${item.time}。` : `${courses}: sections start before your ${item.time} cutoff.`;
    case "timeWindow": return zh ? `${courses} 有班次不在你要求的时间段内，或时间待定。` : `${courses}: sections fall outside the required window or have unconfirmed times.`;
    case "busyBlock": return zh ? `${courses} 与“${event?.label || "固定日程"}”${event ? `（${event.start}–${event.end}）` : ""}重叠。` : `${courses} overlaps ${event?.label || "a commitment"}${event ? ` (${event.start}–${event.end})` : ""}.`;
    case "fullSections": return zh ? `${courses} 的已满班次被“只使用有空位”排除。` : `${courses}: full sections are excluded by your open-seat filter.`;
    case "fcSections": return zh ? `${courses} 有 FC 班次，需要参加 Freshman Connection 才能选择。` : `${courses} has FC sections reserved for Freshman Connection students.`;
    case "campusAreas": return zh ? `${courses} 的班次都在你选择的校园区域之外。` : `${courses}: its sections meet outside the parts of campus you chose.`;
    case "sectionFilters": return zh ? `${courses} 没有符合指定班次、排除班次或教师筛选的班次。` : `${courses}: no section matches your required section, exclusions or instructor choices.`;
    case "courseConflict": return zh ? `${courses} 的可选班次全部互相冲突，例如 ${item.sectionIds?.join(" / ")}。` : `Every eligible combination of ${courses} overlaps, including ${item.sectionIds?.join(" / ")}.`;
    case "bufferConflict": return zh ? `${courses} 的所有组合都会重叠或无法留出要求的课间缓冲，例如 ${item.sectionIds?.join(" / ")}。` : `Every combination of ${courses} overlaps or leaves less than your required class buffer, including ${item.sectionIds?.join(" / ")}.`;
    case "combinationConflict": return zh ? `这些课程和限制组合起来，尚未找到完整课表：${courses}。` : `No complete schedule was found for this combination of courses and constraints: ${courses}.`;
  }
}

function repairText(repair: PlanRepair, blocks: BusyBlock[], language: Language) {
  const zh = language === "zh";
  switch (repair.kind) {
    case "allowDay": return zh ? `允许${dayLabel(repair.day!, language)}上课` : `Allow classes on ${repair.day}`;
    case "clearEarliest": return zh ? "取消最早上课时间限制" : "Remove earliest-start cutoff";
    case "relaxWindow": return zh ? "将时间段改为偏好" : "Make the time window a preference";
    case "clearBuffer": return zh ? "将课间缓冲设为 0 分钟" : "Set the class buffer to 0 min";
    case "removeBlock": return zh ? `移除日程：${blocks.find((block) => block.id === repair.blockId)?.label || "固定日程"}` : `Remove commitment: ${blocks.find((block) => block.id === repair.blockId)?.label || "Commitment"}`;
    case "allowFull": return zh ? "允许排入已满班次（需要候补或等余位）" : "Include full sections (waitlist or watch for seats)";
    case "clearCampusAreas": return zh ? "取消校园区域限制" : "Allow classes anywhere on campus";
    case "unpin": return zh ? `取消 ${repair.courseId} 的指定班次` : `Unpin ${repair.courseId}`;
    case "resetFilters": return zh ? `重置 ${repair.courseId} 的班次和教师筛选` : `Reset section & instructor filters for ${repair.courseId}`;
    case "removeCourse": return zh ? `从本次计划移除 ${repair.courseId}` : `Remove ${repair.courseId} from this plan`;
  }
}

export function ScheduleRecovery({ diagnostics, repairs, blocks, language, disabled, onRepair, onBack }: { diagnostics: PlanDiagnosis[]; repairs: PlanRepair[]; blocks: BusyBlock[]; language: Language; disabled: boolean; onRepair: (repair: PlanRepair) => void; onBack: () => void }) {
  const zh = language === "zh";
  if (!diagnostics.length) return null;
  return <section aria-label={zh ? "排课问题与解法" : "Schedule issues & fixes"} className="mt-5 rounded-xl border border-[#ead8b5] bg-[#fff8e8] p-4 sm:p-5">
    <h3 className="font-semibold text-[#745424]">{zh ? "哪些限制挡住了排课？" : "What is blocking this schedule?"}</h3>
    <ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-5 text-[#745424]">{diagnostics.map((item, index) => <li key={index}>{diagnosisText(item, blocks, language)}{item.sample && <p className="mt-1 text-[11px]">{item.sample.days.map((day) => dayLabel(day, language)).join(" / ")} · {item.sectionIds?.[0]} {item.sample.leftStart}–{item.sample.leftEnd} · {item.sectionIds?.[1]} {item.sample.rightStart}–{item.sample.rightEnd}</p>}</li>)}</ul>
    <p className="mt-4 text-xs leading-5 text-[#5d6561]">{repairs.length ? (zh ? "下面每个调整都已找到覆盖调整后全部课程的方案。点击后才会修改你的计划；上课时间待定的班次仍需确认。" : "Each change below has a schedule covering every remaining course. Your plan changes only when you apply it; TBA times still need confirmation.") : (zh ? "尚未验证出只改一项就能解决的方案。可尝试调整多个限制，或返回找课修改班次。" : "A fix involving just one change has not been confirmed. Adjust multiple constraints or review sections in course search.")}</p>
    <div className="mt-3 space-y-2">{repairs.map((repair, index) => <div key={index} className="rounded-lg border border-[#e7dcc3] bg-white p-3"><button type="button" disabled={disabled} className={button} onClick={() => onRepair(repair)}>{repairText(repair, blocks, language)}</button><p className="mt-2 break-words text-[11px] text-[#646c68]">{zh ? "可排入：" : "Possible sections: "}{repair.sectionIds.join(" · ")}</p></div>)}</div>
    <button type="button" onClick={onBack} className="mt-3 text-xs font-medium text-[#745424] underline underline-offset-2">{zh ? "返回找课修改班次" : "Review sections in course search"}</button>
  </section>;
}

function meetingSummary(section: ScheduledSection, language: Language) {
  const lines = (section.meetings ?? []).map((meeting) => `${meeting.days || "TBA"} ${meeting.start_time || "TBA"}–${meeting.end_time || "TBA"} · ${roomLabel(meeting.building, meeting.room, language)}`);
  return lines.length ? lines : [language === "zh" ? "时间待定" : "Time TBA"];
}

export function SectionSwap({ section, language, request, disabled, forceOpen, onApply }: { section: ScheduledSection; language: Language; request: Record<string, unknown>; disabled: boolean; forceOpen: boolean; onApply: (option: ScheduleOption) => void }) {
  const zh = language === "zh";
  const [open, setOpen] = useState(forceOpen);
  const [result, setResult] = useState<{ current: ScheduleOption; options: ScheduleOption[]; total: number } | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const load = async () => {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setOpen(true); setLoading(true); setError(false);
    try {
      const response = await fetch("/api/schedules/generate", { method: "POST", headers: { "content-type": "application/json" }, signal: abort.signal,
        body: JSON.stringify({ ...request, mode: "alternatives", replaceCourseId: section.course_id }) });
      if (!response.ok) throw new Error("Changed schedule");
      const payload = await response.json() as { current: ScheduleOption; options: ScheduleOption[]; total: number };
      if (!abort.signal.aborted) setResult(payload);
    } catch { if (!abort.signal.aborted) setError(true); }
    finally { if (!abort.signal.aborted) setLoading(false); }
  };
  return <div className="mt-3 border-t border-[#eeeae3] pt-3">
    <button id={`section-swap-${section.section_id}`} type="button" className={button} disabled={disabled || loading} onClick={() => { if (open && result) setOpen(false); else void load(); }}>{loading ? (zh ? "正在检查备选班次…" : "Checking alternatives…") : (open && result ? (zh ? "收起备选班次" : "Hide alternatives") : (zh ? "直接换班" : "Change section"))}</button>
    {open && <div className="mt-3 space-y-3">
      <p className="text-xs leading-5 text-[#646c68]">{zh ? "只替换这门课，其他课程的班号保持原样。备选班次符合当前筛选、个人日程和课间缓冲；替换后会保存为指定班次。" : "Replace this course while keeping every other section. Alternatives respect your filters, commitments and buffer. The replacement becomes your required section."}</p>
      {error && <p role="alert" className="text-xs text-[#8c352c]">{zh ? "无法刷新备选班次，或课表数据已变化。请重新生成课表后再试。" : "Alternatives could not be refreshed or the schedule changed. Regenerate your schedule and try again."}</p>}
      {result?.options.length === 0 && <p role="status" className="text-xs text-[#745424]">{zh ? "没有找到兼容的其他班次。可返回找课调整教师或排除班次，或放宽时间限制。" : "No other compatible section was found. Review instructor/section filters or relax time constraints."}</p>}
      {result?.options.map((option) => {
        const candidate = option.selectedSections.find((item) => item.course_id === section.course_id)!;
        const original = result.current.selectedSections.find((item) => item.course_id === section.course_id)!;
        const seats = candidate.open_seats;
        const known = seats !== null && seats !== undefined && seats !== "";
        return <article key={candidate.section_id} className="rounded-lg border border-[#dce4de] bg-[#f7faf7] p-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><strong className="text-sm">{candidate.section_id}</strong><span className="text-xs text-[#59635f]">{known ? (Number(seats) === 0 ? (zh ? "已满" : "Full") : `${seats} ${zh ? "个空位" : "seats open"}`) : (zh ? "余位未知" : "Seats unknown")}</span></div>
          <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-xs leading-5 text-[#646c68]"><span>{zh ? "原班次：" : "Before:"}</span><div>{meetingSummary(original, language).map((line, index) => <p key={index}>{line}</p>)}</div></div>
          <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-xs leading-5 text-[#315c43]"><span>{zh ? "换班后：" : "After:"}</span><div>{meetingSummary(candidate, language).map((line, index) => <p key={index}>{line}</p>)}</div></div>
          <p className="mt-2 text-xs text-[#59635f]">{candidate.instructorRatings.map((rating) => `${rating.name}${rating.averageRating === null ? "" : ` · ${rating.averageRating.toFixed(2)}/5`}`).join(" · ") || (zh ? "教师待定" : "Instructor TBA")}</p>
          <p className="mt-1 text-[11px] text-[#646c68]">{zh ? "整周课间空档：" : "Weekly gaps: "}{result.current.gapMinutes} → {option.gapMinutes} {zh ? "分钟" : "min"} · {zh ? "到校天数：" : "Campus days: "}{result.current.campusDays.length} → {option.campusDays.length}{result.current.tightWalkCount || option.tightWalkCount ? <>{zh ? " · 课间来不及走：" : " · Hard-to-reach classes: "}{result.current.tightWalkCount ?? 0} → {option.tightWalkCount ?? 0}</> : null}</p>
          {formatSeatReadTime(candidate.seatCheckedAt, language) && <p className="mt-1 text-[11px] text-[#646c68]">{zh ? "余位读取于：" : "Seats read: "}{formatSeatReadTime(candidate.seatCheckedAt, language)}</p>}
          {option.unknownSectionIds.length > 0 && <p className="mt-2 text-xs text-[#745424]">{zh ? "部分上课时间待定，请先核实。" : "Some meeting times are unconfirmed; check them before registering."}</p>}
          <button type="button" disabled={disabled} className={`${button} mt-3`} onClick={() => onApply(option)}>{zh ? `换成 ${candidate.section_id}` : `Use ${candidate.section_id}`}</button>
        </article>;
      })}
      {result && result.total > result.options.length && <p className="text-xs text-[#646c68]">{zh ? `显示 ${result.options.length} / ${result.total} 个兼容班次。` : `Showing ${result.options.length} of ${result.total} compatible sections.`}</p>}
    </div>}
  </div>;
}
