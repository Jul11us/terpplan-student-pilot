"use client";

import { useEffect } from "react";
import { errorKindForPath, type ClientErrorKind } from "@/lib/error-kinds";

// Counts what went wrong in this browser, for the owner's /admin: a request to TerpPlan's own API that
// failed (a 5xx answer, or no answer while online), by area, and uncaught errors in TerpPlan's own scripts.
// Only the kind is sent, never the address, the request or the error text. Each kind is sent at most once a
// minute from a page, and nothing is counted once the page is being left (navigating away cancels requests).
export default function ErrorReporter() {
  useEffect(() => {
    const flagged = window as typeof window & { __terpplanErrors?: boolean };
    if (flagged.__terpplanErrors) return;
    flagged.__terpplanErrors = true;
    const lastSent = new Map<ClientErrorKind, number>();
    let leaving = false;
    const originalFetch = window.fetch.bind(window);
    const report = (kind: ClientErrorKind) => {
      if (leaving || (lastSent.get(kind) ?? 0) > Date.now() - 60_000) return;
      lastSent.set(kind, Date.now());
      void originalFetch("/api/errors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }), keepalive: true }).catch(() => undefined);
    };
    const pathOf = (input: RequestInfo | URL) => {
      try {
        const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, window.location.href);
        return url.origin === window.location.origin ? url.pathname : null;
      } catch { return null; }
    };
    window.fetch = async (input, init) => {
      const path = pathOf(input);
      const kind = path ? errorKindForPath(path) : null;
      try {
        const response = await originalFetch(input, init);
        if (kind && response.status >= 500) report(kind);
        return response;
      } catch (error) {
        const aborted = error instanceof DOMException && error.name === "AbortError";
        if (kind && !aborted && navigator.onLine && document.visibilityState === "visible") report(kind);
        throw error;
      }
    };
    const onError = (event: ErrorEvent) => {
      // Browser extensions and other sites' scripts are not TerpPlan's errors.
      if (event.filename && event.filename.startsWith(window.location.origin)) report("page");
    };
    const onLeave = () => { leaving = true; };
    window.addEventListener("error", onError);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    // Coming back through the back/forward cache: the page is in use again.
    window.addEventListener("pageshow", () => { leaving = false; });
  }, []);
  return null;
}
