# Cloudflare seat-check scheduler

This independent Worker calls the existing authenticated Site endpoint every ten
minutes. The Site continues to own student watches, D1, and email delivery.
The scheduler has no public URL or public HTTP trigger. Logs contain aggregate
counts only. Partial course/email failures mark the Cron invocation as failed.

## Enable production

Run from the `sites-pilot` directory. Use your Cloudflare account, not a temporary
preview account. Do not change the Site's main Worker configuration.

1. Authenticate: `node node_modules/wrangler/bin/wrangler.js login`.
2. Select the intended account if more than one is available.
3. Deploy the scheduler with its secret as described below.
4. Allow up to 15 minutes for Cloudflare's Cron configuration to propagate.
5. In Cloudflare, verify successful scheduled invocations and count summaries.
   Cross-check fresh entries in the Site owner's background-check panel when
   the background-run recording feature has been published.
6. Only after a successful Cron invocation, remove the obsolete
   `.github/workflows/seat-check.yml` workflow.
   Verify two consecutive Cron runs approximately ten minutes apart.

The scheduler's `WATCH_RUNNER_SECRET` must match the Site's runtime secret. Never
commit this value or paste it into a shell command. Cloudflare's first deploy
supports a local JSON secrets file via `--secrets-file`; use an ignored file and
delete it after deployment. Alternatively, deploy initially without a secret,
then use `wrangler secret put WATCH_RUNNER_SECRET --config workers/seat-cron/wrangler.jsonc`
and enter the value at its hidden prompt. Early invocations will fail closed
until the secret is installed. Do not remove the GitHub fallback at this stage.

Deploy:

```powershell
node node_modules/wrangler/bin/wrangler.js deploy --config workers/seat-cron/wrangler.jsonc
node node_modules/wrangler/bin/wrangler.js secret put WATCH_RUNNER_SECRET --config workers/seat-cron/wrangler.jsonc
```

If the existing secret is unavailable, set a new cryptographically random shared
secret in both the Site's runtime and this scheduler during cutover; do not
remove the existing Site runtime secrets. The old GitHub credential will stop
working after rotation. Never rotate before the scheduler is deployed and ready.

## Deployment on 2026-10-07 (America/New_York)

The production scheduler is `terpplan-seat-cron`, with Cron `*/10 * * * *`.
Its shared credential was rotated in both Cloudflare and Sites during cutover;
the temporary local secrets file was removed. The Site's existing version 113
was redeployed to apply environment revision 11, without bundling unrelated
uncommitted app changes. Future Site deployments preserve this runtime secret.

The workerd runtime rejects `redirect: "error"`, so the scheduler uses `manual`
and rejects non-2xx statuses without following redirects. It also enables
`global_fetch_strictly_public` to reach the Site through its public front door.
The production Worker version is `7ae77c02-6119-4af1-b2ee-4d39bf2e2f31`.
The first successful scheduled check was at 22:20 Eastern on October 7: two
course groups checked, no course/email failures, and no deferred groups.

For a manual recovery check, use the protected Site endpoint with the shared
credential through a secure local process. Do not add a public Worker trigger.

## Local verification

```powershell
node --test tests/seat-cron.test.mjs
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --config workers/seat-cron/wrangler.jsonc
```

The Site presently caps a run at 40 course groups and defers the rest. A ten-minute
Cron triggers a batch every ten minutes; it does not guarantee every watched
course is checked in every batch, source freshness, or mail delivery time.
