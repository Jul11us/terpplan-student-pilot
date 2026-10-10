"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Day = { day: string; visitors: number; newVisitors: number };
type Labels = { daily: string; total: string; new: string; returning: string };

export function AdminVisitorsChart({ days, labels }: { days: Day[]; labels: Labels }) {
  const max = Math.max(1, ...days.map((row) => row.visitors));
  const [active, setActive] = useState<{ row: Day; anchor: DOMRect; source: "pointer" | "focus" } | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const tooltipId = useId();

  function show(row: Day, column: HTMLDivElement, source: "pointer" | "focus") {
    const bar = column.querySelector(".admin-visitor-stack") ?? column;
    setActive({ row, anchor: bar.getBoundingClientRect(), source });
  }

  useLayoutEffect(() => {
    if (!active || !tooltip.current) return;
    const box = tooltip.current.getBoundingClientRect(), margin = 12, gap = 10;
    const availableWidth = document.documentElement.clientWidth;
    const left = Math.max(margin, Math.min(active.anchor.left + active.anchor.width / 2 - box.width / 2, availableWidth - box.width - margin));
    const above = active.anchor.top - box.height - gap;
    const desiredTop = above >= margin ? above : active.anchor.bottom + gap;
    const top = Math.max(margin, Math.min(desiredTop, window.innerHeight - box.height - margin));
    // Measure the portal before paint so the first/last bars stay inside the viewport.
    setPosition({ left, top });
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const dismiss = () => setActive(null);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    // A viewport or chart scroll invalidates the stored anchor; never leave a floating stale tip.
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("keydown", escape);
    };
  }, [active]);

  return <>
    <div className="admin-visitor-chart" role="group" aria-label={labels.daily}>
      {days.map((row) => <div key={row.day} tabIndex={0} className="admin-visitor-column"
        data-active={active?.row.day === row.day || undefined}
        aria-label={`${row.day}: ${labels.total} ${row.visitors}, ${labels.new} ${row.newVisitors}, ${labels.returning} ${row.visitors - row.newVisitors}`}
        aria-describedby={active?.row.day === row.day ? tooltipId : undefined}
        onPointerEnter={(event) => show(row, event.currentTarget, "pointer")}
        onPointerLeave={() => setActive((current) => current?.source === "pointer" && current.row.day === row.day ? null : current)}
        onFocus={(event) => show(row, event.currentTarget, event.currentTarget.matches(":focus-visible") ? "focus" : "pointer")}
        onBlur={() => setActive((current) => current?.row.day === row.day ? null : current)}>
        <span className="admin-visitor-stack" style={{ height: `${row.visitors ? Math.max(2, row.visitors / max * 100) : 0}%`, borderWidth: row.visitors ? undefined : 0 }}>
          <span style={{ height: `${row.visitors ? row.newVisitors / row.visitors * 100 : 0}%`, background: "#93c5fd" }} />
          <span style={{ flex: 1, background: "#ffdc55" }} />
        </span>
      </div>)}
    </div>
    <div className="admin-chart-dates"><span>{days[0]?.day.slice(5)}</span><span>{days.at(-1)?.day.slice(5)}</span></div>
    {active && createPortal(<div ref={tooltip} id={tooltipId} role="tooltip" className="admin-visitor-tip"
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}>
      <p className="admin-visitor-tip-date">{active.row.day}</p>
      <dl>
        <div><dt><span className="admin-tip-dot admin-tip-dot-new" />{labels.new}</dt><dd>{active.row.newVisitors}</dd></div>
        <div><dt><span className="admin-tip-dot admin-tip-dot-returning" />{labels.returning}</dt><dd>{active.row.visitors - active.row.newVisitors}</dd></div>
        <div className="admin-visitor-tip-total"><dt>{labels.total}</dt><dd>{active.row.visitors}</dd></div>
      </dl>
    </div>, document.body)}
  </>;
}
