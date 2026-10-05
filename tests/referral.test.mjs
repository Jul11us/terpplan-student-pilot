import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { registerHooks } from "node:module";
import { testDatabase } from "./helpers/d1-sqlite.mjs";

globalThis.__referralEnv = { EMAIL_AUTH_SECRET: "test-only-signing-secret-never-deploy", ADMIN_EMAILS: "owner@example.test" };
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export const env = globalThis.__referralEnv;", shortCircuit: true };
  return next(specifier, context);
} });
const { POST: visit } = await import("../app/api/visit/route.ts");
const { adminStats } = await import("../lib/admin.ts");
const { easternDay, validRef } = await import("../lib/referral.ts");

let database;
const post = (body, headers = {}) => new Request("https://terpplan.test/api/visit", { method: "POST", headers: { "content-type": "application/json", origin: "https://terpplan.test", "cf-connecting-ip": "203.0.113.7", ...headers }, body: JSON.stringify(body) });
const rows = () => database.sqlite.prepare("SELECT day, ref, visits FROM referral_visits ORDER BY ref").all().map((row) => [row.day, row.ref, row.visits]);

beforeEach(() => { database = testDatabase(); globalThis.__referralEnv.DB = database; });
afterEach(() => { database.sqlite.close(); delete globalThis.__referralEnv.DB; });

test("tags are short lower-case words, and days are Eastern dates", () => {
  for (const ok of ["qr", "wechat", "poster-mckeldin", "a1"]) assert.ok(validRef(ok), ok);
  for (const bad of ["", "QR", "-qr", "qr code", "a".repeat(41), "qr<script>", 5, null]) assert.ok(!validRef(bad), String(bad));
  // 03:30 UTC on Oct 6 is still Oct 5 in Maryland.
  assert.equal(easternDay(new Date("2026-10-06T03:30:00Z")), "2026-10-05");
});

test("a tagged visit adds one to that tag's count for the day, and nothing else is stored", async () => {
  assert.equal((await visit(post({ ref: "qr" }))).status, 200);
  assert.equal((await visit(post({ ref: "qr" }))).status, 200);
  assert.equal((await visit(post({ ref: "wechat" }, { "cf-connecting-ip": "203.0.113.8" }))).status, 200);
  assert.deepEqual(rows(), [[easternDay(), "qr", 2], [easternDay(), "wechat", 1]]);
  const columns = database.sqlite.prepare("PRAGMA table_info(referral_visits)").all().map((column) => column.name);
  assert.deepEqual(columns, ["day", "ref", "visits"]);
});

test("bad tags, other sites and floods are not counted", async () => {
  assert.equal((await visit(post({ ref: "Bad Tag" }))).status, 400);
  assert.equal((await visit(post({ ref: "qr" }, { origin: "https://evil.test" }))).status, 403);
  for (let index = 0; index < 20; index += 1) assert.equal((await visit(post({ ref: "qr" }))).status, 200);
  assert.equal((await visit(post({ ref: "qr" }))).status, 429, "21st visit from one address within an hour");
  assert.deepEqual(rows(), [[easternDay(), "qr", 20]]);
});

test("the owner page totals each tag and lists the last 30 days", async () => {
  const now = new Date("2026-10-20T16:00:00Z");
  const insert = database.sqlite.prepare("INSERT INTO referral_visits (day, ref, visits) VALUES (?, ?, ?)");
  insert.run("2026-10-20", "qr", 4); insert.run("2026-10-16", "qr", 3); insert.run("2026-09-01", "qr", 10); insert.run("2026-10-19", "wechat", 2);
  const stats = await adminStats(now);
  assert.deepEqual(JSON.parse(JSON.stringify(stats.referrals)), [{ ref: "qr", total: 17, last7Days: 7, today: 4 }, { ref: "wechat", total: 2, last7Days: 2, today: 0 }]);
  assert.deepEqual(stats.referralsByDay.map((row) => [row.day, row.ref, row.visits]), [["2026-10-16", "qr", 3], ["2026-10-19", "wechat", 2], ["2026-10-20", "qr", 4]]);
});
