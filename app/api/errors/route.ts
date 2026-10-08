import { env } from "cloudflare:workers";
import { validClientError } from "@/lib/error-kinds";
import { countError } from "@/lib/error-counts";
import { allowRate, clientRateKey } from "@/lib/rate-limit";
import { readJsonObject, sameOriginMutation } from "@/lib/request-security";

// Counts one failure seen in a visitor's browser: { kind: "search" | "schedule" | ... } (lib/error-kinds.ts).
// Only the hour's count per kind is stored; each network address can add at most 30 an hour.
export async function POST(request: Request) {
  const denied = sameOriginMutation(request);
  if (denied) return denied;
  const parsed = await readJsonObject(request, 256);
  if (parsed.error) return parsed.error;
  const { kind } = parsed.value;
  if (!validClientError(kind)) return Response.json({ error: "Unknown kind." }, { status: 400 });
  if (!env.DB) return Response.json({ error: "Counting is not available." }, { status: 503 });
  try {
    if (!await allowRate(await clientRateKey(request, "errors"), 30, 3600)) return Response.json({ counted: false }, { status: 429 });
    await countError(kind);
    return Response.json({ counted: true });
  } catch {
    return Response.json({ error: "Not counted." }, { status: 503 });
  }
}
