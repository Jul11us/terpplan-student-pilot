// Kinds of failure counted for /admin (see lib/error-report.ts and lib/error-counts.ts). Shared by the page,
// which reports the first group, and the server, which counts both.

// Seen in a visitor's browser: a TerpPlan API request that failed, by area, or an uncaught page error.
export const CLIENT_ERROR_KINDS = ["search", "course", "schedule", "seats", "alerts", "sync", "signin", "api", "page"] as const;
// Seen by the server itself.
export const SERVER_ERROR_KINDS = ["testudo", "email", "run", "rooms"] as const;
export const ERROR_KINDS = [...CLIENT_ERROR_KINDS, ...SERVER_ERROR_KINDS] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];
export type ErrorKind = (typeof ERROR_KINDS)[number];

export function validClientError(value: unknown): value is ClientErrorKind {
  return typeof value === "string" && (CLIENT_ERROR_KINDS as readonly string[]).includes(value);
}

// The area a failed request to TerpPlan's API belongs to; null for requests that are not counted (the
// counters themselves, the owner page) or are not TerpPlan's API.
export function errorKindForPath(path: string): ClientErrorKind | null {
  if (!path.startsWith("/api/")) return null;
  const area = path.split("/")[2] ?? "";
  if (["usage", "errors", "visit", "admin", "feedback"].includes(area)) return null;
  if (["search", "gened", "programs"].includes(area)) return "search";
  if (["course", "prereqs", "instructor", "professor-card", "professor-ratings", "professor-reviews"].includes(area)) return "course";
  if (area === "schedules") return "schedule";
  if (["seats", "trends"].includes(area)) return "seats";
  if (["watches", "alerts"].includes(area)) return "alerts";
  if (area === "sync") return "sync";
  if (area === "auth") return "signin";
  return "api";
}

// The hour bucket a failure is counted in.
export function errorHour(now = new Date()) {
  return now.toISOString().slice(0, 13);
}
