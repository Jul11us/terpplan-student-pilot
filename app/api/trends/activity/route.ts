import { syncPlanActivity } from "@/lib/history-db";
import { courseIdIsValid } from "@/lib/umd";
import { readJsonObject, sameOriginMutation } from "@/lib/request-security";
import { allowRate, clientRateKey } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const denied = sameOriginMutation(request);
  if (denied) return denied;
  const parsed = await readJsonObject(request);
  if (parsed.error) return parsed.error;
  const body = parsed.value;
  if (!body || typeof body !== "object" || typeof body.term !== "string" || !/^\d{6}$/.test(body.term) || typeof body.id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.id) || !Array.isArray(body.courseIds) || body.courseIds.length > 20 || body.courseIds.some((id: unknown) => typeof id !== "string" || !courseIdIsValid(id)) || body.withdraw !== undefined && typeof body.withdraw !== "boolean") return Response.json({ error: "Choose a valid term, browser ID and up to 20 course codes." }, { status: 400 });
  try {
    if (!await allowRate(await clientRateKey(request, "activity"), 120, 60)) return Response.json({ error: "Too many changes. Please try again in a minute." }, { status: 429 });
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.id))), (byte) => byte.toString(16).padStart(2, "0")).join("");
    await syncPlanActivity(body.term, [...new Set<string>(body.courseIds)], hash, body.withdraw === true);
    return Response.json({ updated: true });
  } catch { return Response.json({ error: "Shared counts could not be updated." }, { status: 503 }); }
}
