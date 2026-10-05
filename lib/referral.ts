// "Where did visitors come from": a link or QR code carries ?ref=<tag> (terpplan.com/?ref=qr), and each
// browser counts once per tag per day. Shared by the page (which reports) and the server (which counts).

// Lower-case letters, digits and dashes, up to 40 characters: "qr", "wechat", "poster-mckeldin".
export function validRef(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(value);
}

// The visit's day in Eastern time (UMD's), as YYYY-MM-DD.
export function easternDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
