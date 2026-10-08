import { env } from "cloudflare:workers";
import { easternDay, validRef } from "@/lib/referral";
import { readJsonObject, sameOriginMutation } from "@/lib/request-security";
import { allowRate, clientRateKey, onceToday } from "@/lib/rate-limit";

// Counts a visit: { visitor: "new" | "returning" } once per browser per day, and { ref: "<tag>" } once
// per tag per day when the visit arrived with ?ref=<tag>. The page sends each at most once a day. The server
// also counts each network address + browser kind at most once a day, so refreshing after clearing storage,
// new private windows or a script cannot inflate the numbers. The keys are hashed and deleted after a day
// by the background run; the counts themselves keep nothing about the visitor.

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
    const countVisitor = visitor !== undefined && await onceToday(request, "visitor");
    const countRef = ref !== undefined && await onceToday(request, `ref-${ref}`);
    const writes = [];
    if (countVisitor) writes.push(env.DB.prepare("INSERT INTO site_visits (day, visitors, new_visitors) VALUES (?, 1, ?) ON CONFLICT(day) DO UPDATE SET visitors = visitors + 1, new_visitors = new_visitors + excluded.new_visitors")
      .bind(day, visitor === "new" ? 1 : 0));
    if (countRef) writes.push(env.DB.prepare("INSERT INTO referral_visits (day, ref, visits) VALUES (?, ?, 1) ON CONFLICT(day, ref) DO UPDATE SET visits = visits + 1")
      .bind(day, ref));
    if (writes.length) await env.DB.batch(writes);
    return Response.json({ counted: writes.length > 0 });
  } catch {
    return Response.json({ error: "The visit could not be counted." }, { status: 503 });
  }
}
