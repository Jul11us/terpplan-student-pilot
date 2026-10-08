import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { registerHooks } from "node:module";
import { testDatabase } from "./helpers/d1-sqlite.mjs";

globalThis.__errorsEnv = { EMAIL_AUTH_SECRET: "test-only-signing-secret-never-deploy", ADMIN_EMAILS: "owner@example.test" };
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export const env = globalThis.__errorsEnv;", shortCircuit: true };
  return next(specifier, context);
} });
const { POST: reportError } = await import("../app/api/errors/route.ts");
const { POST: sendFeedback } = await import("../app/api/feedback/route.ts");
const { adminStats } = await import("../lib/admin.ts");
const { countError } = await import("../lib/error-counts.ts");
const { ERROR_KINDS, errorHour, errorKindForPath, validClientError } = await import("../lib/error-kinds.ts");
const { readFeedback } = await import("../lib/feedback.ts");

let database, originalFetch, emails;
const post = (path, body, headers = {}) => new Request(`https://terpplan.test${path}`, { method: "POST", headers: { "content-type": "application/json", origin: "https://terpplan.test", "cf-connecting-ip": "203.0.113.7", ...headers }, body: JSON.stringify(body) });

beforeEach(() => {
  database = testDatabase(); globalThis.__errorsEnv.DB = database;
  emails = []; originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { emails.push({ url: String(url), body: JSON.parse(init.body) }); return new Response("{}", { status: globalThis.__emailStatus ?? 200 }); };
});
afterEach(() => {
  database.sqlite.close(); delete globalThis.__errorsEnv.DB; globalThis.fetch = originalFetch;
  delete globalThis.__errorsEnv.RESEND_API_KEY; delete globalThis.__errorsEnv.EMAIL_FROM; delete globalThis.__emailStatus;
});

test("failed requests are counted by area; the counters and the owner page are not", () => {
  assert.equal(errorKindForPath("/api/search"), "search");
  assert.equal(errorKindForPath("/api/professor-ratings"), "course");
  assert.equal(errorKindForPath("/api/schedules/generate"), "schedule");
  assert.equal(errorKindForPath("/api/watches/check"), "alerts");
  assert.equal(errorKindForPath("/api/auth/request-code"), "signin");
  assert.equal(errorKindForPath("/api/audit"), "api");
  for (const path of ["/api/errors", "/api/usage", "/api/visit", "/api/admin/stats", "/api/feedback", "/plan"]) assert.equal(errorKindForPath(path), null, path);
  assert.ok(validClientError("page"));
  assert.ok(!validClientError("testudo"), "server-only kinds cannot be sent from a page");
  assert.equal(errorHour(new Date("2026-11-01T13:45:00Z")), "2026-11-01T13");
});

test("a page's report adds one to this hour's count, within a per-address limit", async () => {
  assert.equal((await reportError(post("/api/errors", { kind: "schedule" }))).status, 200);
  await reportError(post("/api/errors", { kind: "schedule" }, { "cf-connecting-ip": "203.0.113.8" }));
  assert.equal((await reportError(post("/api/errors", { kind: "run" }))).status, 400);
  assert.equal((await reportError(post("/api/errors", { kind: "page" }, { origin: "https://evil.test" }))).status, 403);
  assert.deepEqual(database.sqlite.prepare("SELECT kind, count FROM error_counts").all().map((row) => [row.kind, row.count]), [["schedule", 2]]);
  for (let index = 0; index < 29; index += 1) await reportError(post("/api/errors", { kind: "page" }));
  assert.equal((await reportError(post("/api/errors", { kind: "page" }))).status, 429);
});

test("the owner page sums the last 24 hours and 7 days per kind", async () => {
  const now = Date.now();
  await countError("testudo", 3, new Date(now));
  await countError("testudo", 2, new Date(now - 30 * 3_600_000));
  await countError("email", 1, new Date(now - 10 * 86_400_000));
  await countError("email", 0);
  const { errors } = await adminStats();
  assert.deepEqual(errors.map((row) => row.kind), [...ERROR_KINDS]);
  assert.deepEqual(errors.find((row) => row.kind === "testudo"), { kind: "testudo", last24h: 3, last7Days: 5 });
  assert.deepEqual(errors.find((row) => row.kind === "email"), { kind: "email", last24h: 0, last7Days: 0 }, "older than a week, and zero adds nothing");
});

test("feedback is checked: a kind, a message, an optional real email, a plain page path", () => {
  const ok = { kind: "idea", message: "  Add a dark mode  ", contact: "", page: "/plan", language: "zh" };
  assert.deepEqual(readFeedback(ok), { value: { kind: "idea", message: "Add a dark mode", contact: null, page: "/plan", context: null, language: "zh" } });
  assert.ok("error" in readFeedback({ ...ok, kind: "spam" }));
  assert.ok("error" in readFeedback({ ...ok, message: "   " }));
  assert.ok("error" in readFeedback({ ...ok, message: "x".repeat(2001) }));
  assert.ok("error" in readFeedback({ ...ok, contact: "not an email" }));
  assert.ok("error" in readFeedback({ ...ok, page: "/plan#move=secret" }), "never a fragment that can hold a plan");
  assert.ok("error" in readFeedback({ ...ok, page: "https://evil.test/" }));
});

test("a feedback message is stored, emailed with a reply-to, and limited to five an hour", async () => {
  globalThis.__errorsEnv.RESEND_API_KEY = "test-key"; globalThis.__errorsEnv.EMAIL_FROM = "TerpPlan <alerts@example.test>";
  const response = await sendFeedback(post("/api/feedback", { kind: "problem", message: "CMSC131 shows the wrong room", contact: "student@example.test", page: "/plan", context: "Course: CMSC131\nTerm: Spring 2027", language: "en" }));
  assert.equal(response.status, 200);
  const row = database.sqlite.prepare("SELECT kind, message, contact, page, context FROM feedback").get();
  assert.deepEqual({ ...row }, { kind: "problem", message: "CMSC131 shows the wrong room", contact: "student@example.test", page: "/plan", context: "Course: CMSC131\nTerm: Spring 2027" });
  assert.equal(emails.length, 1);
  assert.deepEqual(emails[0].body.to, ["terpplan@proton.me"]);
  assert.equal(emails[0].body.reply_to, "student@example.test");
  assert.match(emails[0].body.subject, /^TerpPlan problem: CMSC131 shows the wrong room/);
  assert.match(emails[0].body.text, /Course: CMSC131/);
  for (let index = 0; index < 4; index += 1) await sendFeedback(post("/api/feedback", { kind: "idea", message: `idea ${index}`, page: "/" }));
  assert.equal((await sendFeedback(post("/api/feedback", { kind: "idea", message: "one more", page: "/" }))).status, 429);
  assert.equal(emails.filter((email) => !email.body.reply_to).length, 4, "anonymous messages have no reply-to");
  const { feedback } = await adminStats();
  assert.equal(feedback.length, 5);
  assert.equal(feedback[0].message, "idea 3", "newest first");
});

test("a message is kept even when the email fails, and the failure is counted", async () => {
  globalThis.__errorsEnv.RESEND_API_KEY = "test-key"; globalThis.__errorsEnv.EMAIL_FROM = "TerpPlan <alerts@example.test>";
  globalThis.__emailStatus = 500;
  assert.equal((await sendFeedback(post("/api/feedback", { kind: "other", message: "hello", page: "/" }))).status, 200);
  assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS n FROM feedback").get().n, 1);
  assert.equal(database.sqlite.prepare("SELECT count FROM error_counts WHERE kind = 'email'").get().count, 1);
});
