import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { testDatabase } from "./helpers/d1-sqlite.mjs";

globalThis.__syncEnv = { EMAIL_AUTH_SECRET: "test-only-signing-secret-never-deploy" };
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export const env = globalThis.__syncEnv;", shortCircuit: true };
  return next(specifier, context);
} });
const { GET, PUT, DELETE } = await import("../app/api/sync/route.ts");
const { createEmailSession, hashEmail } = await import("../lib/auth.ts");
const { decideSync, parseSyncState, syncStateEmpty } = await import("../lib/plan-sync.ts");

const plan = (...ids) => ({ saved: { term: "202701", plans: { 202701: ids.map((courseId) => ({ courseId, courseTitle: courseId })) }, preferences: { excludedDays: [], earliestStart: "", windowStart: "", windowEnd: "", strictTime: false, openSeatsOnly: false, includeFreshmanConnection: false, busyBlocks: [{ id: "job", days: ["Tue"], start: "13:00", end: "16:00", label: "Campus job" }], bufferMinutes: 0 } }, taken: { completed: ["MATH140"], inProgress: [], source: "manual", updatedAt: "" }, reminders: { "Spring 2027": { date: "2026-11-02", time: "08:30" } } });
const state = (...ids) => parseSyncState(plan(...ids));

test("which side wins: newer changes upload or download, both changed asks the student", () => {
  const local = state("MATH141"), other = state("CMSC132"), empty = parseSyncState({ saved: { plans: {} } });
  assert.ok(syncStateEmpty(empty));
  assert.equal(decideSync({ local, server: null, lastSynced: null, localChanged: true }), "upload");
  assert.equal(decideSync({ local: empty, server: null, lastSynced: null, localChanged: false }), "inSync");
  assert.equal(decideSync({ local, server: { state: local, updatedAt: "2026-10-01T10:00:00.000Z" }, lastSynced: null, localChanged: true }), "inSync", "same content");
  const server = { state: other, updatedAt: "2026-10-08T12:00:00.000Z" };
  assert.equal(decideSync({ local, server, lastSynced: "2026-10-08T12:00:00.000Z", localChanged: true }), "upload", "only this device changed");
  assert.equal(decideSync({ local, server, lastSynced: "2026-10-08T11:00:00.000Z", localChanged: false }), "download", "only the account changed");
  assert.equal(decideSync({ local, server, lastSynced: "2026-10-08T11:00:00.000Z", localChanged: true }), "conflict", "both changed");
  assert.equal(decideSync({ local, server, lastSynced: null, localChanged: true }), "conflict", "a new device with its own plan");
  assert.equal(decideSync({ local: empty, server, lastSynced: null, localChanged: true }), "download", "a new device with nothing yet");
});

let database, cookie;
const request = (method, body, headers = {}) => new Request("https://terpplan.test/api/sync", { method, headers: { cookie, origin: "https://terpplan.test", ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });

beforeEach(async () => {
  database = testDatabase(); globalThis.__syncEnv.DB = database;
  cookie = `terpplan_email_session=${await createEmailSession(await hashEmail("student@example.test"))}`;
});
afterEach(() => { database.sqlite.close(); delete globalThis.__syncEnv.DB; });

test("the account keeps the newer copy, with commitment names, taken courses and registration times", async () => {
  assert.equal((await GET(request("GET"))).status, 200);
  assert.equal((await (await GET(request("GET"))).json()).state, null);
  assert.equal((await PUT(request("PUT", { state: plan("MATH141"), updatedAt: "2026-10-01T10:00:00.000Z" }))).status, 200);
  const older = await PUT(request("PUT", { state: plan("CMSC132"), updatedAt: "2026-10-01T09:00:00.000Z" }));
  assert.equal(older.status, 409, "an older copy does not replace a newer one");
  assert.equal((await older.json()).state.saved.plans["202701"][0].courseId, "MATH141");
  assert.equal((await PUT(request("PUT", { state: plan("CMSC132"), updatedAt: "2026-10-01T09:00:00.000Z", force: true }))).status, 200, "unless the student chose it");
  const stored = await (await GET(request("GET"))).json();
  assert.equal(stored.saved, undefined);
  assert.equal(stored.state.saved.plans["202701"][0].courseId, "CMSC132");
  assert.equal(stored.state.saved.preferences.busyBlocks[0].label, "Campus job");
  assert.deepEqual(stored.state.taken.completed, ["MATH140"]);
  assert.deepEqual(stored.state.reminders["Spring 2027"], { date: "2026-11-02", time: "08:30" });
  assert.match(stored.account, /^[a-f0-9]{16}$/);
});

test("signed-out visitors, other sites, bad data and future clocks are handled", async () => {
  assert.equal((await GET(request("GET", null, { cookie: "" }))).status, 401);
  assert.equal((await PUT(request("PUT", { state: plan("MATH141"), updatedAt: "2026-10-01T10:00:00.000Z" }, { origin: "https://evil.test" }))).status, 403);
  assert.equal((await PUT(request("PUT", { state: plan("MATH141"), updatedAt: "yesterday" }))).status, 400);
  const future = await PUT(request("PUT", { state: plan("MATH141"), updatedAt: "2099-01-01T00:00:00.000Z" }));
  assert.ok(Date.parse((await future.json()).updatedAt) < Date.now() + 120_000, "a clock far ahead is capped");
  const huge = plan("MATH141"); huge.saved.preferences.busyBlocks[0].label = "x".repeat(80);
  assert.equal((await PUT(request("PUT", { state: huge, updatedAt: new Date().toISOString(), force: true }))).status, 200);
});

test("deleting removes the account's copy", async () => {
  await PUT(request("PUT", { state: plan("MATH141"), updatedAt: "2026-10-01T10:00:00.000Z" }));
  assert.equal((await DELETE(request("DELETE"))).status, 200);
  assert.equal((await (await GET(request("GET"))).json()).state, null);
  assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS n FROM plan_sync").get().n, 0);
});
