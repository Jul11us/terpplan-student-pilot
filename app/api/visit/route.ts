import { env } from "cloudflare:workers";
import { easternDay, validRef } from "@/lib/referral";
import { readJsonObject, sameOriginMutation } from "@/lib/request-security";
import { allowRate, clientRateKey } from "@/lib/rate-limit";

// Counts a visit: { visitor: "new" | "returning" } once per browser per day, and { ref: "<tag>" } once
// per tag per day when the visit arrived with ?ref=<tag>. The page sends each at most once a day; the rate
// limit keeps a script from inflating a count. Nothing about the visitor is stored.
export async function POST(request: Request) {
  const denied = sameOriginMutation(request);
  if (denied) return denied;
  const parsed = await readJsonObject(request, 1024);
  if (parsed.error) return parsed.error;
  const { ref, visitor } = parsed.value;
  if (ref !== undefined && !validRef(ref)) return Response.json({ error: "Use a tag of lower-case letters, digits and dashes." }, { status: 400 });
  if (visitor !== undefined && visitor !== "new" && visitor !== "returning") return Response.json({ error: "Unknown visitor kind." }, { status: 400 });
  if (ref === undefined && visitor === undefined) return Response.json({ error: "Nothing to count." }, { status: 400 });
  if (!env.DB) return Response.json({ error: "Counting is not available." }, { status: 503 });
  try {
    if (!await allowRate(await clientRateKey(request, "visit"), 20, 3600)) return Response.json({ counted: false }, { status: 429 });
    const day = easternDay();
    const writes = [];
    if (visitor) writes.push(env.DB.prepare("INSERT INTO site_visits (day, visitors, new_visitors) VALUES (?, 1, ?) ON CONFLICT(day) DO UPDATE SET visitors = visitors + 1, new_visitors = new_visitors + excluded.new_visitors")
      .bind(day, visitor === "new" ? 1 : 0));
    if (ref) writes.push(env.DB.prepare("INSERT INTO referral_visits (day, ref, visits) VALUES (?, ?, 1) ON CONFLICT(day, ref) DO UPDATE SET visits = visits + 1")
      .bind(day, ref));
    await env.DB.batch(writes);
    return Response.json({ counted: true });
  } catch {
    return Response.json({ error: "The visit could not be counted." }, { status: 503 });
  }
}
