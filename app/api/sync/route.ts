import { env } from "cloudflare:workers";
import { authRequired, currentUser } from "@/lib/auth";
import { MAX_SYNC_BYTES, parseSyncState } from "@/lib/plan-sync";
import { allowRate } from "@/lib/rate-limit";
import { readJsonObject, sameOriginMutation } from "@/lib/request-security";

// A signed-in student's planner data (see lib/plan-sync.ts). GET returns the account's copy, PUT replaces it
// when the sent copy is newer (or when the student chose this device's copy), DELETE removes it.

const NO_STORE = { "Cache-Control": "private, no-store" };

// A short id for "which account was this", so a browser notices when someone else signs in on it.
async function accountTag(userId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`sync:${userId}`));
  return Array.from(new Uint8Array(digest).slice(0, 8), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function stored(userId: string) {
  return await env.DB!.prepare("SELECT state, updated_at AS updatedAt FROM plan_sync WHERE user_id = ?").bind(userId).first<{ state: string; updatedAt: string }>();
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return authRequired();
  if (!env.DB) return Response.json({ error: "Sync is not available." }, { status: 503, headers: NO_STORE });
  try {
    const row = await stored(user.id);
    return Response.json({ account: await accountTag(user.id), state: row ? parseSyncState(JSON.parse(row.state)) : null, updatedAt: row?.updatedAt ?? null }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Your synced plan could not be loaded." }, { status: 503, headers: NO_STORE });
  }
}

export async function PUT(request: Request) {
  const denied = sameOriginMutation(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return authRequired();
  if (!env.DB) return Response.json({ error: "Sync is not available." }, { status: 503, headers: NO_STORE });
  const parsed = await readJsonObject(request, MAX_SYNC_BYTES + 1024);
  if (parsed.error) return parsed.error;
  const state = parseSyncState(parsed.value.state);
  const updatedAt = typeof parsed.value.updatedAt === "string" && !Number.isNaN(Date.parse(parsed.value.updatedAt)) ? new Date(parsed.value.updatedAt) : null;
  if (!state || !updatedAt) return Response.json({ error: "Send the plan and when it changed." }, { status: 400, headers: NO_STORE });
  // A device clock far ahead would otherwise win every comparison from then on.
  const when = new Date(Math.min(updatedAt.getTime(), Date.now() + 60_000)).toISOString();
  const text = JSON.stringify(state);
  if (text.length > MAX_SYNC_BYTES) return Response.json({ error: "This plan is too large to sync." }, { status: 413, headers: NO_STORE });
  try {
    if (!await allowRate(`sync:${await accountTag(user.id)}`, 240, 3600)) return Response.json({ error: "Too many saves; try again in a few minutes." }, { status: 429, headers: NO_STORE });
    // Newer wins; force (the student chose this device's copy over the account's) always replaces it.
    const force = parsed.value.force === true;
    const result = await env.DB.prepare(`INSERT INTO plan_sync (user_id, state, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
      WHERE ? OR plan_sync.updated_at < excluded.updated_at`).bind(user.id, text, when, force ? 1 : 0).run();
    if (!result.meta.changes) {
      const row = await stored(user.id);
      return Response.json({ error: "Your account has a newer copy.", state: row ? parseSyncState(JSON.parse(row.state)) : null, updatedAt: row?.updatedAt ?? null }, { status: 409, headers: NO_STORE });
    }
    return Response.json({ saved: true, updatedAt: when }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "Your plan could not be synced." }, { status: 503, headers: NO_STORE });
  }
}

export async function DELETE(request: Request) {
  const denied = sameOriginMutation(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return authRequired();
  if (!env.DB) return Response.json({ error: "Sync is not available." }, { status: 503, headers: NO_STORE });
  try {
    await env.DB.prepare("DELETE FROM plan_sync WHERE user_id = ?").bind(user.id).run();
    return Response.json({ deleted: true }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "The synced copy could not be deleted." }, { status: 503, headers: NO_STORE });
  }
}
