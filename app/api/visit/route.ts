import { env } from "cloudflare:workers";
import { easternDay, validRef } from "@/lib/referral";
import { readJsonObject, sameOriginMutation } from "@/lib/request-security";
import { allowRate, clientRateKey } from "@/lib/rate-limit";

// Counts one visit that arrived with ?ref=<tag>. The page sends it at most once per tag per day per
// browser; the rate limit keeps a script from inflating a count. Nothing about the visitor is stored.
export async function POST(request: Request) {
  const denied = sameOriginMutation(request);
  if (denied) return denied;
  const parsed = await readJsonObject(request, 1024);
  if (parsed.error) return parsed.error;
  const ref = parsed.value.ref;
  if (!validRef(ref)) return Response.json({ error: "Use a tag of lower-case letters, digits and dashes." }, { status: 400 });
  if (!env.DB) return Response.json({ error: "Counting is not available." }, { status: 503 });
  try {
    if (!await allowRate(await clientRateKey(request, "visit"), 20, 3600)) return Response.json({ counted: false }, { status: 429 });
    await env.DB.prepare("INSERT INTO referral_visits (day, ref, visits) VALUES (?, ?, 1) ON CONFLICT(day, ref) DO UPDATE SET visits = visits + 1")
      .bind(easternDay(), ref).run();
    return Response.json({ counted: true });
  } catch {
    return Response.json({ error: "The visit could not be counted." }, { status: 503 });
  }
}
