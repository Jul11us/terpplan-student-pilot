import { env } from "cloudflare:workers";
import { errorHour, type ErrorKind } from "@/lib/error-kinds";

// Adds to this hour's count for a kind of failure. Never throws: counting must not break what failed.
export async function countError(kind: ErrorKind, times = 1, now = new Date()) {
  if (!env.DB || times < 1) return;
  try {
    await env.DB.prepare("INSERT INTO error_counts (hour, kind, count) VALUES (?, ?, ?) ON CONFLICT(hour, kind) DO UPDATE SET count = count + excluded.count")
      .bind(errorHour(now), kind, Math.floor(times)).run();
  } catch { /* not counted */ }
}
