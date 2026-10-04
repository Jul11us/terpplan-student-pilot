import { syncPlanActivity } from "@/lib/history-db";
import { courseIdIsValid } from "@/lib/umd";

export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Use this page to share counts." }, { status: 403 });
  const text = await request.text();
  if (text.length > 4096) return Response.json({ error: "Request is too large." }, { status: 413 });
  let body;
  try { body = JSON.parse(text); } catch { return Response.json({ error: "Send a JSON request." }, { status: 400 }); }
  if (!body || typeof body !== "object" || typeof body.term !== "string" || !/^\d{6}$/.test(body.term) || typeof body.id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.id) || !Array.isArray(body.courseIds) || body.courseIds.length > 20 || body.courseIds.some((id: unknown) => typeof id !== "string" || !courseIdIsValid(id)) || body.withdraw !== undefined && typeof body.withdraw !== "boolean") return Response.json({ error: "Choose a valid term, browser ID and up to 20 course codes." }, { status: 400 });
  try {
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.id))), (byte) => byte.toString(16).padStart(2, "0")).join("");
    await syncPlanActivity(body.term, [...new Set<string>(body.courseIds)], hash, body.withdraw === true);
    return Response.json({ updated: true });
  } catch { return Response.json({ error: "Shared counts could not be updated." }, { status: 503 }); }
}
