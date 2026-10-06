"use client";

import { useEffect } from "react";
import { easternDay, validRef } from "@/lib/referral";

// Counts this browser once a day as a visitor ("new" the first time it ever opens TerpPlan), and a visit
// that came in with ?ref=<tag> once per tag per day. The tag is then taken out of the address bar so a
// bookmark or a link shared onwards does not count again. The owner page (/admin) is not counted.
export default function ReferralTracker() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const rawRef = url.searchParams.get("ref")?.trim().toLowerCase();
    if (rawRef !== undefined) {
      url.searchParams.delete("ref");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    if (url.pathname.startsWith("/admin")) return;
    const day = easternDay();
    // Storage blocked: still count, the server's rate limit keeps repeats in check.
    const firstToday = (key: string) => {
      try {
        if (window.localStorage.getItem(key)) return false;
        window.localStorage.setItem(key, "1");
      } catch { /* counted anyway */ }
      return true;
    };
    const body: { ref?: string; visitor?: "new" | "returning" } = {};
    if (rawRef && validRef(rawRef) && firstToday(`terpplan:ref:${rawRef}:${day}`)) body.ref = rawRef;
    if (firstToday(`terpplan:visit:${day}`)) {
      let seenBefore = false;
      try {
        seenBefore = Boolean(window.localStorage.getItem("terpplan:first-visit"));
        if (!seenBefore) window.localStorage.setItem("terpplan:first-visit", day);
      } catch { /* unknown: counted as new */ }
      body.visitor = seenBefore ? "returning" : "new";
    }
    if (!body.ref && !body.visitor) return;
    void fetch("/api/visit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => undefined);
  }, []);
  return null;
}
