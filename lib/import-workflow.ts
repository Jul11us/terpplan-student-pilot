import type { PastedSection } from "@/lib/testudo-import";
import type { UmdMeeting } from "@/lib/umd";

export type ImportedCourse = { courseId: string; courseTitle: string; pinnedSectionId: string };
export type ImportSection = PastedSection & {
  title: string | null;
  // A lookup failure is retryable; an authoritative 404 or missing section is not a network failure.
  problem: "pending" | "lookup" | "course" | "section" | null;
  meetings: UmdMeeting[];
};
export type ImportLookup = { found: ImportSection[]; busy: boolean };
type CourseReply = { course?: { name?: unknown }; sections?: Array<{ section_id?: string; number?: string; meetings?: UmdMeeting[] }> };

export type ImportPreview = { item: ImportSection; action: "add" | "update" | "skip"; reason?: "capacity" | "duplicate" };

// Existing courses can be updated even when the plan is full. Only distinct new courses use a slot.
export function previewScheduleImport(found: ImportSection[], existingCourseIds: string[], replace: boolean, limit = 10): ImportPreview[] {
  const existing = new Set(replace ? [] : existingCourseIds);
  const seen = new Set<string>();
  let room = Math.max(0, limit - existing.size);
  return found.map((item) => {
    if (item.problem) return { item, action: "skip" };
    if (seen.has(item.courseId)) return { item, action: "skip", reason: "duplicate" };
    seen.add(item.courseId);
    if (existing.has(item.courseId)) return { item, action: "update" };
    if (!room) return { item, action: "skip", reason: "capacity" };
    room -= 1;
    return { item, action: "add" };
  });
}

export function coursesFromImport(preview: ImportPreview[]): ImportedCourse[] {
  return preview.filter((row) => row.action !== "skip").map(({ item }) => ({ courseId: item.courseId, courseTitle: item.title ?? item.courseId, pinnedSectionId: `${item.courseId}-${item.section}` }));
}

// One lookup at a time avoids overwhelming Testudo. Each update is a fresh array, and cancellation
// gates every update even if a fetch implementation ignores AbortSignal or finishes parsing late.
export function startImportLookup(
  sections: PastedSection[],
  term: string,
  onUpdate: (state: ImportLookup) => void,
  { previous = [], fetcher = fetch, retryDelayMs = 1500 }: { previous?: ImportSection[]; fetcher?: typeof fetch; retryDelayMs?: number } = {},
) {
  const controller = new AbortController();
  let cancelled = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let releaseRetry: (() => void) | undefined;
  const found: ImportSection[] = sections.map((section) => {
    const old = previous.find((item) => item.courseId === section.courseId && item.section === section.section);
    return old && old.problem !== "lookup" && old.problem !== "pending" ? old : { ...section, title: null, problem: "pending", meetings: [] };
  });
  const emit = (busy: boolean) => { if (!cancelled) onUpdate({ found: [...found], busy }); };
  const delay = () => new Promise<void>((resolve) => {
    releaseRetry = resolve;
    retryTimer = setTimeout(() => { retryTimer = undefined; releaseRetry = undefined; resolve(); }, retryDelayMs);
  });
  emit(true);
  void (async () => {
    for (let index = 0; index < found.length; index += 1) {
      if (cancelled) return;
      if (found[index].problem !== "pending") continue;
      const item = found[index];
      try {
        const url = `/api/course?id=${encodeURIComponent(item.courseId)}&term=${encodeURIComponent(term)}`;
        let response = await fetcher(url, { signal: controller.signal });
        if (cancelled) return;
        if (response.status >= 500) {
          await delay();
          if (cancelled) return;
          response = await fetcher(url, { signal: controller.signal });
          if (cancelled) return;
        }
        if (response.status === 404) found[index] = { ...item, problem: "course" };
        else {
          if (!response.ok) throw new Error("lookup");
          const reply = await response.json() as CourseReply;
          if (cancelled) return;
          if (!reply || !Array.isArray(reply.sections)) throw new Error("lookup");
          const id = `${item.courseId}-${item.section}`;
          const listed = reply.sections.find((section) => section && (section.section_id ?? `${item.courseId}-${section.number ?? ""}`).toUpperCase() === id);
          found[index] = { ...item, title: typeof reply.course?.name === "string" ? reply.course.name : item.courseId, problem: listed ? null : "section", meetings: listed?.meetings ?? [] };
        }
      } catch {
        if (cancelled) return;
        found[index] = { ...item, problem: "lookup" };
      }
      emit(true);
    }
    emit(false);
  })();
  return () => {
    cancelled = true;
    controller.abort();
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    releaseRetry?.();
    retryTimer = undefined;
    releaseRetry = undefined;
  };
}
