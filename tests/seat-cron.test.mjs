import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import worker, { checkSeats } from "../workers/seat-cron/worker.mjs";

const env = { WATCH_RUNNER_SECRET: "test-only-cron-secret" };
const counts = { checkedCourses: 2, failedCourses: 0, deferredToNextRun: 0, emailsSent: 1, emailsFailed: 0, durationMs: 100 };

test("production scheduler runs every two minutes with native Free-plan limits", async () => {
  const config = JSON.parse(await readFile(new URL("../workers/seat-cron/wrangler.jsonc", import.meta.url), "utf8"));
  assert.deepEqual(config.triggers.crons, ["*/2 * * * *"]);
  assert.equal(config.limits?.cpu_ms, undefined, "custom CPU limits are rejected on Free");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.durable_objects, undefined);
});

test("Cron posts only to the production check endpoint and returns counts without private data", async () => {
  let request;
  const result = await checkSeats(env, async (url, options) => {
    request = { url, options };
    return Response.json({ ...counts, privateField: "must-not-leave-endpoint" });
  });
  assert.equal(request.url, "https://terpplan.com/api/watches/run");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.authorization, `Bearer ${env.WATCH_RUNNER_SECRET}`);
  assert.equal(request.options.redirect, "manual");
  assert.ok(request.options.signal instanceof AbortSignal);
  assert.deepEqual(result, counts);
  assert.equal(JSON.stringify(result).includes("must-not-leave"), false);
});

test("Cron rejects absent credentials without making a request", async () => {
  let called = false;
  await assert.rejects(checkSeats({}, async () => { called = true; }), /not configured/);
  assert.equal(called, false);
});

test("Cron pause makes no requests, and a safety-budget skip does not retry", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return Response.json({ ...counts, checkedCourses: 0, emailsSent: 0, skipped: "budget-or-lock" }); };
  assert.deepEqual(await checkSeats({ WATCH_RUNNER_ENABLED: "false" }, fetcher), { skipped: "disabled" });
  assert.equal(calls, 0);
  assert.equal((await checkSeats(env, fetcher)).skipped, "budget-or-lock");
  assert.equal(calls, 1);
});

test("Cron reports upstream failures without logging the upstream body or credentials", async () => {
  await assert.rejects(checkSeats(env, async () => new Response("private body", { status: 503 })), /HTTP 503/);
  await assert.rejects(checkSeats(env, async () => new Response(null, {
    status: 302, headers: { location: "https://unrelated.example.test/" },
  })), /HTTP 302/);
  await assert.rejects(checkSeats(env, async () => { throw new Error(env.WATCH_RUNNER_SECRET); }), (error) => {
    assert.equal(error.message.includes(env.WATCH_RUNNER_SECRET), false);
    return /failed or timed out/.test(error.message);
  });
});

test("Cron marks malformed summaries and partial course or email failures as failed invocations", async () => {
  await assert.rejects(checkSeats(env, async () => new Response("not JSON")), /did not return JSON/);
  await assert.rejects(checkSeats(env, async () => Response.json({})), /invalid summary/);
  await assert.rejects(checkSeats(env, async () => Response.json({ ...counts, failedCourses: 1 })), /checks or emails failed/);
  await assert.rejects(checkSeats(env, async () => Response.json({ ...counts, emailsFailed: 1 })), /checks or emails failed/);
});

test("no public HTTP request can trigger a seat check", async () => {
  const response = await worker.fetch(new Request("https://example.test/"), env);
  assert.equal(response.status, 404);
});

test("the actual scheduled handler awaits the endpoint and propagates failures", async () => {
  const originalFetch = globalThis.fetch;
  let completed = false;
  try {
    globalThis.fetch = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      completed = true;
      return Response.json(counts);
    };
    await worker.scheduled({ cron: "*/10 * * * *" }, env);
    assert.equal(completed, true);
    globalThis.fetch = async () => new Response("failure", { status: 503 });
    await assert.rejects(worker.scheduled({ cron: "*/10 * * * *" }, env), /HTTP 503/);
  } finally { globalThis.fetch = originalFetch; }
});
