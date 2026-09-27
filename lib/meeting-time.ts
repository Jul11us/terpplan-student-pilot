// Small, dependency-free time helpers that can run in the browser.

export type MeetingTime = { days?: string | null; start_time?: string | null; end_time?: string | null; building?: string | null; room?: string | null };

// Asynchronous online work: Testudo lists it as an ONLINE meeting with no day or time ("Class time/details on ELMS").
// It occupies no fixed slot, so it is neither "time TBA" nor a possible conflict.
export function isAsyncOnline(meeting: MeetingTime) {
  return !meeting.start_time && !meeting.days && [meeting.building, meeting.room].some((value) => /online/i.test(value ?? ""));
}

// Every meeting is asynchronous online work: the section can be taken alongside anything.
export function isOnlineOnly(meetings: MeetingTime[]) {
  return meetings.length > 0 && meetings.every(isAsyncOnline);
}

const DAY_TOKENS: Array<[string, string]> = [["TH", "Thu"], ["TU", "Tue"], ["SA", "Sat"], ["SU", "Sun"], ["M", "Mon"], ["W", "Wed"], ["F", "Fri"], ["T", "Tue"]];

export function meetingDays(raw: string | null | undefined) {
  if (!raw || /^(TBA|TBD|ARRANGED)$/i.test(raw.trim())) return [] as string[];
  const text = raw.toUpperCase().replace(/[^A-Z]/g, "");
  const found: string[] = [];
  for (let index = 0; index < text.length;) {
    const token = DAY_TOKENS.find(([needle]) => text.startsWith(needle, index));
    if (token) { if (!found.includes(token[1])) found.push(token[1]); index += token[0].length; } else index += 1;
  }
  return found;
}

export function meetingMinutes(raw: string | null | undefined): number | null {
  if (!raw || /tba|tbd/i.test(raw)) return null;
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})\s*([ap]m)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (match[3]) { if (hour === 12) hour = 0; if (match[3].toLowerCase() === "pm") hour += 12; }
  return hour > 23 || minute > 59 ? null : hour * 60 + minute;
}

// A section whose day or time is missing (TBA) cannot be checked for conflicts.
export function hasUnknownTime(meetings: MeetingTime[]) {
  return !meetings.length || meetings.some((meeting) => {
    if (isAsyncOnline(meeting)) return false;
    const start = meetingMinutes(meeting.start_time), end = meetingMinutes(meeting.end_time);
    return start === null || end === null || end <= start || !meetingDays(meeting.days).length;
  });
}

// True when any meeting in one list overlaps one in the other. Meetings with unknown times never count.
export function meetingsConflict(left: MeetingTime[], right: MeetingTime[]) {
  const known = (meeting: MeetingTime) => {
    const start = meetingMinutes(meeting.start_time), end = meetingMinutes(meeting.end_time), days = meetingDays(meeting.days);
    return start !== null && end !== null && end > start && days.length ? { start, end, days } : null;
  };
  const a = left.map(known).filter((item) => item !== null);
  const b = right.map(known).filter((item) => item !== null);
  return a.some((x) => b.some((y) => x.days.some((day) => y.days.includes(day)) && x.start < y.end && y.start < x.end));
}
