import { env } from "cloudflare:workers";
import { easternDay } from "@/lib/referral";
import { readJsonObject, sameOriginMutation } from "@/lib/request-security";
import { allowRate, clientRateKey, onceToday } from "@/lib/rate-limit";
import { validFeature } from "@/lib/usage";

// Counts one use of a feature: { feature: "planner" | "course" | ... } (see lib/usage.ts), once per network
// address + browser kind per feature per day. Only the day's count per feature is stored.
export async function POST(request: Request) {
  const denied = sameOriginMutation(request);
  if (denied) return denied;
  const parsed = await readJsonObject(request, 256);
  if (parsed.error) return parsed.error;
  const { feature } = parsed.value;
  if (!validFeature(feature)) return Response.json({ error: "Unknown feature." }, { status: 400 });
  if (!env.DB) return Response.json({ error: "Counting is not available." }, { status: 503 });
  try {
    if (!await allowRate(await clientRateKey(request, "usage"), 40, 3600)) return Response.json({ counted: false }, { status: 429 });
    if (!await onceToday(request, `use-${feature}`)) return Response.json({ counted: false });
    await env.DB.prepare("INSERT INTO feature_usage (day, feature, people) VALUES (?, ?, 1) ON CONFLICT(day, feature) DO UPDATE SET people = people + 1")
      .bind(easternDay(), feature).run();
    return Response.json({ counted: true });
  } catch {
    return Response.json({ error: "The use could not be counted." }, { status: 503 });
  }
}
