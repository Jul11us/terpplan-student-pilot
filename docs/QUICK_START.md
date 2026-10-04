# Local verification

Use Node.js 22.13 or newer and the installed project dependencies. The hosted checkout is `sites-pilot`; the parent application is separate.

```powershell
node scripts/run-framework.mjs build
node scripts/migrate-trends.mjs outputs/trends-local-state
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to outputs/trends-local-state --ip 127.0.0.1 --port 8796 --inspector-port 0
```

The migration script always uses local D1 and all generated `drizzle` migrations. It does not create a separate `better-sqlite3` database or write to production.

With the server running, collect actual observations:

```powershell
node scripts/collect-seat-data.mjs 202701 http://127.0.0.1:8796 CMSC131
```

Repeated collection within half an hour is deduplicated. Three observations are required for a chart; filling estimates require at least a day. Popularity appears only after visitors actively choose to share anonymous course counts.

Run checks with:

```powershell
node --import tsx --test tests/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js . --ignore-pattern dist --ignore-pattern .next --ignore-pattern outputs
```

Publish through the existing Sites project in `.openai/hosting.json` with the exact pushed commit and its matching build archive. See `docs/TRENDS_FEATURE.md` for data scope.
