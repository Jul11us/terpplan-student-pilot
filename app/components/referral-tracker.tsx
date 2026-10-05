"use client";

import { useEffect } from "react";
import { easternDay, validRef } from "@/lib/referral";

// Reports a visit that came in with ?ref=<tag> once per tag per day from this browser, then takes the tag
// out of the address bar so a bookmark or a link shared onwards does not count again.
export default function ReferralTracker() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("ref")?.trim().toLowerCase();
    if (!ref) return;
    url.searchParams.delete("ref");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    if (!validRef(ref)) return;
    const key = `terpplan:ref:${ref}:${easternDay()}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch {
      // Storage blocked: still count, the server's rate limit keeps repeats in check.
    }
    void fetch("/api/visit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ref }), keepalive: true }).catch(() => undefined);
  }, []);
  return null;
}
