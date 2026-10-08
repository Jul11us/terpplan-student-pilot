import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

test("workerd and real local D1 share the atomic budget across concurrent requests", async () => {
  const root = fileURLToPath(new URL("../lib/", import.meta.url));
  const source = await readFile(new URL("../lib/background-budget.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mf = new Miniflare(convertV4MiniflareOptions({
    compatibilityDate: "2026-10-07",
    modulesRoot: root,
    modules: [
      { type: "ESModule", path: `${root}/budget-fixture.mjs`, contents: `
        import { reserveBackgroundRun, releaseBackgroundRun } from './background-budget.mjs';
        export default { async fetch(request) {
          const now = Number(new URL(request.url).searchParams.get('now'));
          const token = await reserveBackgroundRun(now);
          if (token) await releaseBackgroundRun(token);
          return Response.json({ allowed: Boolean(token) });
        } };` },
      { type: "ESModule", path: `${root}/background-budget.mjs`, contents: js },
    ],
    d1Databases: { DB: "background-budget-fixture" },
  }));
  try {
    const db = await mf.getD1Database("DB");
    const sql = await readFile(new URL("../drizzle/0014_background_budget.sql", import.meta.url), "utf8");
    // The budget has no dependency on watch tables or their indexes.
    for (const statement of sql.split("--> statement-breakpoint")[0].split(";").map((s) => s.trim()).filter(Boolean)) await db.prepare(statement).run();
    const now = Date.parse("2026-10-08T12:00:00Z");
    const invoke = async (at) => (await (await mf.dispatchFetch(`http://fixture.test/?now=${at}`)).json()).allowed;
    const answers = await Promise.all([invoke(now), invoke(now), invoke(now)]);
    assert.equal(answers.filter(Boolean).length, 1);
    assert.equal((await db.prepare("SELECT runs FROM background_budget").first()).runs, 1);
    assert.equal(await invoke(now + 89_999), false);
    assert.equal(await invoke(now + 90_000), true);
    await db.prepare("UPDATE background_budget SET runs = 720").run();
    assert.equal(await invoke(now + 180_000), false);
    await db.prepare("UPDATE background_budget SET enabled = 0").run();
    assert.equal(await invoke(now + 86_400_000), false);
  } finally { await mf.dispose(); }
});
