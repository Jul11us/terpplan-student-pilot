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

// Shapes as Canvas actually returns them: ids and numbers arrive as strings often enough
// that the API types stay loose and normalisation happens once, inside CanvasClient.
type ApiEnrollment = {
  type?: string;
  grades?: { current_score?: number | string | null; current_grade?: string | null; final_score?: number | string | null };
};
type ApiCourse = {
  id: number;
  name?: string;
  course_code?: string;
  html_url?: string;
  term?: { name?: string } | null;
  syllabus_body?: string | null;
  enrollments?: ApiEnrollment[];
};
type ApiGroup = { id: number; name?: string; group_weight?: number | string | null; position?: number };
type ApiAssignment = {
  id: number;
  name?: string;
  assignment_group_id?: number | null;
  points_possible?: number | string | null;
  score?: number | string | null;
  due_at?: string | null;
  html_url?: string | null;
  submission?: { score?: number | string | null; missing?: boolean };
};

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

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function explainStatus(status: number, body: string): CanvasError {
  const tail = body ? `: ${body.slice(0, 180)}` : "";
  if (status === 401) return new CanvasError("Canvas rejected the token.", { status, key: "err.canvas.401", hintKey: "err.canvas.401Hint" });
  if (status === 403) return new CanvasError("Canvas refused that request.", { status, key: "err.canvas.403", hintKey: "err.canvas.403Hint" });
  if (status === 404) return new CanvasError("Canvas has no such record.", { status, key: "err.canvas.404", hintKey: "err.canvas.404Hint" });
  if (status === 429) return new CanvasError("Canvas is rate-limiting this browser.", { status, key: "err.canvas.429", hintKey: "err.canvas.429Hint" });
  return new CanvasError(`Canvas returned ${status}${tail}`, { status, key: "err.canvas.generic", params: { status, body: tail } });
}

/**
 * A Canvas REST client.
 *
 * NOT WIRED TO ANY UI, deliberately. umd.instructure.com sends no CORS headers for the API — an
 * OPTIONS preflight to /api/v1/users/self/profile 404s and the GET carries no
 * Access-Control-Allow-Origin — so a browser fetch with an Authorization header is blocked even
 * when the student holds a valid token. Shipping a token form around this would only invite
 * students to paste a credential into something that cannot work.
 *
 * It is kept because the code is correct and the only missing piece is a same-origin proxy: a
 * server route that forwards these four GETs would make this client, and the token route with it,
 * work as written. Until such a route exists, `bookmarkletHref()` above is the way in.
 */
export class CanvasClient {
  private token: string;
  private baseUrl: string;

  constructor(token: string, baseUrl: string = DEFAULT_BASE_URL) {
    this.token = (token ?? "").trim();
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  async request<T>(path: string, params: Record<string, string | number | string[] | undefined> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/v1${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item));
      else url.searchParams.set(k, String(v));
    }

    let res: Response;
    try {
      res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" } });
    } catch {
      throw new CanvasError(`Could not reach ${this.baseUrl}.`, { key: "err.canvas.unreachable", params: { host: this.baseUrl }, hintKey: "err.canvas.unreachableHint" });
    }
    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch { /* ignore */ }
      throw explainStatus(res.status, body);
    }
    return (await res.json()) as T;
  }

  /**
   * Follow pagination by page number. Canvas exposes the next page in the `Link` header, but that
   * header is not readable cross-origin unless the server lists it in Access-Control-Expose-Headers.
   */
  private async paginate<T>(path: string, params: Record<string, string | number | string[] | undefined> = {}, maxPages = 12): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const batch = await this.request<T[]>(path, { ...params, per_page: 100, page });
      if (!Array.isArray(batch) || batch.length === 0) break;
      out.push(...batch);
      if (batch.length < 100) break;
    }
    return out;
  }

  whoAmI() {
    return this.request<{ id: number; name?: string; short_name?: string; login_id?: string }>("/users/self/profile");
  }

  normaliseCourse(c: ApiCourse): CanvasCourse {
    const enrolments = c.enrollments ?? [];
    const enrolment = enrolments.find((e) => e.type === "studentenrollment") ?? enrolments[0] ?? {};
    const grades = enrolment.grades ?? {};
    return {
      canvasId: c.id,
      code: c.course_code || c.name || String(c.id),
      title: c.name || c.course_code || "",
      term: c.term?.name ?? null,
      canvasCurrentScore: numOrNull(grades.current_score),
      canvasCurrentGrade: grades.current_grade ?? null,
      canvasFinalScore: numOrNull(grades.final_score),
      syllabusBody: c.syllabus_body ?? null,
      htmlUrl: c.html_url ?? null,
    };
  }

  async listCourses(): Promise<CanvasCourse[]> {
    const raw = await this.paginate<ApiCourse>("/courses", {
      enrollment_state: "active",
      "include[]": ["total_scores", "enrollments", "term", "syllabus_body"],
      state: ["available"],
    });
    return raw.filter((c) => c && (c.name || c.course_code)).map((c) => this.normaliseCourse(c));
  }

  async fetchCourseDetail(courseId: number): Promise<CanvasDetail> {
    const [groups, assignments] = await Promise.all([
      this.paginate<ApiGroup>(`/courses/${courseId}/assignment_groups`),
      this.paginate<ApiAssignment>(`/courses/${courseId}/assignments`, { "include[]": ["submission"], order_by: "due_at" }),
    ]);
    return {
      groups: groups.map((g, i) => ({ id: g.id, name: g.name || `Group ${i + 1}`, weight: numOrNull(g.group_weight), position: g.position ?? i })),
      items: assignments.map((a) => ({
        id: a.id,
        name: a.name || "Untitled",
        assignment_group_id: a.assignment_group_id ?? null,
        points_possible: numOrNull(a.points_possible),
        score: numOrNull(a.submission?.score ?? a.score),
        missing: !!a.submission?.missing,
        due_at: a.due_at ?? null,
        html_url: a.html_url ?? null,
      })),
    };
  }

  async syncAll(onProgress: (message: string) => void = () => {}): Promise<CanvasPayload> {
    const me = await this.whoAmI();
    onProgress("Reading your Canvas courses…");
    const courses = await this.listCourses();
    const detail: Record<string, CanvasDetail> = {};

    for (let i = 0; i < courses.length; i++) {
      const c = courses[i]!;
      onProgress(`Reading ${c.code}… (${i + 1}/${courses.length})`);
      try {
        detail[String(c.canvasId)] = await this.fetchCourseDetail(c.canvasId);
      } catch (err) {
        detail[String(c.canvasId)] = { groups: [], items: [], error: (err as Error).message };
      }
    }
    return { me: { name: me?.name ?? null }, courses, detail };
  }
}

/**
 * Fold a Canvas payload into the stored course list.
 *
 * Used by BOTH the live token sync and the token-free file import, so the two produce identical
 * results. Everything the student has entered — credits, grading scheme, manual scores, overrides —
 * is preserved; only the Canvas half is refreshed.
 *
 * `existing` is the caller's stored courses; the return value is the new list plus counts.
 */

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
  canvas?: { groups?: CanvasGroup[]; items?: CanvasItem[] };
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
    const canvas = { groups: detail?.groups ?? [], items: detail?.items ?? [] };

    if (found) {
      found.code = c.code;
      found.title = c.title;
      found.term = c.term || found.term;
      found.canvasCurrentScore = c.canvasCurrentScore;
      found.canvasCurrentGrade = c.canvasCurrentGrade;
      found.canvasUrl = c.htmlUrl;
      found.syllabusBody = c.syllabusBody || found.syllabusBody;
      if (c.weighted !== undefined) found.weighted = c.weighted;
      found.canvas = canvas;
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

/**
 * The token-free exporter, as a string so the app can offer it as a bookmarklet and as a console
 * snippet. Deliberately readable — it is meant to be audited before it is run. It writes one file
 * and changes nothing. Kept free of backticks and `${}` so it survives being embedded verbatim.
 */
export const EXPORT_SOURCE = `(async function () {
  if (location.hostname.indexOf("instructure.com") === -1) {
    alert("请先打开 umd.instructure.com 并登录，再运行这个脚本。\\n\\nOpen umd.instructure.com and sign in first, then run this again.");
    return;
  }
  var BASE = location.origin;
  var TARGET = "__TERPPLAN_TARGET__";
  var log = function (m) { console.log("[TerpPlan] " + m); };
  function qs(p) {
    var parts = [];
    for (var k in p) {
      if (!Object.prototype.hasOwnProperty.call(p, k)) continue;
      var v = p[k];
      if (v === null || v === undefined) continue;
      if (Object.prototype.toString.call(v) === "[object Array]") {
        for (var i = 0; i < v.length; i++) parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(v[i]));
      } else parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
    }
    return parts.join("&");
  }
  async function api(path, params) {
    var res = await fetch(BASE + "/api/v1" + path + "?" + qs(params || {}), { credentials: "include", headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(path + " -> HTTP " + res.status);
    return res.json();
  }
  async function all(path, params) {
    var out = [];
    for (var p = 1; p <= 12; p++) {
      var batch = await api(path, Object.assign({}, params || {}, { per_page: 100, page: p }));
      if (!batch || !batch.length) break;
      out = out.concat(batch);
      if (batch.length < 100) break;
    }
    return out;
  }
  function n(v) { if (v === null || v === undefined || v === "") return null; var x = Number(v); return isFinite(x) ? x : null; }
  try {
    log("reading your profile...");
    var me = await api("/users/self/profile", {});
    log("reading courses...");
    var courses = (await all("/courses", { enrollment_state: "active", include: ["total_scores", "enrollments", "term", "syllabus_body"], state: ["available"] }))
      .filter(function (c) { return c && (c.name || c.course_code); });
    log(courses.length + " course(s) found.");
    var payload = { format: "terpplan.canvas-export", version: 1, exportedAt: new Date().toISOString(), baseUrl: BASE,
      me: { name: (me && (me.name || me.short_name)) || null }, courses: [], detail: {} };
    for (var i = 0; i < courses.length; i++) {
      var c = courses[i];
      var es = (c.enrollments || []).filter(function (e) { return e.type === "studentenrollment"; });
      var g = ((es[0] || (c.enrollments || [])[0] || {}).grades) || {};
      payload.courses.push({ canvasId: c.id, code: c.course_code || c.name || String(c.id), title: c.name || c.course_code || "",
        term: (c.term && c.term.name) || null, canvasCurrentScore: n(g.current_score), canvasCurrentGrade: g.current_grade || null,
        canvasFinalScore: n(g.final_score), syllabusBody: c.syllabus_body || null, htmlUrl: c.html_url || null,
        // Canvas grades by total points when this is false, which the engine has to mirror.
        weighted: c.apply_assignment_group_weights === undefined ? null : !!c.apply_assignment_group_weights });
      log("reading assignments for " + (c.course_code || c.id) + " (" + (i + 1) + "/" + courses.length + ")...");
      try {
        var groups = await all("/courses/" + c.id + "/assignment_groups", {});
        var assignments = await all("/courses/" + c.id + "/assignments", { include: ["submission"], order_by: "due_at" });
        payload.detail[c.id] = {
          groups: groups.map(function (x, xi) { return { id: x.id, name: x.name || ("Group " + (xi + 1)), weight: n(x.group_weight), position: x.position === undefined ? xi : x.position }; }),
          items: assignments.map(function (a) { var s = a.submission || {}; return { id: a.id, name: a.name || "Untitled",
            assignment_group_id: a.assignment_group_id === undefined ? null : a.assignment_group_id, points_possible: n(a.points_possible),
            score: n(s.score === undefined ? a.score : s.score), missing: !!s.missing, due_at: a.due_at || null, html_url: a.html_url || null }; })
        };
      } catch (err) {
        log("could not read " + (c.course_code || c.id) + ": " + err.message);
        payload.detail[c.id] = { groups: [], items: [], error: String(err.message || err) };
      }
    }
    var json = JSON.stringify(payload, null, 2);

    // Hand the data straight to TerpPlan through the URL fragment when we can. A fragment is
    // never sent to a server, so nothing is uploaded, and the student skips saving a file,
    // finding the tab again and re-picking that file. Gzip keeps the URL to a sane length: the
    // courses are the bulk of it and they compress by roughly fifteen to one.
    if (typeof CompressionStream === "function" && typeof TextEncoder === "function") {
      try {
        var gz = new Blob([new TextEncoder().encode(json)]).stream()
          .pipeThrough(new CompressionStream("gzip"));
        var packed = new Uint8Array(await new Response(gz).arrayBuffer());
        var bin = "";
        for (var i = 0; i < packed.length; i++) bin += String.fromCharCode(packed[i]);
        var b64 = btoa(bin).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
        var url = TARGET + "#canvas-import=" + b64;
        if (url.length < 1000000) {
          // Open before alerting: an alert can cost us the user-gesture context that makes a
          // popup allowed in the first place.
          var win = window.open(url, "_blank");
          if (win) {
            log("done — " + payload.courses.length + " course(s) handed to TerpPlan (" + url.length + " chars).");
            alert("导出完成：" + payload.courses.length + " 门课程。\\n\\nTerpPlan 会在刚打开的新标签页里自动读取。\\n\\nExported " + payload.courses.length + " course(s). The tab that just opened will pick them up.");
            return;
          }
          log("the popup was blocked — downloading a file instead.");
        } else {
          log("too long for a link (" + url.length + " chars) — downloading a file instead.");
        }
      } catch (err) {
        log("could not build a link (" + err.message + ") — downloading a file instead.");
      }
    }

    var a2 = document.createElement("a");
    a2.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a2.download = "terpplan-canvas-export.json";
    document.body.appendChild(a2);
    a2.click();
    a2.remove();
    log("done — " + payload.courses.length + " course(s) exported.");
    alert("导出完成：" + payload.courses.length + " 门课程。\\n\\n文件 terpplan-canvas-export.json 已下载，请回到 TerpPlan 导入。\\n\\nExported " + payload.courses.length + " course(s). Import the downloaded file into TerpPlan.");
  } catch (err) {
    console.error("[TerpPlan] export failed:", err);
    alert("导出失败：" + (err && err.message ? err.message : err) + "\\n\\n请确认你已登录 Canvas，然后重试。\\nExport failed — make sure you are signed in to Canvas and try again.");
  }
})();`;

/** Where the bookmarklet should send the student back to: this very page. */
export function defaultTarget(): string {
  if (typeof location === "undefined") return "";
  return location.origin + location.pathname;
}

/** The exporter with the return address filled in. */
export function exportSource(target?: string): string {
  return EXPORT_SOURCE.split("__TERPPLAN_TARGET__").join(target || defaultTarget() || "__TERPPLAN_TARGET__");
}

export function bookmarkletHref(target?: string): string {
  return `javascript:${encodeURIComponent(exportSource(target))}`;
}

/** The fragment key the bookmarklet appends its payload under. */
export const IMPORT_HASH_KEY = "canvas-import";

function b64urlToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Decode a `#canvas-import=…` fragment the bookmarklet produced: base64url over gzipped JSON.
 * Returns the parsed payload, or null when the fragment is absent or unreadable.
 *
 * The data travelled in the fragment rather than the query string precisely so it never reaches
 * a server — a student's grades stay between their Canvas tab and this one.
 */
export async function readImportFragment(hash: string): Promise<CanvasPayload | null> {
  const raw = String(hash || "");
  const marker = `${IMPORT_HASH_KEY}=`;
  const at = raw.indexOf(marker);
  if (at === -1) return null;

  const encoded = raw.slice(at + marker.length);
  if (!encoded) return null;

  let json: string;
  try {
    if (typeof DecompressionStream !== "function") return null;
    // Same shape as readZipEntry in syllabus-file.ts: drive the stream with a writer rather than
    // wrapping bytes in a Blob, which keeps the typed-array generics out of it.
    const stream = new DecompressionStream("gzip");
    const writer = stream.writable.getWriter();
    writer.write(b64urlToBytes(encoded));
    writer.close();
    json = await new Response(stream.readable).text();
  } catch {
    return null;
  }

  try {
    const data = JSON.parse(json) as { format?: unknown; courses?: unknown };
    if (!data || data.format !== "terpplan.canvas-export") return null;
    if (!Array.isArray(data.courses)) return null;
    return data as CanvasPayload;
  } catch {
    return null;
  }
}
