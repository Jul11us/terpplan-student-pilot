// "What do people use": each browser counts once a day per feature (opened the planner, added a course, got
// schedule options, turned on a seat alert...), so /admin can show where visitors stop. The page sends a
// feature at most once a day; the server also counts each network address + browser kind once a day per
// feature (see /api/usage). Only the daily counts are kept. Nothing is counted in the sample or on /admin.

import { isDemo } from "@/lib/demo";
import { easternDay } from "@/lib/referral";

// In the order a visitor usually goes through them.
export const FEATURES = ["planner", "course", "schedule", "share", "calendar", "alert", "signin", "register", "hard", "demo"] as const;
export type Feature = (typeof FEATURES)[number];

export function validFeature(value: unknown): value is Feature {
  return typeof value === "string" && (FEATURES as readonly string[]).includes(value);
}

const PREFIX = "terpplan:use:";

export function countUse(feature: Feature) {
  if (typeof window === "undefined" || window.location.pathname.startsWith("/admin")) return;
  if (feature !== "demo" && isDemo()) return;
  const day = easternDay();
  try {
    const key = `${PREFIX}${feature}:${day}`;
    if (window.localStorage.getItem(key)) return;
    // Earlier days' marks are no longer needed.
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const old = window.localStorage.key(index);
      if (old?.startsWith(PREFIX) && !old.endsWith(`:${day}`)) window.localStorage.removeItem(old);
    }
    window.localStorage.setItem(key, "1");
  } catch { /* storage blocked: counted anyway, the server keeps repeats in check */ }
  void fetch("/api/usage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ feature }), keepalive: true }).catch(() => undefined);
}
