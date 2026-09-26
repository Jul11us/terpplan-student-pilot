// Always shown in Eastern time, like class times, so a student abroad does not see two clocks mixed together.
// e.g. "Sep 26, 12:17 AM ET" / "9月26日 00:17（美东时间）"
export function formatSeatReadTime(value: string | null | undefined, language: "en" | "zh") {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  if (language === "zh") return `${part("month")}月${part("day")}日 ${part("hour")}:${part("minute")}（美东时间）`;
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date) + " ET";
}
