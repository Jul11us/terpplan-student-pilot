import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { registerHooks } from "node:module";
import { testDatabase } from "./helpers/d1-sqlite.mjs";

globalThis.__adminEnv = { EMAIL_AUTH_SECRET: "test-only-signing-secret-never-deploy", ADMIN_EMAILS: " Owner@Example.test , second@example.test" };
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export const env = globalThis.__adminEnv;", shortCircuit: true };
  return next(specifier, context);
} });
const auth = await import("../lib/auth.ts");
const { maskEmail } = await import("../lib/admin.ts");
const { GET: stats } = await import("../app/api/admin/stats/route.ts");

let database;
const request = async (email) => {
  const headers = {};
  if (email) headers.cookie = `terpplan_email_session=${await auth.createEmailSession(await auth.hashEmail(email))}`;
  return new Request("https://terpplan.test/api/admin/stats", { headers });
};
const userId = async (email) => `email:${await auth.hashEmail(email)}`;

beforeEach(() => { database = testDatabase(); globalThis.__adminEnv.DB = database; });
afterEach(() => { database.sqlite.close(); delete globalThis.__adminEnv.DB; });

test("only signed-in admin emails can read the numbers", async () => {
  assert.equal((await stats(await request(null))).status, 401);
  const stranger = await stats(await request("student@example.test"));
  assert.equal(stranger.status, 403);
  assert.equal((await stranger.json()).code, "forbidden");
  assert.equal((await stats(await request("owner@example.test"))).status, 200);
  assert.equal((await stats(await request("second@example.test"))).status, 200);
  const saved = globalThis.__adminEnv.ADMIN_EMAILS;
  globalThis.__adminEnv.ADMIN_EMAILS = "";
  try {
    const unset = await stats(await request("owner@example.test"));
    assert.equal(unset.status, 403);
    assert.equal((await unset.json()).code, "notConfigured");
  } finally {
    globalThis.__adminEnv.ADMIN_EMAILS = saved;
  }
});

test("counts sign-ups and watches and masks addresses", async () => {
  const [a, b, c] = await Promise.all(["ann@umd.edu", "bob@gmail.com", "cy@umd.edu"].map(userId));
  const now = new Date();
  const sqliteTime = (daysAgo) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
  const subscribe = database.sqlite.prepare("INSERT INTO alert_subscriptions (user_id, email, unsubscribe_token_hash, created_at) VALUES (?, ?, 'x', ?)");
  subscribe.run(a, "ann@umd.edu", sqliteTime(1));
  subscribe.run(b, "bob@gmail.com", sqliteTime(20));
  const watch = database.sqlite.prepare("INSERT INTO watches (user_id, course_id, course_title, term, section_id, alert_sent_at) VALUES (?, ?, ?, '202701', ?, ?)");
  watch.run(a, "CMSC131", "Programming I", "CMSC131-0101", now.toISOString());
  watch.run(a, "MATH140", "Calculus I", "MATH140-0101", null);
  watch.run(c, "CMSC131", "Programming I", "CMSC131-0101", null);
  const body = await (await stats(await request("owner@example.test"))).json();
  assert.equal(body.subscribers, 2);
  assert.equal(body.subscribersLast7Days, 1);
  assert.equal(body.subscribersWithWatches, 1);
  assert.equal(body.signedInWithWatches, 2);
  assert.equal(body.watches, 3);
  assert.equal(body.watchedSections, 2);
  assert.equal(body.alertsSentLast7Days, 1);
  assert.deepEqual(body.topCourses[0], { courseId: "CMSC131", courseTitle: "Programming I", students: 2 });
  assert.deepEqual(body.recentSubscribers.map((row) => [row.email, row.watches]), [["a•••@umd.edu", 2], ["b•••@gmail.com", 0]]);
  assert.equal(body.signupsByDay.length, 2);
  assert.ok(!JSON.stringify(body).includes("ann@umd.edu"));
});

test("admin access rejects spoofed identity headers and altered session cookies", async () => {
  const ownerRequest = await request("owner@example.test");
  const headers = { "x-user-email": "owner@example.test", "x-user-id": await userId("owner@example.test") };
  assert.equal((await stats(new Request(ownerRequest.url, { headers }))).status, 401);
  headers.cookie = ownerRequest.headers.get("cookie").replace("=", "=x");
  assert.equal((await stats(new Request(ownerRequest.url, { headers }))).status, 401);
  const allowed = await stats(ownerRequest);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("cache-control"), "no-store");
});

test("masks an address down to its first letter and domain", () => {
  assert.equal(maskEmail("terp@gmail.com"), "t•••@gmail.com");
  assert.equal(maskEmail("broken"), "•••");
});
