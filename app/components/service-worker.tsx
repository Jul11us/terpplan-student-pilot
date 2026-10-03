"use client";

import { useEffect } from "react";

// Registers /sw.js so "My week" opens offline. Skipped in development, where cached build files would get
// in the way of live reloading, unless localStorage "terpplan:sw" is "1" (for testing it locally).
export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let forced = false;
    try { forced = window.localStorage.getItem("terpplan:sw") === "1"; } catch { /* storage blocked */ }
    if (process.env.NODE_ENV !== "production" && !forced) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
