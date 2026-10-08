import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { registerHooks } from "node:module";
import { testDatabase } from "./helpers/d1-sqlite.mjs";

globalThis.__budgetEnv = {
  WATCH_RUNNER_SECRET: "test-only-budget-secret",
  EMAIL_AUTH_SECRET: "test-only-signing-secret",
  RESEND_API_KEY: "test-only-mail-key",
  EMAIL_FROM: "Fixture <fixture@example.test>",
};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export const env = globalThis.__budgetEnv;", shortCircuit: true };
  return next(specifier, context);
} });
const budget = await import("../lib/background-budget.ts");
const { POST: run } = await import("../app/api/watches/run/route.ts");
const { getDb } = await import("../db/index.ts");
const { sendPendingAlerts, removeExpiredWatches } = await import("../lib/alerts.ts");

let database, originalFetch, originalNow, now, calls;
const state = () => database.sqlite.prepare("SELECT * FROM background_budget").get();
const request = () => new Request("https://terpplan.test/api/watches/run", {
  method: "POST", headers: { authorization: `Bearer ${globalThis.__budgetEnv.WATCH_RUNNER_SECRET}` },
});
const watch = (i, { pending = false, expired = false, course = `TEST${100 + i}` } = {}) => {
  database.sqlite.prepare(`INSERT INTO watches (user_id, course_id, course_title, term, section_id, open_seats, alert_pending_at, created_at)
    VALUES (?, ?, 'Fixture', '202701', ?, 1, ?, ?)`).run(`user:${i}`, course, `${course}-${i}`, pending ? new Date(now).toISOString() : null, expired ? "2025-01-01 00:00:00" : new Date(now).toISOString());
};
beforeEach(() => {
  database = testDatabase();
  globalThis.__budgetEnv.DB = database;
  delete globalThis.__budgetEnv.WATCH_RUNNER_ENABLED;
  calls = [];
  now = Date.parse("2026-10-08T00:00:00Z");
  originalNow = Date.now;
  Date.now = () => now;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    // Skip optional trend tracking in API tests, to count seat-check traffic alone.
    now += 21_000;
    return String(input).includes("api.resend.com") ? Response.json({ id: "fixture" }) : new Response("");
  };
});
afterEach(() => { Date.now = originalNow; globalThis.fetch = originalFetch; database.sqlite.close(); });

test("concurrent callers reserve one persistent allowance, and cooldown survives release", async () => {
  const tokens = await Promise.all([budget.reserveBackgroundRun(now), budget.reserveBackgroundRun(now)]);
  assert.equal(tokens.filter(Boolean).length, 1);
  assert.equal(state().runs, 1);
  await budget.releaseBackgroundRun(tokens.find(Boolean));
  assert.equal(await budget.reserveBackgroundRun(now + budget.MIN_RUN_INTERVAL_MS - 1), null);
  assert.ok(await budget.reserveBackgroundRun(now + budget.MIN_RUN_INTERVAL_MS));
  assert.equal(state().runs, 2);
});

test("720 starts consume a day's allowance, and the next UTC day resets only the daily allowance", async () => {
  for (let i = 0; i < budget.MAX_RUNS_PER_DAY; i++) {
    const token = await budget.reserveBackgroundRun(now + i * budget.MIN_RUN_INTERVAL_MS);
    assert.ok(token);
    await budget.releaseBackgroundRun(token);
  }
  assert.equal(await budget.reserveBackgroundRun(now + budget.MAX_RUNS_PER_DAY * budget.MIN_RUN_INTERVAL_MS), null);
  assert.equal(state().runs, budget.MAX_RUNS_PER_DAY);
  const tomorrow = now + 86_400_000;
  const token = await budget.reserveBackgroundRun(tomorrow - 60_000);
  assert.equal(token, null, "same UTC day remains exhausted");
  assert.ok(await budget.reserveBackgroundRun(tomorrow));
  assert.equal(state().runs, 1);
  assert.equal(await budget.reserveBackgroundRun(tomorrow + 1), null);
});

test("day rollover cannot bypass cooldown or an existing lease", async () => {
  const beforeMidnight = now + 86_400_000 - 1000;
  const token = await budget.reserveBackgroundRun(beforeMidnight);
  assert.equal(await budget.reserveBackgroundRun(beforeMidnight + 2000), null);
  await budget.releaseBackgroundRun(token);
  assert.equal(await budget.reserveBackgroundRun(beforeMidnight + 2000), null);
  assert.ok(await budget.reserveBackgroundRun(beforeMidnight + budget.MIN_RUN_INTERVAL_MS));
});

test("a crashed run recovers after lease and cooldown; its stale token cannot unlock a new run", async () => {
  const old = await budget.reserveBackgroundRun(now);
  assert.equal(await budget.reserveBackgroundRun(now + budget.MIN_RUN_INTERVAL_MS), null);
  const current = await budget.reserveBackgroundRun(now + 360_000);
  assert.ok(current);
  await budget.releaseBackgroundRun(old);
  assert.equal(state().lease_token, current);
  assert.equal(await budget.reserveBackgroundRun(now + 360_001), null);
});

test("emergency switches and exhausted allowance skip API work without upstream requests", async () => {
  globalThis.__budgetEnv.WATCH_RUNNER_ENABLED = "false";
  globalThis.__budgetEnv.DB = { prepare() { assert.fail("environment pause must not access D1"); } };
  assert.equal((await (await run(request())).json()).skipped, "disabled");
  globalThis.__budgetEnv.DB = database;
  delete globalThis.__budgetEnv.WATCH_RUNNER_ENABLED;
  database.sqlite.prepare("UPDATE background_budget SET enabled = 0").run();
  assert.equal((await (await run(request())).json()).skipped, "budget-or-lock");
  database.sqlite.prepare("UPDATE background_budget SET enabled = 1, day = ?, runs = 720").run(new Date(now).toISOString().slice(0, 10));
  assert.equal((await (await run(request())).json()).skipped, "budget-or-lock");
  assert.equal(calls.length, 0);
  assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS n FROM background_runs").get().n, 0);
});

test("missing safety migration fails closed before checks or mail", async () => {
  database.sqlite.exec("DROP TABLE background_budget");
  assert.equal((await run(request())).status, 503);
  assert.equal(calls.length, 0);
});

test("actual concurrent API calls do work once; a failed run also consumes its allowance", async () => {
  watch(1);
  const responses = await Promise.all([run(request()), run(request())]);
  const bodies = await Promise.all(responses.map((response) => response.json()));
  assert.equal(bodies.filter((body) => body.skipped).length, 1);
  assert.equal(state().runs, 1);
  assert.equal(calls.length, 1);
  assert.equal(state().lease_until, 0);
  now += budget.MIN_RUN_INTERVAL_MS;
  database.sqlite.exec("DROP TABLE email_login_codes");
  assert.equal((await run(request())).status, 503);
  assert.equal(state().runs, 2);
  assert.equal((await (await run(request())).json()).skipped, "budget-or-lock");
  assert.equal(state().runs, 2);
});

test("API limits the watch window and course batch, leaving older unchecked rows for later", async () => {
  for (let i = 0; i < 240; i++) watch(i);
  const first = await (await run(request())).json();
  assert.equal(first.watches, budget.MAX_WATCH_ROWS_PER_RUN);
  assert.equal(first.moreWatches, true);
  // The simulated clock exhausts the 40s seat budget before all courses are checked.
  assert.ok(first.checkedCourses <= budget.MAX_COURSES_PER_RUN);
  assert.ok(first.deferredToNextRun > 0);
  const checked = database.sqlite.prepare("SELECT COUNT(*) AS n FROM watches WHERE last_checked_at IS NOT NULL").get().n;
  assert.equal(checked, first.checkedCourses);
  now += budget.MIN_RUN_INTERVAL_MS;
  await run(request());
  assert.ok(database.sqlite.prepare("SELECT COUNT(*) AS n FROM watches WHERE last_checked_at IS NOT NULL").get().n > checked);
});

test("a fast upstream still cannot exceed the per-run course cap", async () => {
  globalThis.fetch = async (input) => { calls.push(String(input)); return new Response(""); };
  for (let i = 0; i < 240; i++) watch(i);
  const body = await (await run(request())).json();
  assert.equal(body.checkedCourses, budget.MAX_COURSES_PER_RUN);
  assert.equal(body.deferredToNextRun, budget.MAX_WATCH_ROWS_PER_RUN - budget.MAX_COURSES_PER_RUN);
  assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS n FROM watches WHERE last_checked_at IS NOT NULL").get().n, budget.MAX_COURSES_PER_RUN);
});

test("pending emails have a global per-run cap; remaining alerts wait, and deadline stops new sends", async () => {
  globalThis.fetch = async (input) => { calls.push(String(input)); return Response.json({ id: "fixture" }); };
  for (let i = 0; i < 25; i++) {
    watch(i, { pending: true });
    database.sqlite.prepare("INSERT INTO alert_subscriptions (user_id, email, unsubscribe_token_hash) VALUES (?, ?, ?)")
      .run(`user:${i}`, `fixture${i}@example.test`, `token:${i}`);
  }
  const summary = await sendPendingAlerts(getDb(), now + 60_000);
  assert.equal(summary.emailsSent, budget.MAX_EMAILS_PER_RUN);
  assert.equal(calls.length, budget.MAX_EMAILS_PER_RUN);
  assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS n FROM watches WHERE alert_pending_at IS NOT NULL").get().n, 5);
  assert.equal((await sendPendingAlerts(getDb(), now - 1)).emailsSent, 0);
  assert.equal(calls.length, budget.MAX_EMAILS_PER_RUN);
});

test("expired-watch and abuse-key cleanup is bounded and advances on later runs", async () => {
  for (let i = 0; i < 510; i++) watch(i, { expired: true });
  assert.equal(await removeExpiredWatches(getDb()), budget.MAX_CLEANUP_ROWS_PER_RUN);
  assert.equal(await removeExpiredWatches(getDb()), 10);
  const old = Math.floor(now / 1000) - 90_000;
  for (let i = 0; i < 510; i++) database.sqlite.prepare("INSERT INTO email_login_rate_limits VALUES (?, ?, 1)").run(`old:${i}`, old);
  await run(request());
  assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS n FROM email_login_rate_limits").get().n, 10);
});

test("bounded recurring queries use indexes rather than temporary sorting scans", () => {
  for (const [query, index] of [
    ["SELECT * FROM watches WHERE last_checked_at IS NULL OR last_checked_at < '2026' ORDER BY last_checked_at LIMIT 201", "watches_last_checked"],
    ["SELECT * FROM watches WHERE alert_pending_at IS NOT NULL ORDER BY alert_pending_at LIMIT 200", "watches_pending_alert"],
    ["SELECT rowid FROM watches WHERE created_at < '2026' ORDER BY created_at LIMIT 500", "watches_created"],
  ]) {
    const plan = database.sqlite.prepare(`EXPLAIN QUERY PLAN ${query}`).all().map((row) => row.detail).join("\n");
    assert.ok(plan.includes(index), plan);
    assert.ok(!plan.includes("TEMP B-TREE"), plan);
  }
});
