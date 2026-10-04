import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";

// Execute Drizzle's real SQL against SQLite through D1's prepared-statement interface.
export function testDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  const directory = new URL("../../drizzle/", import.meta.url);
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) sqlite.exec(readFileSync(new URL(file, directory), "utf8"));
  function prepare(query, params = []) {
    return {
      bind(...values) { return prepare(query, values); },
      async first(column) { const row = sqlite.prepare(query).get(...params); return column ? row?.[column] ?? null : row ?? null; },
      async all() { return { success: true, results: sqlite.prepare(query).all(...params), meta: {} }; },
      async raw() { return sqlite.prepare(query).all(...params).map((row) => Object.values(row)); },
      async run() { const result = sqlite.prepare(query).run(...params); return { success: true, results: [], meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) } }; },
    };
  }
  return { sqlite, prepare, async batch(statements) { sqlite.exec("BEGIN"); try { const results = []; for (const statement of statements) results.push(await statement.all()); sqlite.exec("COMMIT"); return results; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } } };
}
