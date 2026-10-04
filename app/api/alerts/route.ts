import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { alertSubscriptions, watches } from "@/db/schema";
import { alertsConfigured, hashToken, unsubscribeToken } from "@/lib/alerts";
import { authRequired, currentUser, hashEmail } from "@/lib/auth";
import { readJsonObject, sameOriginMutation } from "@/lib/request-security";

// Seat-email opt-in for the signed-in student. The address is stored only after they turn this on.

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return authRequired();
  const [row] = await getDb().select({ userId: alertSubscriptions.userId }).from(alertSubscriptions).where(eq(alertSubscriptions.userId, user.id));
  return Response.json({ configured: alertsConfigured(), enabled: Boolean(row) });
}

export async function POST(request: Request) {
  const denied = sameOriginMutation(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return authRequired();
  if (!alertsConfigured()) return Response.json({ error: "Seat emails are not set up yet." }, { status: 503 });
  const parsed = await readJsonObject(request);
  if (parsed.error) return parsed.error;
  const body = parsed.value;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  // The session holds only a hash, so the student re-enters the address and it must match the verified one.
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || `email:${await hashEmail(email)}` !== user.id) {
    return Response.json({ error: "Enter the same email you signed in with.", code: "emailMismatch" }, { status: 400 });
  }
  const tokenHash = await hashToken(await unsubscribeToken(user.id));
  await getDb().insert(alertSubscriptions)
    .values({ userId: user.id, email, unsubscribeTokenHash: tokenHash })
    .onConflictDoUpdate({ target: alertSubscriptions.userId, set: { email, unsubscribeTokenHash: tokenHash } });
  return Response.json({ enabled: true });
}

export async function DELETE(request: Request) {
  const denied = sameOriginMutation(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return authRequired();
  const db = getDb();
  await db.delete(alertSubscriptions).where(eq(alertSubscriptions.userId, user.id));
  await db.update(watches).set({ alertPendingAt: null }).where(eq(watches.userId, user.id));
  return Response.json({ enabled: false });
}
