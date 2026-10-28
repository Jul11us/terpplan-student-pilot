// Canvas (umd.instructure.com) integration.
//
// WHY A TOKEN, AND WHY THERE IS A SECOND ROUTE
// UMD's Shibboleth page cannot be driven from another site — the IdP only issues tickets to services
// the university has registered, Duo sits in front of it, and collecting Directory ID + password on a
// non-university domain is the shape of a phishing page. A Canvas personal access token is the
// supported route: scoped, expiring, revocable by the student in two clicks.
//
// Many institutions now switch that off for students (UCLA in Jan 2026, St. Edward's documents it),
// which greys out the "+ New Access Token" button with no recourse. The block is on *creating a
// token*, not on *using the Canvas API* — the same endpoints Canvas's own pages call still answer a
// request from the student's signed-in tab. So EXPORT_SOURCE below is offered as a bookmarklet /
// console snippet that reads the same data with no token at all, and both routes land in
// mergeCanvasData so an import and a live sync behave identically.
//
// Nothing here touches TerpPlan's servers: the token lives in the browser and is sent only to Canvas.

import { looksForCredit } from "@/lib/grades/credit";

export const DEFAULT_BASE_URL = "https://umd.instructure.com";

export type CanvasGroup = { id: number; name: string; weight: number | null; position: number };
export type CanvasItem = {
  id: number;
  name: string;
  assignment_group_id: number | null;
  points_possible: number | null;
  score: number | null;
  missing: boolean;
  due_at: string | null;
  html_url: string | null;
};
export type CanvasCourse = {
  canvasId: number;
  code: string;
  title: string;
  term: string | null;
  canvasCurrentScore: number | null;
  canvasCurrentGrade: string | null;
  canvasFinalScore?: number | null;
  syllabusBody: string | null;
  htmlUrl: string | null;
  /** Canvas's apply_assignment_group_weights: false means it grades by total points. */
  weighted?: boolean | null;
};
export type CanvasDetail = { groups: CanvasGroup[]; items: CanvasItem[]; error?: string };
export type CanvasPayload = {
  format?: string;
  version?: number;
  exportedAt?: string;
  baseUrl?: string;
  me: { name: string | null } | null;
  courses: CanvasCourse[];
  detail: Record<string, CanvasDetail>;
};

export class CanvasError extends Error {
  status: number;
  key?: string;
  hint?: string;
  hintKey?: string;
  params?: Record<string, unknown>;

  constructor(
    message: string,
    opts: { status?: number; key?: string; hint?: string; hintKey?: string; params?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = "CanvasError";
    this.status = opts.status ?? 0;
    this.key = opts.key;
    this.hint = opts.hint;
    this.hintKey = opts.hintKey;
    this.params = opts.params;
  }
}

export type StoredCourse = {
  id?: string;
  canvasId?: number;
  code?: string;
  title?: string;
  term?: string | null;
  source?: string;
  credits?: number | null;
  canvasCurrentScore?: number | null;
  canvasCurrentGrade?: string | null;
  canvasUrl?: string | null;
  syllabusBody?: string | null;
  weighted?: boolean | null;
  canvas?: { groups?: CanvasGroup[]; items?: CanvasItem[]; error?: string };
  /** Set on Canvas courses only; see lib/grades/credit.ts. */
  forCredit?: boolean;
  manualItems?: unknown[];
  scheme?: unknown;
  overrides?: unknown;
};

export function mergeCanvasData(
  existing: StoredCourse[],
  payload: CanvasPayload,
  makeId: () => string,
): { courses: StoredCourse[]; added: number; updated: number; userName: string | null } {
  const courses: StoredCourse[] = [...existing];
  let added = 0;
  let updated = 0;

  for (const c of payload.courses ?? []) {
    const detail = payload.detail?.[String(c.canvasId)];
    const found = courses.find((x) => x.canvasId === c.canvasId);
    const canvas = { groups: detail?.groups ?? [], items: detail?.items ?? [], error: detail?.error };

    if (found) {
      found.code = c.code;
      found.title = c.title;
      found.term = c.term || found.term;
      found.canvasCurrentScore = c.canvasCurrentScore;
      found.canvasCurrentGrade = c.canvasCurrentGrade;
      found.canvasUrl = c.htmlUrl;
      found.syllabusBody = c.syllabusBody || found.syllabusBody;
      if (c.weighted !== undefined) found.weighted = c.weighted;
      found.canvas = detail && !detail.error ? canvas : { ...found.canvas, error: detail?.error ?? "Course details unavailable" };
      found.source = "canvas";
      found.forCredit = looksForCredit(c.code).forCredit;
      updated++;
    } else {
      courses.push({
        id: makeId(),
        canvasId: c.canvasId,
        code: c.code,
        title: c.title,
        term: c.term,
        source: "canvas",
        credits: null,
        canvasCurrentScore: c.canvasCurrentScore,
        canvasCurrentGrade: c.canvasCurrentGrade,
        canvasUrl: c.htmlUrl,
        syllabusBody: c.syllabusBody,
        weighted: c.weighted ?? null,
        canvas,
        forCredit: looksForCredit(c.code).forCredit,
        manualItems: [],
        scheme: null,
        overrides: {},
      });
      added++;
    }
  }

  return { courses, added, updated, userName: payload.me?.name ?? null };
}

/** Validate a `terpplan.canvas-export` file before trusting it. */
export function readCanvasExport(text: string): { ok: true; payload: CanvasPayload } | { ok: false; reason: "not-json" | "wrong-format" | "no-courses" } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not-json" };
  }
  if (typeof data !== "object" || data === null) return { ok: false, reason: "wrong-format" };
  const d = data as { format?: unknown; courses?: unknown; detail?: unknown; me?: unknown };
  if (d.format !== "terpplan.canvas-export") return { ok: false, reason: "wrong-format" };
  if (!Array.isArray(d.courses)) return { ok: false, reason: "no-courses" };
  return {
    ok: true,
    payload: {
      me: (d.me as CanvasPayload["me"]) ?? null,
      courses: d.courses as CanvasCourse[],
      detail: (d.detail as Record<string, CanvasDetail>) ?? {},
      format: d.format,
    },
  };
}

// Shared browser-only exporter: pre-open the receiving tab before reading Canvas.
export { EXPORT_SOURCE, IMPORT_HASH_KEY, defaultTarget, exportSource, bookmarkletHref, readImportFragment } from "./canvas-export-source.js";
