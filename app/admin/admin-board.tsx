"use client";

import { Children, isValidElement, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";

type PanelProps = { cardId: string; title: string; wide?: boolean; children: ReactNode };
const DEFAULT_ORDER = ["visitors", "mail", "runs", "errors", "usage", "race", "alerts", "referrals", "signups", "courses", "recent", "feedback"];
const STORAGE_KEY = "terpplan:admin:layout:v1";

export function AdminPanel({ children }: PanelProps) {
  return <div className="admin-panel-content">{children}</div>;
}

// Only the card order is saved. Stats and feedback never go into localStorage.
export function AdminBoard({ language, children }: { language: "en" | "zh"; children: ReactNode }) {
  const [order, setOrder] = useState(DEFAULT_ORDER);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; over: string | null } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const nodes = useRef(new Map<string, HTMLElement>());
  const before = useRef(new Map<string, DOMRect>());
  const start = useRef<{ id: string; x: number; y: number; over: string | null } | null>(null);
  const zh = language === "zh";
  const panels = Children.toArray(children).filter(isValidElement<PanelProps>);
  const ids = panels.map((panel) => panel.props.cardId);
  const sorted = [...panels].sort((a, b) => order.indexOf(a.props.cardId) - order.indexOf(b.props.cardId));

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (Array.isArray(saved)) {
        const valid = [...new Set(saved.filter((id): id is string => typeof id === "string" && DEFAULT_ORDER.includes(id)))];
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOrder([...valid, ...DEFAULT_ORDER.filter((id) => !valid.includes(id))]);
      }
    } catch { /* A blocked or malformed local preference uses the default layout. */ }
  }, []);

  useLayoutEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const [id, element] of nodes.current) {
        const old = before.current.get(id), next = element.getBoundingClientRect();
        if (old && (old.x !== next.x || old.y !== next.y)) {
          element.animate([{ transform: `translate(${old.x - next.x}px, ${old.y - next.y}px)` }, { transform: "translate(0, 0)" }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
        }
      }
    }
    before.current.clear();
  }, [order]);

  function save(next: string[], message: string) {
    before.current = new Map([...nodes.current].map(([id, element]) => [id, element.getBoundingClientRect()]));
    setOrder(next);
    setAnnouncement(message);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Moving still works for this visit. */ }
  }

  function move(id: string, target: string) {
    const from = order.indexOf(id), to = order.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...order];
    next.splice(from, 1); next.splice(to, 0, id);
    const name = panels.find((panel) => panel.props.cardId === id)?.props.title ?? id;
    save(next, zh ? `${name}已移动到第 ${to + 1} 位` : `${name} moved to position ${to + 1}`);
  }

  function pointerStart(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (event.button !== 0 || !event.isPrimary) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { id, x: event.clientX, y: event.clientY, over: null };
  }

  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const origin = start.current;
    if (!origin) return;
    const x = event.clientX - origin.x, y = event.clientY - origin.y;
    if (Math.hypot(x, y) < 5) return;
    const over = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-admin-card]")?.dataset.adminCard ?? null;
    origin.over = over && over !== origin.id ? over : null;
    setDrag({ id: origin.id, x, y, over: origin.over });
  }

  function pointerEnd(event: PointerEvent<HTMLButtonElement>, cancel = false) {
    const origin = start.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    start.current = null;
    setDrag(null);
    if (!cancel && origin?.over) move(origin.id, origin.over);
  }

  return <>
    <div className="admin-board-caption">
      <p><span className="admin-tiny-square" />{zh ? "你的工作台" : "YOUR WORKSPACE"}<span className="admin-caption-detail">{zh ? "拖动卡片手柄调整顺序" : "Drag a card handle to rearrange"}</span></p>
      <button type="button" className="admin-text-button" onClick={() => save(DEFAULT_ORDER, zh ? "已恢复默认布局" : "Default layout restored")}>{zh ? "恢复布局 ↺" : "Reset layout ↺"}</button>
    </div>
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    <div className="admin-board">
      {sorted.map((panel, index) => {
        const id = panel.props.cardId, moving = drag?.id === id;
        return <article id={`admin-${id}`} key={id} data-admin-card={id}
          ref={(element) => { if (element) nodes.current.set(id, element); else nodes.current.delete(id); }}
          className={`admin-card admin-card-${id}${panel.props.wide ? " admin-card-wide" : ""}${moving ? " admin-card-dragging" : ""}${drag?.over === id ? " admin-card-target" : ""}`}
          style={moving ? { transform: `translate(${drag.x}px, ${drag.y}px) rotate(-3deg)` } : undefined}>
          <div className="admin-card-toolbar">
            <span className="admin-card-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="admin-card-label">{panel.props.title}</span>
            <button type="button" className="admin-drag-handle" aria-label={zh ? `移动${panel.props.title}；方向键调整顺序` : `Move ${panel.props.title}; use arrow keys to reorder`}
              title={zh ? "拖动排序，或使用方向键" : "Drag to reorder, or use arrow keys"}
              onPointerDown={(event) => pointerStart(event, id)} onPointerMove={pointerMove}
              onPointerUp={(event) => pointerEnd(event)} onPointerCancel={(event) => pointerEnd(event, true)}
              onLostPointerCapture={() => { start.current = null; setDrag(null); }}
              onKeyDown={(event) => {
                if (event.key === "Escape") { start.current = null; setDrag(null); }
                if (["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight", "Home", "End"].includes(event.key)) {
                  event.preventDefault();
                  const current = sorted.findIndex((item) => item.props.cardId === id);
                  const next = event.key === "Home" ? 0 : event.key === "End" ? sorted.length - 1 : current + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1);
                  if (sorted[next] && ids.includes(sorted[next].props.cardId)) move(id, sorted[next].props.cardId);
                }
              }}><span aria-hidden="true">⠿</span></button>
          </div>
          {panel}
        </article>;
      })}
    </div>
  </>;
}
