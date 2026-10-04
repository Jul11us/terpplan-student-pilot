import { isAsyncOnline, meetingDays, meetingMinutes, type MeetingTime } from "@/lib/meeting-time";

export const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type DayLoad = {
  day: (typeof WEEK_DAYS)[number];
  classMinutes: number;
  // Free time between the day's first and last class.
  gapMinutes: number;
  first: number | null;
  last: number | null;
};

export type WeekLoad = { days: DayLoad[]; totalClassMinutes: number; busiest: DayLoad["day"] | null };

type LoadSection = { meetings?: MeetingTime[] | null };

// Class time per weekday for one schedule. Overlapping meetings (a lecture listed twice) are merged so they
// count once; meetings with unknown times and asynchronous online work are left out. Weekend days appear
// only when something meets then.
export function weekLoad(sections: LoadSection[]): WeekLoad {
  const intervals = new Map<string, Array<[number, number]>>();
  for (const section of sections) {
    for (const meeting of section.meetings ?? []) {
      if (isAsyncOnline(meeting)) continue;
      const start = meetingMinutes(meeting.start_time), end = meetingMinutes(meeting.end_time);
      if (start === null || end === null || end <= start) continue;
      for (const day of meetingDays(meeting.days)) intervals.set(day, [...(intervals.get(day) ?? []), [start, end]]);
    }
  }
  const days = WEEK_DAYS.filter((day) => (day !== "Sat" && day !== "Sun") || intervals.has(day)).map((day): DayLoad => {
    const sorted = [...(intervals.get(day) ?? [])].sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const [start, end] of sorted) {
      const last = merged[merged.length - 1];
      if (last && start <= last[1]) last[1] = Math.max(last[1], end);
      else merged.push([start, end]);
    }
    const classMinutes = merged.reduce((sum, [start, end]) => sum + end - start, 0);
    const first = merged.length ? merged[0][0] : null;
    const last = merged.length ? merged[merged.length - 1][1] : null;
    return { day, classMinutes, gapMinutes: first === null || last === null ? 0 : last - first - classMinutes, first, last };
  });
  const totalClassMinutes = days.reduce((sum, day) => sum + day.classMinutes, 0);
  const busiest = totalClassMinutes ? days.reduce((best, day) => day.classMinutes > best.classMinutes ? day : best).day : null;
  return { days, totalClassMinutes, busiest };
}

export type GpaSummary = { average: number; low: number; high: number; known: number; total: number };

// Credit-weighted mean of the historical GPAs the chosen sections' instructors gave in each course.
// Describes past grades only; sections without a known GPA are counted in `total` but not in the mean.
export function historicalGpaSummary(sections: Array<{ instructorGpa?: number | null; credits: number | null }>): GpaSummary | null {
  const known = sections.filter((section): section is { instructorGpa: number; credits: number | null } => typeof section.instructorGpa === "number" && Number.isFinite(section.instructorGpa));
  if (!known.length) return null;
  const weight = (credits: number | null) => (credits && credits > 0 ? credits : 3);
  const totalWeight = known.reduce((sum, section) => sum + weight(section.credits), 0);
  const average = known.reduce((sum, section) => sum + section.instructorGpa * weight(section.credits), 0) / totalWeight;
  const values = known.map((section) => section.instructorGpa);
  return { average, low: Math.min(...values), high: Math.max(...values), known: known.length, total: sections.length };
}
