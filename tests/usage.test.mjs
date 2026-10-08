import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { registerHooks } from "node:module";
import { testDatabase } from "./helpers/d1-sqlite.mjs";

globalThis.__usageEnv = { EMAIL_AUTH_SECRET: "test-only-signing-secret-never-deploy", ADMIN_EMAILS: "owner@example.test" };
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export const env = globalThis.__usageEnv;", shortCircuit: true };
  return next(specifier, context);
} });
const { POST: usage } = await import("../app/api/usage/route.ts");
const { adminStats } = await import("../lib/admin.ts");
const { easternDay } = await import("../lib/referral.ts");
const { FEATURES, validFeature } = await import("../lib/usage.ts");

let database;
const post = (body, headers = {}) => new Request("https://terpplan.test/api/usage", { method: "POST", headers: { "content-type": "application/json", origin: "https://terpplan.test", "cf-connecting-ip": "203.0.113.7", "user-agent": "phone", ...headers }, body: JSON.stringify(body) });
const rows = () => database.sqlite.prepare("SELECT day, feature, people FROM feature_usage ORDER BY feature").all().map((row) => [row.day, row.feature, row.people]);

beforeEach(() => { database = testDatabase(); globalThis.__usageEnv.DB = database; });
afterEach(() => { database.sqlite.close(); delete globalThis.__usageEnv.DB; });

test("only the listed features are counted", () => {
  for (const feature of FEATURES) assert.ok(validFeature(feature));
  for (const bad of ["", "Planner", "planner ", "admin", 1, null, undefined]) assert.ok(!validFeature(bad), String(bad));
});

test("each person counts once a day per feature, and only the count is stored", async () => {
  assert.equal((await (await usage(post({ feature: "planner" }))).json()).counted, true);
  assert.equal((await (await usage(post({ feature: "planner" }))).json()).counted, false, "the same browser again");
  await usage(post({ feature: "planner" }, { "cf-connecting-ip": "203.0.113.8" }));
  await usage(post({ feature: "planner" }, { "user-agent": "laptop" }));
  await usage(post({ feature: "alert" }));
  assert.deepEqual(rows(), [[easternDay(), "alert", 1], [easternDay(), "planner", 3]]);
  assert.deepEqual(database.sqlite.prepare("PRAGMA table_info(feature_usage)").all().map((column) => column.name), ["day", "feature", "people"]);
});

test("unknown features, other sites and floods are not counted", async () => {
  assert.equal((await usage(post({ feature: "steal" }))).status, 400);
  assert.equal((await usage(post({ feature: "planner" }, { origin: "https://evil.test" }))).status, 403);
  for (let index = 0; index < 40; index += 1) await usage(post({ feature: FEATURES[index % FEATURES.length] }, { "user-agent": `agent-${index}` }));
  assert.equal((await usage(post({ feature: "planner" }, { "user-agent": "one-more" }))).status, 429);
});

test("the owner page lists every feature in order, with today, 7 and 30 days", async () => {
  const insert = database.sqlite.prepare("INSERT INTO feature_usage VALUES (?, ?, ?)");
  const day = (daysAgo) => easternDay(new Date(Date.now() - daysAgo * 86_400_000));
  insert.run(day(0), "planner", 5); insert.run(day(3), "planner", 7); insert.run(day(20), "planner", 9); insert.run(day(45), "planner", 100);
  insert.run(day(0), "alert", 1);
  const stats = await adminStats();
  assert.deepEqual(stats.usage.map((row) => row.feature), [...FEATURES]);
  assert.deepEqual(stats.usage.find((row) => row.feature === "planner"), { feature: "planner", today: 5, last7Days: 12, last30Days: 21 });
  assert.deepEqual(stats.usage.find((row) => row.feature === "share"), { feature: "share", today: 0, last7Days: 0, last30Days: 0 });
  assert.equal(stats.usageSince, day(45));
});

test("the owner page shows how fast courses filled and what moved in the last day", async () => {
  const fill = database.sqlite.prepare("INSERT INTO course_fill VALUES ('202701', ?, ?, ?, ?, ?, ?)");
  const at = (hoursAgo) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
  fill.run("SLOW100", 10, 100, at(50), at(2), at(1));
  fill.run("FAST100", 0, 80, at(10), at(7), at(1));
  fill.run("SMALL10", 0, 20, at(10), at(9), at(1));
  fill.run("EARLY10", 60, 60, null, at(30), at(1));
  fill.run("OPEN100", 5, 100, null, null, at(1));
  fill.run("NONE100", 0, 0, null, null, at(1));
  const reading = database.sqlite.prepare("INSERT INTO course_seat_history VALUES ('202701', ?, ?, 1, ?, ?, 0)");
  reading.run("OPEN100", at(20), 100, 95); reading.run("OPEN100", at(1), 100, 70); reading.run("OPEN100", at(30), 100, 99);
  reading.run("SLOW100", at(5), 100, 4); reading.run("SLOW100", at(2), 100, 1);
  const { seatRace } = await adminStats();
  assert.equal(seatRace.courses, 5, "courses with no sections are left out");
  assert.equal(seatRace.filled, 4);
  assert.deepEqual(seatRace.fastest.map((row) => [row.courseId, row.hours]), [["FAST100", 3], ["SLOW100", 48]], "small and already-full courses are not ranked");
  assert.deepEqual(seatRace.movers.map((row) => [row.courseId, row.taken]), [["OPEN100", 25], ["SLOW100", 3]], "only readings from the last day");
  assert.equal(seatRace.readingsLast24h, 4);
});

test("the owner page shows the latest background runs and the longest gap in the last day", async () => {
  const insert = database.sqlite.prepare("INSERT INTO background_runs (started_at, duration_ms, ok, checked_courses, tracked_courses, emails_sent) VALUES (?, ?, ?, ?, ?, ?)");
  const start = Date.now();
  const at = (minutesAgo) => new Date(start - minutesAgo * 60_000).toISOString();
  insert.run(at(5), 1200, 1, 3, 40, 1);
  insert.run(at(15), 900, 0, 0, 0, 0);
  insert.run(at(215), 800, 1, 2, 75, 0);
  insert.run(at(2000), 800, 1, 2, 75, 0);
  const { backgroundRuns } = await adminStats();
  assert.equal(backgroundRuns.recent.length, 4);
  assert.deepEqual(backgroundRuns.recent[0], { startedAt: at(5), durationMs: 1200, ok: true, checkedCourses: 3, trackedCourses: 40, emailsSent: 1, failedCourses: 0, emailsFailed: 0, deferred: 0, emailsDeferred: 0 });
  assert.equal(backgroundRuns.recent[1].ok, false);
  assert.equal(backgroundRuns.last24h, 3);
  assert.equal(backgroundRuns.longestGapMinutes24h, 200);
});
