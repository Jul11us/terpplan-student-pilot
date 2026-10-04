import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { registerHooks } from "node:module";
import { testDatabase, concurrentWatchReads } from "./helpers/d1-sqlite.mjs";
import { readJsonObject, sameOriginMutation } from "../lib/request-security.ts";
import { BoundedCache } from "../lib/bounded-cache.ts";

globalThis.__securityEnv = {
  EMAIL_AUTH_SECRET: "test-only-signing-secret-never-deploy",
  RESEND_API_KEY: "test-only-mail-key",
  EMAIL_FROM: "Fixture <fixture@example.test>",
  WATCH_RUNNER_SECRET: "test-only-runner-key",
};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export const env = globalThis.__securityEnv;", shortCircuit: true };
  return next(specifier, context);
} });
const auth = await import("../lib/auth.ts");
const { POST: requestCode } = await import("../app/api/auth/request-code/route.ts");
const { POST: verifyCode } = await import("../app/api/auth/verify-code/route.ts");
const { POST: logout } = await import("../app/api/auth/logout/route.ts");
const watchRoutes = await import("../app/api/watches/route.ts");
const alertRoutes = await import("../app/api/alerts/route.ts");
const { POST: unsubscribe } = await import("../app/api/alerts/unsubscribe/route.ts");
const { POST: checkWatches } = await import("../app/api/watches/check/route.ts");
const { POST: runner } = await import("../app/api/watches/run/route.ts");
const { POST: activity } = await import("../app/api/trends/activity/route.ts");
const { allowRate } = await import("../lib/rate-limit.ts");
const { GET: adminStats } = await import("../app/api/admin/stats/route.ts");
const { maskEmail } = await import("../lib/admin.ts");
const { unsubscribeToken, hashToken } = await import("../lib/alerts.ts");
const publicPosts = await Promise.all([
  "../app/api/professor-ratings/route.ts", "../app/api/audit/grades/route.ts",
  "../app/api/audit/recommend/route.ts", "../app/api/schedules/generate/route.ts",
].map((path) => import(path)));

let database, originalFetch, messages;
const jsonRequest = (path, body, cookie = "", headers = {}) => new Request(`https://terpplan.test${path}`, {
  method: "POST", headers: { "content-type": "application/json", origin: "https://terpplan.test", cookie, ...headers }, body: JSON.stringify(body),
});
const session = async (email) => {
  const id = await auth.hashEmail(email);
  return { id: `email:${id}`, cookie: auth.emailSessionCookie(await auth.createEmailSession(id)).split(";")[0] };
};
const rowCount = (table) => database.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
const seedWatches = (user, count, course = "CMSC131") => {
  const insert = database.sqlite.prepare("INSERT INTO watches (user_id, course_id, course_title, term, section_id) VALUES (?, ?, 'Fixture', '202701', ?)");
  for (let i = 1; i <= count; i++) insert.run(user, course, `${course}-${String(i).padStart(4, "0")}`);
};

beforeEach(() => {
  database = testDatabase();
  globalThis.__securityEnv.DB = database;
  messages = [];
  delete globalThis.__securityEnv.ADMIN_EMAILS;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input));
    if (url.hostname === "api.resend.com") {
      messages.push(JSON.parse(options.body));
      return Response.json({ id: "fixture-message" });
    }
    assert.equal(url.hostname, "app.testudo.umd.edu", "no unexpected external traffic");
    const course = url.searchParams.get("courseIds") ?? url.pathname.split("/").pop();
    const sections = Array.from({ length: 50 }, (_, i) => `<div class="section"><input name="sectionId" value="${String(i + 1).padStart(4, "0")}"><span class="total-seats-count">20</span><span class="open-seats-count">0</span></div>`).join("");
    return new Response(`<div id="${course}" class="course"><span class="course-title">Fixture</span>${sections}</div>`);
  };
});
afterEach(() => { globalThis.fetch = originalFetch; database.sqlite.close(); });

test("browser mutations reject foreign, sibling and null origins, allowing same-origin and server clients", () => {
  for (const headers of [{ origin: "https://evil.test" }, { origin: "https://sibling.terpplan.test", "sec-fetch-site": "same-site" }, { origin: "null" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }, { referer: "https://evil.test/x" }]) {
    assert.equal(sameOriginMutation(new Request("https://terpplan.test/api/auth/logout", { method: "POST", headers })).status, 403);
  }
  for (const headers of [{ origin: "https://terpplan.test", "sec-fetch-site": "same-origin" }, { referer: "https://terpplan.test/x" }, {}]) assert.equal(sameOriginMutation(new Request("https://terpplan.test/x", { method: "POST", headers })), null);
});

test("bounded JSON rejects primitives, malformed JSON and simple form content types", async () => {
  for (const value of [null, [], "hello", 5, true]) assert.equal((await readJsonObject(jsonRequest("/", value))).error.status, 400);
  assert.equal((await readJsonObject(new Request("https://terpplan.test", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }))).error.status, 400);
  assert.equal((await readJsonObject(jsonRequest("/", {}, "", { "content-type": "text/plain" }))).error.status, 415);
  assert.deepEqual((await readJsonObject(jsonRequest("/", { text: "中文" }))).value, { text: "中文" });
});

test("JSON limit measures streamed UTF-8 bytes, not Content-Length or character count", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ text: "中".repeat(1500) }))); }, cancel() { cancelled = true; } });
  const request = new Request("https://terpplan.test", { method: "POST", headers: { "content-type": "application/json", "content-length": "1" }, body: stream, duplex: "half" });
  assert.equal((await readJsonObject(request)).error.status, 413);
  assert.equal(cancelled, true);
  assert.equal((await readJsonObject(jsonRequest("/", {}, "", { "content-length": "9000" }))).error.status, 413);
});

test("all public JSON POST routes reject null, huge and cross-origin requests before upstream work", async () => {
  for (const { POST } of publicPosts) {
    assert.equal((await POST(jsonRequest("/api", null))).status, 400);
    assert.equal((await POST(jsonRequest("/api", { text: "x".repeat(70_000) }))).status, 413);
    assert.equal((await POST(jsonRequest("/api", {}, "", { origin: "https://evil.test" }))).status, 403);
  }
  assert.equal(messages.length, 0);
});

test("auth routes reject malformed and cross-origin requests without sending mail", async () => {
  for (const POST of [requestCode, verifyCode]) {
    assert.equal((await POST(jsonRequest("/api/auth", null))).status, 400);
    assert.equal((await POST(jsonRequest("/api/auth", { text: "x".repeat(5000) }))).status, 413);
    assert.equal((await POST(jsonRequest("/api/auth", {}, "", { origin: "https://evil.test" }))).status, 403);
  }
  assert.equal(messages.length, 0);
  assert.equal(rowCount("email_login_codes"), 0);
});

test("real code request and verification create a hardened session; replay is rejected", async () => {
  const email = "verified@example.test";
  assert.equal((await requestCode(jsonRequest("/api/auth/request-code", { email }))).status, 200);
  assert.equal(messages.length, 1);
  const code = messages[0].text.match(/is (\d{6})/)[1];
  const response = await verifyCode(jsonRequest("/api/auth/verify-code", { email, code }));
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=2592000"]) assert.ok(cookie.includes(flag));
  assert.deepEqual(await auth.currentUser(new Request("https://terpplan.test", { headers: { cookie } })), { id: `email:${await auth.hashEmail(email)}`, provider: "email" });
  assert.equal((await verifyCode(jsonRequest("/api/auth/verify-code", { email, code }))).status, 401);
  assert.equal(rowCount("email_login_codes"), 0);
});

test("concurrent correct-code verifications consume one code only once", async () => {
  const email = "concurrent@example.test", code = "345678", hash = await auth.hashEmail(email);
  database.sqlite.prepare("INSERT INTO email_login_codes VALUES (?, ?, ?, 0, ?)").run(hash, await auth.hashCode(hash, code), Math.floor(Date.now() / 1000) + 600, Math.floor(Date.now() / 1000));
  const responses = await Promise.all(Array.from({ length: 4 }, () => verifyCode(jsonRequest("/api/auth/verify-code", { email, code }))));
  assert.equal(responses.filter((response) => response.status === 200).length, 1);
});

test("five wrong guesses and expired codes cannot obtain a session", async () => {
  const email = "attempts@example.test", hash = await auth.hashEmail(email);
  database.sqlite.prepare("INSERT INTO email_login_codes VALUES (?, ?, ?, 0, ?)").run(hash, await auth.hashCode(hash, "345678"), Math.floor(Date.now() / 1000) + 600, Math.floor(Date.now() / 1000));
  for (let i = 0; i < 5; i++) assert.equal((await verifyCode(jsonRequest("/api/auth/verify-code", { email, code: "999999" }))).status, 401);
  assert.equal((await verifyCode(jsonRequest("/api/auth/verify-code", { email, code: "345678" }))).status, 401);
  database.sqlite.prepare("INSERT INTO email_login_codes VALUES (?, ?, ?, 0, ?)").run(hash, await auth.hashCode(hash, "345678"), Math.floor(Date.now() / 1000) - 1, 0);
  assert.equal((await verifyCode(jsonRequest("/api/auth/verify-code", { email, code: "345678" }))).status, 401);
});

test("email request throttles stop repeated sends and atomic buckets stop simultaneous abuse", async () => {
  assert.equal((await requestCode(jsonRequest("/api/auth/request-code", { email: "limited@example.test" }))).status, 200);
  assert.equal((await requestCode(jsonRequest("/api/auth/request-code", { email: "limited@example.test" }))).status, 429);
  assert.equal(messages.length, 1);
  const results = await Promise.all(Array.from({ length: 15 }, () => allowRate("fixture-bucket", 5, 60)));
  assert.equal(results.filter(Boolean).length, 5);
  database.sqlite.prepare("UPDATE email_login_rate_limits SET window_started_at = 0 WHERE rate_key = 'fixture-bucket'").run();
  assert.equal(await allowRate("fixture-bucket", 5, 60), true);
});

test("forged proxy headers and tampered, expired or oversized cookies never grant identity", async () => {
  const user = await session("first@example.test");
  const valid = user.cookie.split("=")[1];
  const [body, signature] = valid.split(".");
  const payload = JSON.parse(Buffer.from(body, "base64url"));
  payload.emailHash = "a".repeat(64);
  const tampered = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`;
  for (const token of [tampered, valid + ".extra", "x".repeat(2000), "bad"] ) {
    assert.equal(await auth.currentUser(new Request("https://terpplan.test", { headers: { cookie: `terpplan_email_session=${token}` } })), null);
  }
  payload.expiresAt = 1;
  const expiredBody = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(globalThis.__securityEnv.EMAIL_AUTH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expiredSignature = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(expiredBody))).toString("base64url");
  assert.equal(await auth.currentUser(new Request("https://terpplan.test", { headers: { cookie: `terpplan_email_session=${expiredBody}.${expiredSignature}` } })), null);
  const spoof = new Request("https://terpplan.test/api/watches", { headers: { "oai-authenticated-user-id": user.id, "oai-authenticated-user-email": "first@example.test" } });
  assert.deepEqual(await (await watchRoutes.GET(spoof)).json(), { authenticated: false, watches: [] });
  assert.equal((await alertRoutes.GET(spoof)).status, 401);
});

test("SeatWatch read and delete stay scoped to the signed-in account", async () => {
  const first = await session("first@example.test"), second = await session("second@example.test");
  seedWatches(first.id, 1); seedWatches(second.id, 1);
  const response = await watchRoutes.GET(new Request("https://terpplan.test/api/watches", { headers: { cookie: second.cookie } }));
  assert.deepEqual((await response.json()).watches.map((row) => row.userId), [second.id]);
  const removed = await watchRoutes.DELETE(new Request("https://terpplan.test/api/watches?term=202701&section=CMSC131-0001", { method: "DELETE", headers: { cookie: second.cookie, origin: "https://terpplan.test" } }));
  assert.equal(removed.status, 200);
  assert.equal(database.sqlite.prepare("SELECT user_id FROM watches").get().user_id, first.id);
});

test("signed-in private mutations reject foreign origins and malformed payloads", async () => {
  const user = await session("first@example.test");
  for (const POST of [watchRoutes.POST, alertRoutes.POST, checkWatches, logout]) assert.equal((await POST(jsonRequest("/api", {}, user.cookie, { origin: "https://evil.test" }))).status, 403);
  for (const DELETE of [watchRoutes.DELETE, alertRoutes.DELETE]) assert.equal((await DELETE(new Request("https://terpplan.test/api", { method: "DELETE", headers: { cookie: user.cookie, origin: "https://evil.test" } }))).status, 403);
  for (const POST of [watchRoutes.POST, alertRoutes.POST]) assert.equal((await POST(jsonRequest("/api", null, user.cookie))).status, 400);
  assert.equal((await watchRoutes.POST(jsonRequest("/api/watches", { courseId: 5 }, user.cookie))).status, 400);
  assert.equal(rowCount("watches"), 0);
});

test("concurrent watch saves cannot exceed 40 sections, and batches roll back on quota failure", async () => {
  const user = await session("quota@example.test");
  seedWatches(user.id, 39);
  globalThis.__securityEnv.DB = concurrentWatchReads(database);
  const save = (sections) => watchRoutes.POST(jsonRequest("/api/watches", { term: "202701", courseId: "CMSC131", sectionIds: sections.map((n) => `CMSC131-${String(n).padStart(4, "0")}`) }, user.cookie));
  const responses = await Promise.all([save([40]), save([41])]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  assert.equal(rowCount("watches"), 40);
  assert.equal((await save([1])).status, 201, "existing watch can be refreshed at the cap");
  database.sqlite.prepare("DELETE FROM watches WHERE section_id IN ('CMSC131-0039', 'CMSC131-0040', 'CMSC131-0041')").run();
  assert.equal(rowCount("watches"), 38);
  assert.equal((await save([39, 40, 41])).status, 409);
  assert.equal(rowCount("watches"), 38);
});

test("database course quota counts separate terms and accounts without blocking existing courses", async () => {
  const user = await session("courses@example.test");
  for (let i = 0; i < 10; i++) seedWatches(user.id, 1, `TEST${100 + i}`);
  assert.throws(() => seedWatches(user.id, 1, "TEST999"), /watch_limit/);
  database.sqlite.prepare("INSERT INTO watches (user_id, course_id, course_title, term, section_id) VALUES (?, 'TEST100', 'Fixture', '202701', 'TEST100-0002')").run(user.id);
  assert.throws(() => database.sqlite.prepare("INSERT INTO watches (user_id, course_id, course_title, term, section_id) VALUES (?, 'TEST100', 'Fixture', '202608', 'TEST100-0001')").run(user.id), /watch_limit/);
  seedWatches("separate-fixture-account", 1, "TEST999");
});

test("seat email opt-in requires the verified address; other accounts cannot disable it", async () => {
  const first = await session("first@example.test"), second = await session("second@example.test");
  assert.equal((await alertRoutes.POST(jsonRequest("/api/alerts", { email: "second@example.test" }, first.cookie))).status, 400);
  assert.equal(rowCount("alert_subscriptions"), 0);
  assert.equal((await alertRoutes.POST(jsonRequest("/api/alerts", { email: "first@example.test" }, first.cookie))).status, 200);
  await alertRoutes.DELETE(new Request("https://terpplan.test/api/alerts", { method: "DELETE", headers: { cookie: second.cookie } }));
  assert.equal(database.sqlite.prepare("SELECT user_id FROM alert_subscriptions").get().user_id, first.id);
  const stored = database.sqlite.prepare("SELECT unsubscribe_token_hash FROM alert_subscriptions").get().unsubscribe_token_hash;
  assert.equal(stored, await hashToken(await unsubscribeToken(first.id)));
});

test("one-click unsubscribe permits mail clients, deletes only its token's address and is idempotent", async () => {
  const first = await session("first@example.test"), second = await session("second@example.test");
  for (const user of [first, second]) await alertRoutes.POST(jsonRequest("/api/alerts", { email: user === first ? "first@example.test" : "second@example.test" }, user.cookie));
  const token = await unsubscribeToken(first.id);
  const request = () => new Request(`https://terpplan.test/api/alerts/unsubscribe?token=${token}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://mail.example.test" }, body: "List-Unsubscribe=One-Click" });
  assert.equal((await unsubscribe(request())).status, 200);
  assert.equal(rowCount("alert_subscriptions"), 1);
  assert.equal(database.sqlite.prepare("SELECT user_id FROM alert_subscriptions").get().user_id, second.id);
  assert.equal((await unsubscribe(request())).status, 200);
  assert.equal((await unsubscribe(jsonRequest("/api/alerts/unsubscribe", { token: "wrong" }))).status, 400);
});

test("runner rejects missing and incorrect bearer secrets without upstream calls or mail", async () => {
  for (const headers of [{}, { authorization: "Bearer wrong-fixture-value" }, { "oai-authenticated-user-id": "fixture" }]) assert.equal((await runner(new Request("https://terpplan.test/api/watches/run", { method: "POST", headers }))).status, 401);
  assert.equal(messages.length, 0);
});

test("manual checks throttle each account atomically while different accounts can check", async () => {
  const first = await session("first@example.test"), second = await session("second@example.test");
  const responses = await Promise.all([checkWatches(jsonRequest("/api/watches/check", {}, first.cookie)), checkWatches(jsonRequest("/api/watches/check", {}, first.cookie))]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 429]);
  assert.equal((await checkWatches(jsonRequest("/api/watches/check", {}, second.cookie))).status, 200);
});

test("anonymous activity limit survives rotating browser IDs and stores no raw edge address", async () => {
  const ip = "198.51.100.42";
  for (let i = 0; i < 120; i++) {
    const response = await activity(jsonRequest("/api/trends/activity", { term: "202701", id: crypto.randomUUID(), courseIds: ["CMSC131"] }, "", { "cf-connecting-ip": ip }));
    assert.equal(response.status, 200);
  }
  assert.equal((await activity(jsonRequest("/api/trends/activity", { term: "202701", id: crypto.randomUUID(), courseIds: ["CMSC131"] }, "", { "cf-connecting-ip": ip }))).status, 429);
  assert.ok(!JSON.stringify(database.sqlite.prepare("SELECT * FROM email_login_rate_limits").all()).includes(ip));
});

test("public-input caches evict old keys and retain bounded size when replacing entries", () => {
  const cache = new BoundedCache(2);
  cache.set("a", 1).set("b", 2).set("a", 3).set("c", 4);
  assert.equal(cache.size, 2);
  assert.equal(cache.has("b"), false);
  assert.equal(cache.get("a"), 3);
  assert.throws(() => new BoundedCache(0));
});

test("admin endpoint fails closed when signed out, spoofed, unconfigured or not on the allowlist", async () => {
  const owner = await session("owner@example.test"), visitor = await session("visitor@example.test");
  const request = (cookie) => new Request("https://terpplan.test/api/admin/stats", { headers: { cookie, "oai-authenticated-user-email": "owner@example.test" } });
  assert.equal((await adminStats(request(""))).status, 401);
  assert.equal((await adminStats(request(owner.cookie))).status, 403);
  globalThis.__securityEnv.ADMIN_EMAILS = "owner@example.test";
  const forbidden = await adminStats(request(visitor.cookie));
  assert.equal(forbidden.status, 403);
  assert.ok(forbidden.headers.get("cache-control").includes("no-store"));
  globalThis.__securityEnv.ADMIN_EMAILS = "someone@example.test, OWNER@example.test ";
  const allowed = await adminStats(request(owner.cookie));
  assert.equal(allowed.status, 200);
  assert.ok(allowed.headers.get("cache-control").includes("no-store"));
});

test("admin statistics execute real SQL and expose masked addresses without raw emails or session hashes", async () => {
  const owner = await session("owner@example.test"), visitor = await session("visitor@example.test");
  globalThis.__securityEnv.ADMIN_EMAILS = "owner@example.test";
  await alertRoutes.POST(jsonRequest("/api/alerts", { email: "visitor@example.test" }, visitor.cookie));
  seedWatches(visitor.id, 2);
  const response = await adminStats(new Request("https://terpplan.test/api/admin/stats", { headers: { cookie: owner.cookie } }));
  const body = await response.json();
  assert.equal(body.subscribers, 1);
  assert.equal(body.subscribersWithWatches, 1);
  assert.equal(body.watches, 2);
  assert.equal(body.recentSubscribers[0].email, "v•••@example.test");
  assert.ok(!JSON.stringify(body).includes("visitor@example.test"));
  assert.ok(!JSON.stringify(body).includes(visitor.id));
  assert.equal(maskEmail("invalid"), "•••");
});

test("scheduled cleanup deletes old abuse keys and codes while retaining recent reservations", async () => {
  const now = Math.floor(Date.now() / 1000);
  const insert = database.sqlite.prepare("INSERT INTO email_login_rate_limits VALUES (?, ?, 1)");
  insert.run("old-fixture", now - 90000); insert.run("recent-fixture", now);
  database.sqlite.prepare("INSERT INTO email_login_codes VALUES ('old-fixture', 'fixture-code-hash', ?, 0, 0)").run(now - 90000);
  const response = await runner(new Request("https://terpplan.test/api/watches/run", { method: "POST", headers: { authorization: `Bearer ${globalThis.__securityEnv.WATCH_RUNNER_SECRET}` } }));
  assert.equal(response.status, 200);
  assert.deepEqual(database.sqlite.prepare("SELECT rate_key FROM email_login_rate_limits").all().map((row) => row.rate_key), ["recent-fixture"]);
  assert.equal(rowCount("email_login_codes"), 0);
  assert.equal(messages.length, 0);
});
