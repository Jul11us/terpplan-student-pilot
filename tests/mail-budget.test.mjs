import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { registerHooks } from "node:module";
import { testDatabase } from "./helpers/d1-sqlite.mjs";

globalThis.__mailEnv = { EMAIL_AUTH_SECRET: "fixture-secret", RESEND_API_KEY: "fixture-key", EMAIL_FROM: "Fixture <fixture@example.test>" };
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export const env = globalThis.__mailEnv;", shortCircuit: true };
  return next(specifier, context);
} });
const mail = await import("../lib/mail-budget.ts");
const { POST: login } = await import("../app/api/auth/request-code/route.ts");
const { POST: feedback } = await import("../app/api/feedback/route.ts");
const { sendPendingAlerts } = await import("../lib/alerts.ts");
const { getDb } = await import("../db/index.ts");
const { adminStats } = await import("../lib/admin.ts");
let database, originalFetch, originalNow, now, calls;
const payload = { from: "fixture@example.test", to: ["student@example.test"], subject: "Fixture", text: "Fixture body" };
const state = () => database.sqlite.prepare("SELECT * FROM mail_budget").get();
const request = (path, body) => new Request(`https://terpplan.test${path}`, { method: "POST", headers: { origin: "https://terpplan.test", "content-type": "application/json" }, body: JSON.stringify(body) });
const seedCount = (dayRequests, monthRequests = dayRequests) => database.sqlite.prepare("UPDATE mail_budget SET day = ?, month = ?, day_requests = ?, month_requests = ?")
  .run(new Date(now).toISOString().slice(0, 10), new Date(now).toISOString().slice(0, 7), dayRequests, monthRequests);
const watch = (i) => {
  database.sqlite.prepare("INSERT INTO watches (user_id, course_id, course_title, term, section_id, open_seats, alert_pending_at) VALUES (?, 'TEST100', 'Fixture', '202701', ?, 1, ?)")
    .run(`user:${i}`, `TEST100-${i}`, new Date(now).toISOString());
  database.sqlite.prepare("INSERT INTO alert_subscriptions (user_id, email, unsubscribe_token_hash) VALUES (?, ?, ?)")
    .run(`user:${i}`, `student${i}@example.test`, `token:${i}`);
};
beforeEach(() => {
  database = testDatabase(); globalThis.__mailEnv.DB = database;
  calls = []; originalFetch = globalThis.fetch; originalNow = Date.now; now = Date.now(); Date.now = () => now;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), ...init }); return Response.json({ id: "fixture" }); };
});
afterEach(() => { globalThis.fetch = originalFetch; Date.now = originalNow; database.sqlite.close(); });

test("concurrent shared reservations stop at 90, leaving 20 daily slots for login", async () => {
  const alerts = await Promise.all(Array.from({ length: 100 }, () => mail.reserveMail("alert", now)));
  assert.equal(alerts.filter(Boolean).length, 70);
  assert.equal(await mail.reserveMail("feedback", now), false);
  const logins = await Promise.all(Array.from({ length: 30 }, () => mail.reserveMail("login", now)));
  assert.equal(logins.filter(Boolean).length, 20);
  assert.equal(state().day_requests, 90);
  assert.equal(state().month_requests, 90);
});

test("UTC day rollover keeps the month cap; month rollover resets both counters", async () => {
  now = Date.parse("2026-10-08T23:59:00Z"); seedCount(90, 2599);
  assert.equal(await mail.reserveMail("login", now), false);
  assert.equal(await mail.reserveMail("login", now + 120_000), true);
  assert.equal(state().day_requests, 1); assert.equal(state().month_requests, 2600);
  assert.equal(await mail.reserveMail("login", now + 240_000), false);
  assert.equal(await mail.reserveMail("login", Date.parse("2026-11-01T00:00:00Z")), true);
  assert.equal(state().day_requests, 1); assert.equal(state().month_requests, 1);
});

test("accepted messages are not resent; concurrent calls for one key make one provider request", async () => {
  const answers = await Promise.all([mail.sendBudgetedMail("alert", payload, "fixture-one"), mail.sendBudgetedMail("alert", payload, "fixture-one")]);
  assert.ok(answers.includes("accepted")); assert.equal(calls.length, 1);
  assert.equal(await mail.sendBudgetedMail("alert", payload, "fixture-one"), "accepted");
  assert.equal(calls.length, 1);
});

test("timeouts retry in later runs with identical body and key, and stop after three attempts", async () => {
  globalThis.fetch = async (url, init) => { calls.push(init); throw new Error("fixture timeout"); };
  assert.equal(await mail.sendBudgetedMail("alert", payload, "fixture-retry"), "failed");
  assert.equal(await mail.sendBudgetedMail("alert", payload, "fixture-retry"), "deferred");
  now += 120_000;
  assert.equal(await mail.sendBudgetedMail("alert", { ...payload, text: "changed" }, "fixture-retry"), "failed");
  now += 120_000;
  assert.equal(await mail.sendBudgetedMail("alert", payload, "fixture-retry"), "failed");
  now += 120_000;
  assert.equal(await mail.sendBudgetedMail("alert", payload, "fixture-retry"), "exhausted");
  assert.equal(calls.length, 3); assert.equal(state().failed, 3); assert.equal(state().day_requests, 3);
  assert.ok(calls.every((call) => call.body === JSON.stringify(payload) && call.headers["Idempotency-Key"] === "fixture-retry"));
});

test("actual alert, feedback and login paths share the gate; feedback stays stored and login reserves are usable", async () => {
  seedCount(69); watch(1);
  assert.equal((await sendPendingAlerts(getDb())).emailsSent, 1);
  assert.equal((await feedback(request("/api/feedback", { kind: "idea", message: "Fixture feedback", page: "/", language: "en" }))).status, 200);
  assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS n FROM feedback").get().n, 1);
  assert.equal(calls.length, 1, "feedback cannot use the login reserve");
  assert.equal((await login(request("/api/auth/request-code", { email: "first@example.test" }))).status, 200);
  assert.equal(state().day_requests, 71); assert.equal(calls.length, 2);
  seedCount(90);
  const denied = await login(request("/api/auth/request-code", { email: "second@example.test" }));
  assert.equal(denied.status, 429); assert.equal((await denied.json()).code, "mailQuota");
  assert.equal(calls.length, 2);
  assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS n FROM email_login_codes").get().n, 1, "denied code is removed");
});

test("quota pauses leave fresh seat alerts pending; exhausted retry does not loop forever", async () => {
  watch(1); seedCount(70);
  assert.equal((await sendPendingAlerts(getDb())).emailsDeferred, 1); assert.equal(calls.length, 0);
  assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS n FROM watches WHERE alert_pending_at IS NOT NULL").get().n, 1);
  seedCount(0); globalThis.fetch = async () => { calls.push({}); return new Response("", { status: 503 }); };
  for (let i = 0; i < 3; i++) { assert.equal((await sendPendingAlerts(getDb())).emailsFailed, 1); now += 120_000; }
  const last = await sendPendingAlerts(getDb());
  assert.equal(last.alertsDropped, 1); assert.equal(calls.length, 3);
});

test("missing safety storage and the persisted email pause never send to the provider", async () => {
  database.sqlite.prepare("UPDATE mail_budget SET enabled = 0").run();
  assert.equal(await mail.sendBudgetedMail("login", payload, "paused"), "quota");
  database.sqlite.exec("DROP TABLE mail_budget");
  await assert.rejects(mail.sendBudgetedMail("login", payload, "missing")); assert.equal(calls.length, 0);
});

test("owner monitoring distinguishes recent failed runs from successful checks and counts more than 200 runs", async () => {
  seedCount(65, 2300);
  const insert = database.sqlite.prepare("INSERT INTO background_runs (started_at, duration_ms, ok) VALUES (?, 50, ?)");
  for (let i = 0; i < 300; i++) insert.run(new Date(now - i * 120_000).toISOString(), i === 0 ? 0 : 1);
  const stats = await adminStats(new Date(now));
  assert.equal(stats.backgroundRuns.last24h, 300);
  assert.equal(stats.backgroundRuns.recent[0].ok, false);
  assert.equal(stats.backgroundRuns.lastSuccessAt, new Date(now - 120_000).toISOString());
  assert.equal(stats.mailBudget.nearLimit, true); assert.equal(stats.mailBudget.month, 2300);
  assert.equal((await adminStats(new Date(now + 86_400_000))).mailBudget.today, 0);
});
