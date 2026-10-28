/* ============================================================================
   Token-free Canvas export
   ----------------------------------------------------------------------------
   WHY THIS EXISTS
   Many universities disable self-service API tokens for students. Canvas
   renders the "+ New Access Token" button greyed out with an ⓘ tooltip, and
   there is nothing the student can do about it from their side.

   The restriction, though, is on *creating a token* — not on *using the Canvas
   API*. `/api/v1/courses` and friends are the same endpoints Canvas's own web
   interface calls, and they accept the ordinary login session cookie. So code
   running inside the student's own Canvas tab can read exactly the same data,
   with no token and no password ever leaving the browser.

   This module holds that code as a string so the app can offer it two ways:
     · as a bookmarklet (one click, but some strict CSP setups block it)
     · as a console snippet (reliable, needs DevTools)

   The script is deliberately readable — it is meant to be audited before it is
   run. It sends a browser-only import and never downloads a file automatically.
   ========================================================================= */

/** Swapped for the real TerpPlan URL when a bookmarklet is generated. */
const TARGET_TOKEN = '__TERPPLAN_TARGET__';

/**
 * Serialized script text stays independent of bundler-generated helper functions.
 */
// Open the receiving tab while the bookmark click still has user activation.
// All API requests happen afterwards; delayed window.open calls are blocked by Safari.
const EXPORT_BODY = [
  "(async function exportCanvas() {",
  "  if (!/(^|\\.)instructure\\.com$/i.test(location.hostname)) {",
  "    window.alert('请先打开 umd.instructure.com 并登录，再运行书签。\\nOpen Canvas and sign in before running this bookmark.');",
  "    return;",
  "  }",
  "  var TARGET = '__TERPPLAN_TARGET__';",
  "  var receiver = null;",
  "  var json = null;",
  "  var log = function (message) { console.log('[TerpPlan] ' + message); };",
  "",
  "  try {",
  "    receiver = window.open('about:blank', '_blank');",
  "    if (receiver) {",
  "      receiver.opener = null;",
  "      receiver.document.title = '正在读取 Canvas · TerpPlan';",
  "      receiver.document.body.textContent = '正在读取 Canvas 课程和成绩，请稍候… / Reading Canvas courses and scores…';",
  "      Object.assign(receiver.document.body.style, {",
  "        fontFamily: 'system-ui, sans-serif', padding: '48px', color: '#273c38', background: '#f5f3ef',",
  "      });",
  "    }",
  "  } catch { /* A blocked popup will use a same-tab hand-off instead. */ }",
  "",
  "  async function api(path, params) {",
  "    var query = new URLSearchParams();",
  "    Object.keys(params || {}).forEach(function (key) {",
  "      var value = params[key];",
  "      (Array.isArray(value) ? value : [value]).forEach(function (v) { query.append(key, v); });",
  "    });",
  "    var response = await fetch(location.origin + '/api/v1' + path + '?' + query, {",
  "      credentials: 'include', headers: { Accept: 'application/json' },",
  "    });",
  "    if (!response.ok) throw new Error(path + ' -> HTTP ' + response.status);",
  "    return response.json();",
  "  }",
  "",
  "  async function all(path, params) {",
  "    var out = [];",
  "    for (var page = 1; page <= 12; page++) {",
  "      var batch = await api(path, Object.assign({}, params, { per_page: 100, page: page }));",
  "      if (!Array.isArray(batch) || !batch.length) break;",
  "      out = out.concat(batch);",
  "      if (batch.length < 100) break;",
  "    }",
  "    return out;",
  "  }",
  "",
  "  function num(value) {",
  "    if (value === null || value === undefined || value === '') return null;",
  "    var number = Number(value);",
  "    return isFinite(number) ? number : null;",
  "  }",
  "",
  "  // A large payload or a navigation restriction gets an explicit copy action,",
  "  // never an automatic file download. The JSON is kept on the Canvas page.",
  "  function offerCopy(message) {",
  "    var panel = document.createElement('dialog');",
  "    panel.setAttribute('aria-label', '复制 Canvas 数据 / Copy Canvas data');",
  "    Object.assign(panel.style, { width: 'min(620px, 85vw)', padding: '24px', borderRadius: '16px', border: '1px solid #dedbd3' });",
  "    var title = document.createElement('h2');",
  "    title.textContent = '复制数据后导入 / Copy and import';",
  "    var hint = document.createElement('p');",
  "    hint.textContent = message + '\\n复制下方数据，在 TerpPlan 的「粘贴数据导入」中粘贴。不会下载文件。 / Copy the data below and use “Paste Canvas data” on TerpPlan. No file is downloaded.';",
  "    var text = document.createElement('textarea');",
  "    text.value = json;",
  "    text.readOnly = true;",
  "    text.setAttribute('aria-label', 'Canvas JSON');",
  "    Object.assign(text.style, { width: '100%', height: '150px', boxSizing: 'border-box', marginBottom: '16px' });",
  "    var copy = document.createElement('button');",
  "    copy.textContent = '复制数据 / Copy data';",
  "    copy.onclick = async function () {",
  "      try { await navigator.clipboard.writeText(json); copy.textContent = '已复制 / Copied'; }",
  "      catch { text.focus(); text.select(); }",
  "    };",
  "    var link = document.createElement('a');",
  "    link.textContent = ' 打开 TerpPlan / Open TerpPlan ';",
  "    link.href = TARGET + '#/connect';",
  "    link.target = '_blank';",
  "    link.rel = 'noopener noreferrer';",
  "    var close = document.createElement('button');",
  "    close.textContent = '关闭 / Close';",
  "    close.onclick = function () { panel.close(); panel.remove(); };",
  "    panel.append(title, hint, text, copy, link, close);",
  "    document.body.appendChild(panel);",
  "    panel.showModal();",
  "  }",
  "",
  "  try {",
  "    var me = await api('/users/self/profile', {});",
  "    var courses = await all('/courses', {",
  "      enrollment_state: 'active',",
  "      'include[]': ['total_scores', 'enrollments', 'term', 'syllabus_body'],",
  "      'state[]': ['available'],",
  "    });",
  "    var payload = {",
  "      format: 'terpplan.canvas-export', version: 1, exportedAt: new Date().toISOString(),",
  "      baseUrl: location.origin, me: { name: me.name || me.short_name || null }, courses: [], detail: {},",
  "    };",
  "    for (var c of courses.filter(function (course) { return course && (course.name || course.course_code); })) {",
  "      var enrolment = (c.enrollments || []).find(function (e) { return e.type === 'studentenrollment'; }) || (c.enrollments || [])[0] || {};",
  "      var grades = enrolment.grades || {};",
  "      payload.courses.push({",
  "        canvasId: c.id, code: c.course_code || c.name || String(c.id), title: c.name || c.course_code || '',",
  "        term: (c.term && c.term.name) || null,",
  "        canvasCurrentScore: num(grades.current_score), canvasCurrentGrade: grades.current_grade || null,",
  "        canvasFinalScore: num(grades.final_score), syllabusBody: c.syllabus_body || null, htmlUrl: c.html_url || null,",
  "        weighted: c.apply_assignment_group_weights === undefined ? null : !!c.apply_assignment_group_weights,",
  "      });",
  "      log('Reading ' + (c.course_code || c.id));",
  "      try {",
  "        var groups = await all('/courses/' + c.id + '/assignment_groups', {});",
  "        var assignments = await all('/courses/' + c.id + '/assignments', { 'include[]': ['submission'], order_by: 'due_at' });",
  "        payload.detail[c.id] = {",
  "          groups: groups.map(function (g, i) { return {",
  "            id: g.id, name: g.name || ('Group ' + (i + 1)), weight: num(g.group_weight), position: g.position === undefined ? i : g.position,",
  "          }; }),",
  "          items: assignments.map(function (a) {",
  "            var sub = a.submission || {};",
  "            return {",
  "              id: a.id, name: a.name || 'Untitled', assignment_group_id: a.assignment_group_id === undefined ? null : a.assignment_group_id,",
  "              points_possible: num(a.points_possible), score: num(sub.score === undefined ? a.score : sub.score),",
  "              missing: !!sub.missing, due_at: a.due_at || null, html_url: a.html_url || null,",
  "              submission_types: Array.isArray(a.submission_types) ? a.submission_types.join(',') : a.submission_types,",
  "            };",
  "          }),",
  "        };",
  "      } catch (err) {",
  "        payload.detail[c.id] = { groups: [], items: [], error: String(err.message || err) };",
  "      }",
  "    }",
  "    json = JSON.stringify(payload);",
  "    var bytes = new TextEncoder().encode(json);",
  "    var encoding = 'json.';",
  "    if (typeof CompressionStream === 'function') {",
  "      try {",
  "        var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));",
  "        bytes = new Uint8Array(await new Response(stream).arrayBuffer());",
  "        encoding = 'gzip.';",
  "      } catch { /* Uncompressed fragments work without the compression API. */ }",
  "    }",
  "    var binary = '';",
  "    for (var byte of bytes) binary += String.fromCharCode(byte);",
  "    var packed = btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');",
  "    var url = TARGET + '#canvas-import=' + encoding + packed;",
  "    if (url.length > 1000000) {",
  "      if (receiver && !receiver.closed) receiver.close();",
  "      offerCopy('数据过大，无法通过网址传递。 / This export is too large for a URL.');",
  "      return;",
  "    }",
  "    if (receiver && !receiver.closed) {",
  "      try {",
  "        receiver.location.replace(url);",
  "        log('Sent ' + payload.courses.length + ' course(s) to TerpPlan.');",
  "        return;",
  "      } catch { /* A detached tab can still hand off in the current tab. */ }",
  "    }",
  "    // A top-level navigation needs no popup permission, even after async requests.",
  "    location.assign(url);",
  "  } catch (err) {",
  "    if (receiver && !receiver.closed) receiver.close();",
  "    if (json) offerCopy('无法打开接收页面。 / Could not open the receiving page.');",
  "    else window.alert('读取失败，请确认已登录 Canvas 后重试。 / Could not read Canvas. Sign in and retry.\\n' + (err.message || err));",
  "  }",
  "})();"
].join('\n');

/** Where the bookmarklet should send the student back to: this very page. */
export function defaultTarget() {
  if (typeof location === 'undefined') return '';
  return location.origin + location.pathname + location.search;
}

/** The exporter with the return address filled in. */
export function exportSource(target) {
  return EXPORT_BODY.replace("'" + TARGET_TOKEN + "'", JSON.stringify(target || defaultTarget() || TARGET_TOKEN));
}

/** The raw template, for tests that check it is safe to embed. */
export const EXPORT_SOURCE = EXPORT_BODY;

/** The `javascript:` URL for the drag-to-bookmarks-bar link. */
export function bookmarkletHref(target) {
  return `javascript:${encodeURIComponent(exportSource(target))}`;
}

/** The fragment key the bookmarklet appends its payload under. */
export const IMPORT_HASH_KEY = 'canvas-import';

function b64urlToBytes(b64) {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Decode a bookmarklet fragment: base64url over gzip or UTF-8 JSON.
 * Returns the parsed payload, or null when the fragment is absent or unreadable.
 *
 * The data travelled in the fragment rather than the query string precisely so it never reaches
 * a server — a student's grades stay between their Canvas tab and this one.
 */
export async function readImportFragment(hash) {
  const raw = String(hash || '');
  const marker = `${IMPORT_HASH_KEY}=`;
  const at = raw.indexOf(marker);
  if (at === -1) return null;

  const encoded = raw.slice(at + marker.length);
  if (!encoded) return null;

  let json;
  try {
    const plain = encoded.startsWith('json.');
    const bytes = b64urlToBytes(encoded.replace(/^(?:gzip|json)\./, ''));
    if (plain) {
      json = new TextDecoder().decode(bytes);
    } else {
      // Unprefixed gzip fragments from older bookmarks remain readable.
      if (typeof DecompressionStream !== 'function') return null;
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      json = await new Response(stream).text();
    }
  } catch {
    return null;
  }

  try {
    const data = JSON.parse(json);
    if (!data || data.format !== 'terpplan.canvas-export') return null;
    if (!Array.isArray(data.courses)) return null;
    return data;
  } catch {
    return null;
  }
}
