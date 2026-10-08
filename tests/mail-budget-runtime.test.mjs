import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

test("workerd with native D1 enforces the mail quota atomically across callers", async () => {
  const root = fileURLToPath(new URL("../lib/", import.meta.url));
  const source = await readFile(new URL("../lib/mail-budget.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mf = new Miniflare(convertV4MiniflareOptions({
    compatibilityDate: "2026-10-07", modulesRoot: root,
    modules: [
      { type: "ESModule", path: `${root}/mail-fixture.mjs`, contents: `
        import { reserveMail } from './mail-budget.mjs';
        export default { async fetch(request) {
          const kind = new URL(request.url).searchParams.get('kind') || 'alert';
          return Response.json({ allowed: await reserveMail(kind, Date.parse('2026-10-08T12:00:00Z')) });
        } };` },
      { type: "ESModule", path: `${root}/mail-budget.mjs`, contents: js },
    ], d1Databases: { DB: "mail-budget-fixture" },
  }));
  try {
    const db = await mf.getD1Database("DB");
    const sql = await readFile(new URL("../drizzle/0015_mail_safety.sql", import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")[0].split(";").map((s) => s.trim()).filter(Boolean)) await db.prepare(statement).run();
    await db.prepare("UPDATE mail_budget SET day = '2026-10-08', month = '2026-10', day_requests = 69, month_requests = 2598").run();
    const invoke = async (kind) => (await (await mf.dispatchFetch(`http://fixture.test/?kind=${kind}`)).json()).allowed;
    assert.equal((await Promise.all([invoke("alert"), invoke("feedback"), invoke("alert")])).filter(Boolean).length, 1);
    assert.equal((await Promise.all([invoke("login"), invoke("login"), invoke("login")])).filter(Boolean).length, 1);
    assert.equal((await db.prepare("SELECT month_requests FROM mail_budget").first()).month_requests, 2600);
    assert.equal(await invoke("login"), false);
  } finally { await mf.dispose(); }
});
