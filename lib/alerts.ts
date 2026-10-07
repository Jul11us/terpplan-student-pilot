import { env } from "cloudflare:workers";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { alertSubscriptions, watches } from "@/db/schema";
import { SITE_URL } from "@/lib/site-config";
import { openingPath } from "@/lib/seat-swap";

type Db = ReturnType<typeof getDb>;

// Caps that keep one account from exhausting the shared sending quota. The background check reads each
// course once however many of its sections are watched, so the main cap is on courses; watching "any
// section" of a course adds several sections at once.
export const MAX_WATCHED_COURSES_PER_USER = 10;
export const MAX_WATCHES_PER_USER = 40;
export const MAX_SECTIONS_PER_REQUEST = 20;
const MAX_EMAILS_PER_USER_PER_DAY = 20;
// An opening older than this is probably gone; drop it rather than send a stale email.
const PENDING_TTL_MS = 60 * 60_000;
// Watches are removed this long after they were created (roughly one term).
export const WATCH_LIFETIME_DAYS = 150;

const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");

export function alertsConfigured() {
  return Boolean(env.EMAIL_AUTH_SECRET && env.RESEND_API_KEY && env.EMAIL_FROM);
}

// The unsubscribe token is derived from the account with the server secret, so it never has to be
// stored in plain form; the table keeps only its SHA-256 for lookup.
export async function unsubscribeToken(userId: string) {
  if (!env.EMAIL_AUTH_SECRET) throw new Error("Email is not configured.");
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.EMAIL_AUTH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`unsubscribe:${userId}`)));
}

export async function hashToken(token: string) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
}

export function unsubscribeUrl(token: string) {
  return `${SITE_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
}

function oneClickUnsubscribeUrl(token: string) {
  return `${SITE_URL}/api/alerts/unsubscribe?token=${encodeURIComponent(token)}`;
}

function easternDate(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function easternTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

type PendingRow = typeof watches.$inferSelect;

export function alertEmail(rows: PendingRow[], token: string) {
  const link = unsubscribeUrl(token);
  const lines = rows.map((row) => `${row.sectionId} · ${row.courseTitle} · ${row.openSeats} open ${row.openSeats === 1 ? "seat" : "seats"} (read ${easternTime(row.lastSuccessAt)})`);
  // Each section links to the planner, which checks it against the schedule saved on that device.
  const checks = rows.map((row) => SITE_URL + openingPath(row.term, row.sectionId));
  const subject = rows.length === 1 ? `Seat open: ${rows[0]!.sectionId}` : `Seats open in ${rows.length} sections you watch`;
  const text = [
    "A seat opened in a section you are watching on TerpPlan:",
    "",
    ...lines.flatMap((line, index) => [`- ${line}`, `  Fits my schedule? / 适合我的课表吗？ ${checks[index]}`]),
    "",
    "Seat data can lag, so the seat may already be taken. Register in Testudo as soon as you can: https://app.testudo.umd.edu/",
    "To compare it with your schedule first, open the link above on the device where you plan in TerpPlan.",
    "",
    "你在 TerpPlan 关注的班次出现了空位。数据可能有延迟，打开时位置可能已被占用，请尽快在 Testudo 注册。",
    "想先看看是否和课表冲突，请在你用 TerpPlan 排课的设备上打开上面的链接。",
    "",
    `You get one email each time a full section opens. Stop these emails / 停止提醒: ${link}`,
  ].join("\n");
  const html = `<p>A seat opened in a section you are watching on TerpPlan:</p>
<ul>${lines.map((line, index) => `<li>${escapeHtml(line)}<br><a href="${escapeHtml(checks[index]!)}">Fits my schedule? / 适合我的课表吗？</a></li>`).join("")}</ul>
<p>Seat data can lag, so the seat may already be taken. <a href="https://app.testudo.umd.edu/"><strong>Register in Testudo</strong></a> as soon as you can. To compare it with your schedule first, open "Fits my schedule?" on the device where you plan in TerpPlan.</p>
<p>你在 TerpPlan 关注的班次出现了空位。数据可能有延迟，打开时位置可能已被占用，请尽快<a href="https://app.testudo.umd.edu/"><strong>在 Testudo 注册</strong></a>。想先看看是否和课表冲突，请在你用 TerpPlan 排课的设备上点“适合我的课表吗？”。</p>
<p style="color:#777;font-size:12px">You get one email each time a full section opens. <a href="${escapeHtml(link)}">Stop these emails / 停止提醒</a></p>`;
  return { subject, text, html, link, oneClickLink: oneClickUnsubscribeUrl(token) };
}

async function sendEmail(to: string, message: ReturnType<typeof alertEmail>) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject: message.subject,
      text: message.text,
      html: message.html,
      // One-click unsubscribe for mail clients; it is a POST, which link scanners do not send.
      headers: { "List-Unsubscribe": `<${message.oneClickLink}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  return response.ok;
}

// Sends one email per student covering every section that opened since the last run.
export async function sendPendingAlerts(db: Db) {
  const summary = { emailsSent: 0, emailsFailed: 0, alertsDropped: 0 };
  const pending = await db.select().from(watches).where(isNotNull(watches.alertPendingAt));
  if (!pending.length) return summary;
  const now = Date.now();
  const clear = (rows: PendingRow[], sent: boolean) => Promise.all(rows.map((row) => db.update(watches)
    .set({ alertPendingAt: null, ...(sent ? { alertSentAt: new Date().toISOString() } : {}) })
    .where(and(eq(watches.userId, row.userId), eq(watches.term, row.term), eq(watches.sectionId, row.sectionId)))));

  const byUser = new Map<string, PendingRow[]>();
  for (const row of pending) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
  const subscriptions = await db.select().from(alertSubscriptions).where(inArray(alertSubscriptions.userId, [...byUser.keys()]));
  const subscriptionFor = new Map(subscriptions.map((item) => [item.userId, item]));

  for (const [userId, rows] of byUser) {
    const subscription = subscriptionFor.get(userId);
    const fresh = rows.filter((row) => now - Date.parse(row.alertPendingAt!) < PENDING_TTL_MS && (row.openSeats ?? 0) > 0);
    const today = easternDate();
    const sentToday = subscription?.dailyDate === today ? subscription.dailyCount : 0;
    if (!subscription || !fresh.length || !alertsConfigured() || sentToday >= MAX_EMAILS_PER_USER_PER_DAY) {
      // Not opted in, stale, or over today's cap: drop the alert so it is not sent later by surprise.
      await clear(rows, false);
      summary.alertsDropped += rows.length;
      continue;
    }
    const message = alertEmail(fresh, await unsubscribeToken(userId));
    if (!(await sendEmail(subscription.email, message))) {
      // Leave it pending; the next run retries until the opening is an hour old.
      summary.emailsFailed += 1;
      continue;
    }
    await clear(fresh, true);
    await clear(rows.filter((row) => !fresh.includes(row)), false);
    await db.update(alertSubscriptions)
      .set({ dailyDate: today, dailyCount: sentToday + 1 })
      .where(eq(alertSubscriptions.userId, userId));
    summary.emailsSent += 1;
  }
  return summary;
}

export async function removeExpiredWatches(db: Db) {
  const removed = await db.delete(watches)
    .where(sql`${watches.createdAt} < datetime('now', ${`-${WATCH_LIFETIME_DAYS} days`})`)
    .returning({ sectionId: watches.sectionId });
  return removed.length;
}
