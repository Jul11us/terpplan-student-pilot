import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

test("the production check function runs in workerd and sends an authenticated nonredirecting request", async () => {
  const workerRoot = fileURLToPath(new URL("../workers/seat-cron/", import.meta.url));
  const source = await readFile(new URL("../workers/seat-cron/worker.mjs", import.meta.url), "utf8");
  const counts = { checkedCourses: 2, failedCourses: 0, deferredToNextRun: 0, emailsSent: 0, emailsFailed: 0, durationMs: 50 };
  let called = false;
  const mf = new Miniflare(convertV4MiniflareOptions({
    compatibilityDate: "2026-10-07",
    compatibilityFlags: ["global_fetch_strictly_public"],
    modulesRoot: workerRoot,
    modules: [
      { type: "ESModule", path: `${workerRoot}/fixture-entry.mjs`, contents:
        'import { checkSeats } from "./worker.mjs"; export default { async fetch(_request, env) { return Response.json(await checkSeats(env)); } };' },
      { type: "ESModule", path: `${workerRoot}/worker.mjs`, contents: source },
    ],
    bindings: { WATCH_RUNNER_SECRET: "test-only-runtime-secret" },
    outboundService: async (request) => {
      called = true;
      assert.equal(request.url, "https://terpplan.com/api/watches/run");
      assert.equal(request.method, "POST");
      assert.equal(request.headers.get("authorization"), "Bearer test-only-runtime-secret");
      return Response.json(counts);
    },
  }));
  try {
    const response = await mf.dispatchFetch("http://fixture.test/");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), counts);
    assert.equal(called, true);
  } finally { await mf.dispose(); }
});
