import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { registerHooks } from "node:module";
import { testDatabase } from "./helpers/d1-sqlite.mjs";

globalThis.__batchEnv = {};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export const env = globalThis.__batchEnv;", shortCircuit: true };
  return next(specifier, context);
} });
const { getDb } = await import("../db/index.ts");
const { checkWatchGroups, groupByCourse } = await import("../lib/seat-check.ts");

let database;
beforeEach(() => { database = testDatabase(); globalThis.__batchEnv.DB = database; });
afterEach(() => { database.sqlite.close(); delete globalThis.__batchEnv.DB; });

const watch = (courseId, number, openSeats, term = "202701", user = "email:a") => database.sqlite
  .prepare("INSERT INTO watches (user_id, course_id, course_title, term, section_id, open_seats) VALUES (?, ?, 'Course', ?, ?, ?)")
  .run(user, courseId, term, `${courseId}-${number}`, openSeats);
const groups = () => groupByCourse(database.sqlite.prepare("SELECT * FROM watches ORDER BY course_id").all().map((row) => ({
  userId: row.user_id, courseId: row.course_id, courseTitle: row.course_title, term: row.term, sectionId: row.section_id, meetings: row.meetings, instructors: row.instructors,
  seats: row.seats, openSeats: row.open_seats, waitlist: row.waitlist, status: row.status, lastCheckedAt: row.last_checked_at, lastSuccessAt: row.last_success_at,
  lastNotifiedOpen: row.last_notified_open, createdAt: row.created_at, alertPendingAt: row.alert_pending_at, alertSentAt: row.alert_sent_at, expiresAt: row.expires_at ?? null,
})));
const section = (courseId, number, open) => ({ section_id: `${courseId}-${number}`, number, seats: "30", open_seats: String(open), waitlist: "0" });
const rows = () => database.sqlite.prepare("SELECT section_id, open_seats, status, alert_pending_at IS NOT NULL AS pending FROM watches ORDER BY section_id").all().map((row) => [row.section_id, row.open_seats, row.status, row.pending]);

test("courses of the Testudo term are read 25 at a time, and an opening is queued for email", async () => {
  for (let index = 0; index < 30; index += 1) watch(`CMSC${String(100 + index)}`, "0101", 0, "202701", `email:${index}`);
  const calls = [];
  const readBatch = async (term, ids) => {
    calls.push(ids.length);
    return new Map(ids.map((id) => [id, [section(id, "0101", id === "CMSC105" ? 2 : 0)]]));
  };
  const results = await checkWatchGroups(getDb(), groups(), Infinity, readBatch);
  assert.deepEqual(calls, [25, 5], "two requests for 30 courses");
  assert.equal(results.length, 30);
  assert.ok(results.every((result) => result.ok));
  assert.deepEqual(results.flatMap((result) => result.openedFromFull.map((row) => row.sectionId)), ["CMSC105-0101"]);
  assert.deepEqual(rows().find((row) => row[0] === "CMSC105-0101"), ["CMSC105-0101", 2, "ok", 1]);
});

test("a failed batch read marks only that batch, and nothing new starts after the deadline", async () => {
  watch("MATH140", "0101", 0); watch("MATH141", "0101", 3);
  const failing = async () => { throw new Error("Testudo returned 503."); };
  const results = await checkWatchGroups(getDb(), groups(), Infinity, failing);
  assert.deepEqual(results.map((result) => result.ok), [false, false]);
  assert.deepEqual(rows().map((row) => row[2]), ["failed", "failed"], "never read successfully, so failed rather than stale");
  let called = false;
  assert.deepEqual(await checkWatchGroups(getDb(), groups(), Date.now() - 1, async () => { called = true; return new Map(); }), []);
  assert.equal(called, false);
});

test("a course missing from the batch page is marked failed like a course with no sections", async () => {
  watch("ENGL101", "0101", 0); watch("ENGL102", "0101", 0);
  const results = await checkWatchGroups(getDb(), groups(), Infinity, async (term, ids) => new Map([[ids[0], [section(ids[0], "0101", 0)]]]));
  assert.deepEqual(results.map((result) => result.ok), [true, true]);
  assert.deepEqual(rows().map((row) => [row[0], row[2]]), [["ENGL101-0101", "ok"], ["ENGL102-0101", "failed"]]);
});
