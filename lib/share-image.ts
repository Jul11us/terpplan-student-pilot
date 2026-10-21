// What a schedule picture shows, worked out apart from drawing it (app/components/share-image.tsx draws it on a
// canvas in the browser): the days and hours to cover, one block per class meeting, and what has no fixed time.
// Personal commitments are left out unless the student turns them on, and then only as "busy", never their names.

import { isAsyncOnline, meetingDays, meetingMinutes, type MeetingTime } from "@/lib/meeting-time";

export type ImageFormat = "post" | "story";
// Instagram's portrait post (4:5) and Story (9:16) sizes; the post size also suits most other places.
export const IMAGE_SIZES: Record<ImageFormat, { width: number; height: number }> = { post: { width: 1080, height: 1350 }, story: { width: 1080, height: 1920 } };

export type ImageBlock = { day: string; start: number; end: number; courseId: string | null; color: number };
export type ImageModel = { days: string[]; from: number; to: number; blocks: ImageBlock[]; courses: string[]; unscheduled: string[] };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const ALL_DAYS = [...WEEKDAYS, "Sat", "Sun"];

type SectionLike = { course_id: string; section_id: string; meetings?: MeetingTime[] | null };
type BusyLike = { days: string[]; start: string; end: string };

export function imageModel(sections: SectionLike[], busy: BusyLike[] = []): ImageModel {
  const courses = [...new Set(sections.map((section) => section.course_id))];
  const blocks: ImageBlock[] = [];
  const unscheduled = new Set<string>();
  for (const section of sections) {
    const timed = (section.meetings ?? []).filter((meeting) => {
      const ok = !isAsyncOnline(meeting) && meetingDays(meeting.days).length > 0 && meetingMinutes(meeting.start_time) !== null && (meetingMinutes(meeting.end_time) ?? 0) > (meetingMinutes(meeting.start_time) ?? 0);
      if (!ok) unscheduled.add(section.course_id);
      return ok;
    });
    if (!section.meetings?.length) unscheduled.add(section.course_id);
    for (const meeting of timed) for (const day of meetingDays(meeting.days)) {
      blocks.push({ day, start: meetingMinutes(meeting.start_time)!, end: meetingMinutes(meeting.end_time)!, courseId: section.course_id, color: courses.indexOf(section.course_id) });
    }
  }
  for (const block of busy) {
    const start = meetingMinutes(block.start), end = meetingMinutes(block.end);
    if (start === null || end === null || end <= start) continue;
    for (const day of block.days) if (ALL_DAYS.includes(day)) blocks.push({ day, start, end, courseId: null, color: -1 });
  }
  // Monday to Friday always; a weekend day only when something is on it. Whole hours around the earliest start and
  // latest end, at least six hours so a short day does not stretch one class over the whole picture.
  const days = [...WEEKDAYS, ...["Sat", "Sun"].filter((day) => blocks.some((block) => block.day === day))];
  // An evening-only week grows earlier instead of running past 10pm.
  let from = blocks.length ? Math.min(...blocks.map((block) => Math.floor(block.start / 60) * 60)) : 9 * 60;
  let to = blocks.length ? Math.max(...blocks.map((block) => Math.ceil(block.end / 60) * 60)) : 15 * 60;
  if (to - from < 6 * 60) {
    to = Math.max(to, Math.min(from + 6 * 60, 22 * 60));
    from = Math.min(from, to - 6 * 60);
  }
  // Sections listed as online or still to be announced, unless they also have a time on the grid.
  const placed = new Set(blocks.map((block) => block.courseId));
  return { days, from, to, blocks, courses, unscheduled: [...unscheduled].filter((courseId) => !placed.has(courseId)) };
}
