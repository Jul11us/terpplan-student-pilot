import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { alertSubscriptions, watches } from "@/db/schema";
import { hashToken } from "@/lib/alerts";
import { readJsonObject } from "@/lib/request-security";

// Stops seat emails for the account behind an unsubscribe token. Only POST changes anything:
// the confirm page posts here, and so do mail clients using one-click List-Unsubscribe.
// Email link scanners only send GET, so they cannot unsubscribe anyone by accident.
export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("token") ?? "";
  if (!token && request.headers.get("content-type")?.includes("application/json")) {
    const parsed = await readJsonObject(request);
    if (parsed.error) return parsed.error;
    token = typeof parsed.value.token === "string" ? parsed.value.token : "";
  }
  if (!/^[a-f0-9]{64}$/.test(token)) return Response.json({ error: "This link is not valid." }, { status: 400 });
  const db = getDb();
  const [removed] = await db.delete(alertSubscriptions)
    .where(eq(alertSubscriptions.unsubscribeTokenHash, await hashToken(token)))
    .returning({ userId: alertSubscriptions.userId });
  if (removed) await db.update(watches).set({ alertPendingAt: null }).where(eq(watches.userId, removed.userId));
  // Same answer whether or not it was subscribed, so the endpoint reveals nothing.
  return Response.json({ ok: true });
}
