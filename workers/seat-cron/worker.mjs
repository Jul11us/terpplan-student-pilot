// This small Worker owns scheduling; the existing Site owns watches, D1 and email delivery.
const RUN_URL = "https://terpplan.com/api/watches/run";

export async function checkSeats(env, fetcher = fetch) {
  if (!env.WATCH_RUNNER_SECRET) throw new Error("Seat-check secret is not configured.");
  let response;
  try {
    response = await fetcher(RUN_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${env.WATCH_RUNNER_SECRET}` },
      // Never forward the credential to a redirect destination.
      redirect: "manual",
      signal: AbortSignal.timeout(90_000),
    });
  } catch (error) {
    // Network errors and upstream bodies may contain private details. Log neither.
    const name = error instanceof Error ? error.name : "UnknownError";
    throw new Error(`Seat-check request failed or timed out (${name}).`);
  }
  if (!response.ok) throw new Error(`Seat-check endpoint returned HTTP ${response.status}.`);
  let result;
  try { result = await response.json(); }
  catch { throw new Error("Seat-check endpoint did not return JSON."); }
  const names = ["checkedCourses", "failedCourses", "deferredToNextRun", "emailsSent", "emailsFailed", "durationMs"];
  if (!result || typeof result !== "object" || names.some((name) => !Number.isSafeInteger(result[name]) || result[name] < 0)) {
    throw new Error("Seat-check endpoint returned an invalid summary.");
  }
  const summary = Object.fromEntries(names.map((name) => [name, result[name]]));
  console.log(JSON.stringify({ event: "seat-check", ...summary }));
  if (summary.failedCourses || summary.emailsFailed) throw new Error("Some seat checks or emails failed; see count summary.");
  if (summary.deferredToNextRun) console.warn("Seat-check backlog remains for the next scheduled run.");
  return summary;
}

const worker = {
  async scheduled(_controller, env) {
    // Await completion so Cloudflare records exceptions as failed Cron invocations.
    await checkSeats(env);
  },
  fetch() {
    // Only Cloudflare's scheduled event can invoke checks; there is no public trigger.
    return new Response("Not found", { status: 404 });
  },
};

export default worker;
