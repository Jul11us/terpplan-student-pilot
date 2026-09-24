import type { TermCalendar } from "@/lib/term-calendar";

// Builds an iCalendar (.ics) file with one weekly recurring event per class meeting.
// Times are pinned to America/New_York so the file imports correctly from any time zone.

export type IcsMeeting = {
  uid: string;
  summary: string;
  location: string;
  description: string;
  // "Mon".."Sun"
  days: string[];
  // Minutes after midnight, Eastern time.
  start: number;
  end: number;
};

const BYDAY: Record<string, string> = { Mon: "MO", Tue: "TU", Wed: "WE", Thu: "TH", Fri: "FR", Sat: "SA", Sun: "SU" };
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Rules in effect since 2007; enough for Outlook, which needs the zone spelled out.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:America/New_York",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "TZNAME:EDT",
  "DTSTART:20070311T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "TZNAME:EST",
  "DTSTART:20071104T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

// Date-only arithmetic on "YYYY-MM-DD" strings, done in UTC so local time zones never shift a day.
const toDate = (value: string) => new Date(`${value}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (value: string, days: number) => toIso(new Date(toDate(value).getTime() + days * 86_400_000));
const weekday = (value: string) => toDate(value).getUTCDay();

function eachDay(start: string, end: string) {
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

const compact = (date: string) => date.replaceAll("-", "");
const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}${String(minutes % 60).padStart(2, "0")}00`;
const escapeText = (value: string) => value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Lines longer than 75 bytes are folded with CRLF + space (RFC 5545 §3.1), without splitting a character.
function fold(line: string) {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    const limit = parts.length ? 74 : 75;
    if (encoder.encode(current + char).length > limit) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(meetings: IcsMeeting[], calendar: TermCalendar, calendarName: string, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const offDays = new Set(calendar.noClasses.flatMap(([start, end]) => eachDay(start, end)));
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TerpPlan//Schedule export//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeText(calendarName)}`, "X-WR-TIMEZONE:America/New_York", ...VTIMEZONE];

  for (const meeting of meetings) {
    const weekdays = new Set(meeting.days.map((day) => WEEKDAY_INDEX[day]).filter((day) => day !== undefined));
    const classDays = eachDay(calendar.firstDay, calendar.lastDay).filter((day) => weekdays.has(weekday(day)));
    const firstClass = classDays.find((day) => !offDays.has(day));
    if (!firstClass) continue;
    const skipped = classDays.filter((day) => day > firstClass && offDays.has(day));
    // UNTIL is in UTC; the morning after the last class day covers the last evening class in either EST or EDT.
    const until = `${compact(addDays(calendar.lastDay, 1))}T045959Z`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${meeting.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=America/New_York:${compact(firstClass)}T${clock(meeting.start)}`,
      `DTEND;TZID=America/New_York:${compact(firstClass)}T${clock(meeting.end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${meeting.days.map((day) => BYDAY[day]).filter(Boolean).join(",")};UNTIL=${until}`,
      ...(skipped.length ? [`EXDATE;TZID=America/New_York:${skipped.map((day) => `${compact(day)}T${clock(meeting.start)}`).join(",")}`] : []),
      `SUMMARY:${escapeText(meeting.summary)}`,
      `LOCATION:${escapeText(meeting.location)}`,
      `DESCRIPTION:${escapeText(meeting.description)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
