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
const { decideSync, parseSyncState, syncStateEmpty, syncStateForAccount } = await import("../lib/plan-sync.ts");

const plan = (...ids) => ({ saved: { term: "202701", plans: { 202701: ids.map((courseId) => ({ courseId, courseTitle: courseId })) }, preferences: { excludedDays: [], earliestStart: "", windowStart: "", windowEnd: "", strictTime: false, openSeatsOnly: false, includeFreshmanConnection: false, busyBlocks: [{ id: "job", days: ["Tue"], start: "13:00", end: "16:00", label: "Campus job" }], bufferMinutes: 0 } }, taken: { completed: ["MATH140"], inProgress: [], source: "manual", updatedAt: "" }, reminders: { "Spring 2027": { date: "2026-11-02", time: "08:30" } } });
const state = (...ids) => parseSyncState(plan(...ids));

test("which side wins: newer changes upload or download, both changed asks the student", () => {
  const local = state("MATH141"), other = state("CMSC132"), empty = parseSyncState({ saved: { plans: {} } });
  assert.ok(syncStateEmpty(empty));
  assert.equal(decideSync({ local, server: null, lastSynced: null, localChanged: true }), "askUpload", "a plan this account never had on this device: ask first");
  assert.equal(decideSync({ local, server: null, lastSynced: "2026-10-01T10:00:00.000Z", localChanged: true }), "upload", "already this account's plan");
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

test("the question shows the term's courses and how many commitments each copy has", async () => {
  const { planSummary, PERSONAL_KEYS } = await import("../lib/plan-sync.ts");
  assert.deepEqual(planSummary(state("MATH141", "CMSC132")), { term: "202701", courses: ["MATH141", "CMSC132"], commitments: 1, weeks: [] });
  assert.deepEqual(planSummary(parseSyncState({ saved: { plans: {} } })), { term: "", courses: [], commitments: 0, weeks: [] });
  // "Sign out and clear" removes every key that holds the student's own planner data.
  for (const key of ["terpplan:v1", "terpplan:taken", "terpplan:registration-time", "terpplan:registration-day", "terpplan:my-week", "terpplan:sync-meta"]) assert.ok(PERSONAL_KEYS.includes(key), key);
});

test("the Gen Ed needs picked in the finder travel with the account, and bad values are dropped", () => {
  const withGenEd = (genEd) => parseSyncState({ ...plan("MATH141"), saved: { ...plan("MATH141").saved, genEd } }).saved.genEd;
  assert.deepEqual(withGenEd({ codes: ["SCIS", "DVUP", "DVCC"], counts: { SCIS: 2 }, diversity: "none", optimizing: true }),
    { codes: ["SCIS", "DVUP", "DVCC"], counts: { SCIS: 2 }, diversity: "none", optimizing: true });
  assert.deepEqual(withGenEd({ codes: ["XXXX", "DSHU", "DSHU"], counts: { DSHU: 3, XXXX: 2 }, diversity: "maybe" }), { codes: ["DSHU"], counts: {} });
  assert.equal(withGenEd({ codes: [] }), undefined);
  assert.equal(withGenEd(undefined), undefined);
  assert.equal("genEd" in state("MATH141").saved, false, "nothing saved, nothing added");
});

test("Gen Ed needs sync before any course is added, and are not silently replaced by the account", () => {
  const local = parseSyncState({ saved: { plans: {}, genEd: { codes: ["SCIS"], counts: { SCIS: 2 }, optimizing: true } } });
  assert.equal(syncStateEmpty(local), false);
  assert.equal(decideSync({ local, server: null, lastSynced: null, localChanged: true }), "askUpload", "ask before saving a new device's needs to an empty account");
  assert.equal(decideSync({ local, server: null, lastSynced: "2026-10-01T10:00:00.000Z", localChanged: true }), "upload", "upload changes to the same account even without plan courses");
  const server = { state: state("CMSC132"), updatedAt: "2026-10-08T12:00:00.000Z" };
  assert.equal(decideSync({ local, server, lastSynced: null, localChanged: true }), "conflict", "preserve the choice when the account has a different copy");
  const empty = parseSyncState({ saved: { plans: {}, genEd: { codes: [] } } });
  assert.equal(syncStateEmpty(empty), true);
  assert.equal(decideSync({ local: empty, server: null, lastSynced: null, localChanged: true }), "inSync", "a cleared selection stays empty");
});

const week = (term) => ({ term, termName: term, savedAt: "2026-10-01T10:00:00.000Z", unscheduled: [], classes: [{ courseId: "CMSC216", courseTitle: "Introduction to Computer Systems", sectionId: "CMSC216-0101", kind: null, days: ["Tue", "Thu"], start: 660, end: 735, building: "ESJ", room: "0202" }] });

test("My week travels with the account, term by term; a page from before that keeps the account's weeks", async () => {
  const withWeeks = { ...plan("MATH141"), weeks: { 202608: week("202608"), 202701: week("202701") } };
  assert.equal((await PUT(request("PUT", { state: withWeeks, updatedAt: "2026-10-01T10:00:00.000Z" }))).status, 200);
  assert.deepEqual(Object.keys((await (await GET(request("GET"))).json()).state.weeks).sort(), ["202608", "202701"]);
  // An open tab from before this change saves its plan without weeks.
  assert.equal((await PUT(request("PUT", { state: plan("CMSC132"), updatedAt: "2026-10-01T11:00:00.000Z" }))).status, 200);
  const stored = (await (await GET(request("GET"))).json()).state;
  assert.equal(stored.saved.plans["202701"][0].courseId, "CMSC132");
  assert.deepEqual(Object.keys(stored.weeks).sort(), ["202608", "202701"], "the weeks stay");
  // A device that clears its weeks sends an empty list, which is kept as such.
  assert.equal((await PUT(request("PUT", { state: { ...plan("CMSC132"), weeks: {} }, updatedAt: "2026-10-01T12:00:00.000Z" }))).status, 200);
  assert.deepEqual((await (await GET(request("GET"))).json()).state.weeks, {});
});

test("weeks count as data on a device, and no weeks equals weeks left out", () => {
  const onlyWeek = parseSyncState({ saved: { plans: {} }, weeks: { 202608: week("202608") } });
  assert.equal(syncStateEmpty(onlyWeek), false);
  assert.equal(decideSync({ local: onlyWeek, server: null, lastSynced: null, localChanged: true }), "askUpload");
  const server = { state: state("MATH141"), updatedAt: "2026-10-01T10:00:00.000Z" };
  assert.equal(decideSync({ local: parseSyncState({ ...plan("MATH141"), weeks: {} }), server, lastSynced: null, localChanged: true }), "inSync", "an old copy without weeks matches a device with none");
  assert.equal("weeks" in parseSyncState(plan("MATH141")), false, "left out stays left out");
});

test("adopting a legacy account copy keeps only weeks known to belong to that account", () => {
  const deviceWeeks = { 202608: week("202608") };
  const legacy = state("MATH141");
  const adoptedWeeks = (copy, previousAccount, account) => syncStateForAccount(copy, previousAccount, account).weeks ?? deviceWeeks;
  assert.deepEqual(adoptedWeeks(legacy, "account-a", "account-a"), deviceWeeks, "a returning student's own legacy week stays on this device");
  assert.deepEqual(adoptedWeeks(legacy, "account-a", "account-b"), {}, "choosing account B must clear account A's week before the next upload");
  assert.deepEqual(adoptedWeeks(legacy, undefined, "account-b"), {}, "an unowned device week is not silently attached to the chosen account");
  const accountWeeks = { 202701: week("202701") };
  assert.deepEqual(adoptedWeeks({ ...legacy, weeks: accountWeeks }, "account-a", "account-b"), accountWeeks, "an account's explicit week replaces the previous student's");
  assert.deepEqual(adoptedWeeks({ ...legacy, weeks: {} }, "account-a", "account-a"), {}, "an explicitly cleared account copy clears this device too");
});

test("an in-flight legacy save preserves a week another device saved in the meantime", { timeout: 5000 }, async () => {
  await PUT(request("PUT", { state: { ...plan("MATH141"), weeks: { 202608: week("202608") } }, updatedAt: "2026-10-01T10:00:00.000Z" }));
  let release, entered, held = false;
  const barrier = new Promise((resolve) => { release = resolve; });
  const paused = new Promise((resolve) => { entered = resolve; });
  const hold = async () => { held = true; entered(); await barrier; };
  globalThis.__syncEnv.DB = { ...database, prepare(query) {
    const decorate = (statement) => ({ ...statement,
      bind(...values) { return decorate(statement.bind(...values)); },
      async first(...args) {
        const row = await statement.first(...args);
        // The previous implementation read weeks before its write. Hold that stale read if present;
        // an atomic implementation instead pauses just before executing its single upsert below.
        if (!held && /^SELECT state, updated_at/.test(query)) await hold();
        return row;
      },
      async run(...args) {
        if (!held && /^INSERT INTO plan_sync/.test(query)) await hold();
        return statement.run(...args);
      },
    });
    return decorate(database.prepare(query));
  } };
  const legacySave = PUT(request("PUT", { state: plan("CMSC132"), updatedAt: "2026-10-01T12:00:00.000Z" }));
  try {
    await paused;
    assert.equal((await PUT(request("PUT", { state: { ...plan("MATH141"), weeks: { 202701: week("202701") } }, updatedAt: "2026-10-01T11:00:00.000Z" }))).status, 200);
  } finally {
    release();
  }
  assert.equal((await legacySave).status, 200);
  const stored = (await (await GET(request("GET"))).json()).state;
  assert.equal(stored.saved.plans["202701"][0].courseId, "CMSC132", "the newer legacy plan is saved");
  assert.deepEqual(Object.keys(stored.weeks), ["202701"], "the intervening week's update is preserved atomically");
});

test("preserving weeks cannot grow a legacy save beyond the sync limit", async () => {
  const largeWeek = week("202608");
  largeWeek.classes[0].courseTitle = "w".repeat(40_000);
  assert.equal((await PUT(request("PUT", { state: { ...plan("MATH141"), weeks: { 202608: largeWeek } }, updatedAt: "2026-10-01T10:00:00.000Z" }))).status, 200);
  const largePlan = plan("CMSC132");
  largePlan.saved.plans["202701"][0].courseTitle = "p".repeat(30_000);
  assert.equal((await PUT(request("PUT", { state: largePlan, updatedAt: "2026-10-01T11:00:00.000Z" }))).status, 413);
  const stored = (await (await GET(request("GET"))).json()).state;
  assert.equal(stored.saved.plans["202701"][0].courseId, "MATH141", "a rejected merge leaves the stored plan intact");
  assert.equal(stored.weeks["202608"].classes[0].courseTitle.length, 40_000);
});
