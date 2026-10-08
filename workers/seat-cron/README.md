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

The production scheduler is `terpplan-seat-cron`, with Cron `*/2 * * * *`.
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

## Background safety limits (source changes; deploy both components to apply)

Apply migrations `0014_background_budget.sql` and `0015_mail_safety.sql` with the Site release before enabling
the new endpoint. Without its budget table, the endpoint fails closed (503).
Deploy the scheduler separately to apply its schedule and application limits.

- All authenticated background callers share one D1 allowance: at most 720 starts
  per UTC day, including failures. Runs start at least 90 seconds apart (allowing
  Cron delivery jitter), with a five-minute lease to recover after a crash. There
  is no immediate retry loop; deferred work waits for a later Cron event.
- Each run selects at most 200 due watch rows, processes at most 100 course groups,
  and handles at most 200 pending alert rows / 20 recipients. Oldest work goes first.
  Limited counts in the endpoint response describe the selected window;
  `moreWatches` means additional watch rows remain outside that window.
- Each cleanup query deletes at most 500 expired rows. Recurring watch and cleanup
  queries have indexes, avoiding whole-table reads just to find the next batch.
- No new seat batch starts after 40 seconds; no new email or trend-writing unit
  starts after the 60-second work budget. In-flight units can finish afterward;
  network calls have timeouts. The scheduler request times out after 90 seconds.
- The scheduler makes one outbound request, has no public trigger and no Durable
  Object alarm. The Free plan's native CPU limits apply. Custom CPU limits require
  Paid, so this configuration omits them and keeps the Free plan. The code makes
  only one request per invocation and never retries it immediately.

All three email paths (sign-in, seat alerts, feedback) share a persisted attempt
budget: 90 per UTC day / 2,600 per calendar month. Alerts and feedback stop at 70
daily attempts, leaving 20 for sign-in. Failures also consume allowance. Seat
emails retry at most three times in separate runs with the original payload and
Resend idempotency key; accepted requests are not resent. Fresh openings wait at
quota exhaustion and expire after an hour. Feedback remains available on /admin
even when its email is blocked. Outbox payloads are deleted after 24 hours in
batches of at most 500 rows; /admin shows counts only, never outbox contents.

The admin page warns after five minutes without a successful check, on partial
failures, queued work, or approaching the email quota (60 daily / 2,200 monthly).
These counters start with this release and cover this site's attempts only. To
keep the entire Resend team within Free limits, also account for other senders,
incoming mail and usage before this release. Provider acceptance does not confirm
inbox delivery. See [Resend usage](https://resend.com/docs/knowledge-base/account-quotas-and-limits).

For an emergency pause, set `WATCH_RUNNER_ENABLED=false` on the Site runtime
(checked before D1 work) or the scheduler. A persistent pause is also available
in the Site database: `UPDATE background_budget SET enabled = 0 WHERE id = 1`.
Set `enabled = 1` to resume; leave the allowance and timestamps intact. To remove
scheduled invocations altogether, set scheduler `triggers.crons` to `[]` and redeploy.

These are background-work limits, not a dollar ceiling on the Cloudflare account.
Public traffic, other Workers and other products still have their own usage.
Cloudflare's CPU/subrequest limits apply per invocation; D1 paid overages are billed
separately ([Workers configuration](https://developers.cloudflare.com/workers/wrangler/configuration/#limits),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)). A two-minute
Cron does not guarantee every watched course is checked in every batch, source
freshness, or mail delivery time.

Verify the safety paths locally:

```powershell
node --import tsx --test tests/background-budget.test.mjs tests/background-budget-runtime.test.mjs tests/seat-cron.test.mjs tests/seat-cron-runtime.test.mjs
```
