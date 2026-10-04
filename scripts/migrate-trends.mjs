#!/usr/bin/env node
// Apply the production Drizzle migrations to an isolated local D1 database. Never touches remote D1.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const state = resolve(root, process.argv[2] ?? "outputs/trends-local-state");
const config = resolve(root, "outputs/redeploy/trends-local.json");
mkdirSync(resolve(root, "outputs/redeploy"), { recursive: true });
writeFileSync(config, JSON.stringify({ name: "terpplan-trends-local", compatibility_date: "2026-09-21", d1_databases: [{ binding: "DB", database_name: "site-creator-d1", database_id: "00000000-0000-4000-8000-000000000000", migrations_dir: resolve(root, "drizzle") }] }));
const result = spawnSync(process.execPath, ["--import", new URL("./sites-env.mjs", import.meta.url).href, resolve(root, "node_modules/wrangler/bin/wrangler.js"), "d1", "migrations", "apply", "DB", "--local", "--config", config, "--persist-to", state], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
