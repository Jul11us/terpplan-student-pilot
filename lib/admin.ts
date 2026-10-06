// The owner's view of seat-alert sign-ups (/admin). Only signed-in accounts whose email is listed in the
// ADMIN_EMAILS setting (comma separated) can read it; the addresses never appear in the code.
//
// The numbers are counts. The recent sign-up list masks each address ("j•••@gmail.com"), so the page can be
// shown on screen without exposing students' emails.

import { env } from "cloudflare:workers";
import { hashEmail, type CurrentUser } from "@/lib/auth";
import { easternDay } from "@/lib/referral";

export type AdminAccess = "ok" | "notConfigured" | "forbidden";

export async function adminAccess(user: CurrentUser): Promise<AdminAccess> {
  const emails = (env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!emails.length || !env.EMAIL_AUTH_SECRET) return "notConfigured";
  for (const email of emails) if (`email:${await hashEmail(email)}` === user.id) return "ok";
  return "forbidden";
}

// "owner@example.test" -> "o•••@example.test".
export function maskEmail(email: string) {
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
}

export type AdminStats = {
  subscribers: number;
  subscribersLast7Days: number;
  subscribersWithWatches: number;
  signedInWithWatches: number;
  watches: number;
  watchedSections: number;
  alertsSentLast7Days: number;
  alertsPending: number;
  signupsByDay: { day: string; count: number }[];
  watchesByTerm: { term: string; watches: number; students: number }[];
  topCourses: { courseId: string; courseTitle: string; students: number }[];
  recentSubscribers: { email: string; createdAt: string; watches: number }[];
  // Visits that came in with ?ref= (QR codes, shared links): totals per tag, and per day for 30 days.
  referrals: { ref: string; total: number; last7Days: number; today: number }[];
  referralsByDay: { day: string; ref: string; visits: number }[];
  // Everyone who opened the site: browsers per day, and how many of them were there for the first time.
  visitors: { today: number; newToday: number; last7Days: number; last30Days: number; newTotal: number; since: string | null };
  visitorsByDay: { day: string; visitors: number; newVisitors: number }[];
  generatedAt: string;
};

async function first<T>(query: string, ...values: unknown[]) {
  return (await env.DB!.prepare(query).bind(...values).first()) as T;
}

async function all<T>(query: string, ...values: unknown[]) {
  return ((await env.DB!.prepare(query).bind(...values).all()).results ?? []) as T[];
}

export async function adminStats(now = new Date()): Promise<AdminStats> {
  if (!env.DB) throw new Error("Database unavailable.");
  // created_at is SQLite's "YYYY-MM-DD HH:MM:SS" (UTC); alert_sent_at is an ISO timestamp.
  const sqliteTime = (date: Date) => date.toISOString().slice(0, 19).replace("T", " ");
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
  // referral_visits days are Eastern-time dates.
  const today = easternDay(now), weekStart = easternDay(new Date(now.getTime() - 6 * 86_400_000)), monthStart = easternDay(monthAgo);
  const [subs, watchTotals, alerts, signupsByDay, watchesByTerm, topCourses, recent, referrals, referralsByDay, visitorTotals, visitorsByDay] = await Promise.all([
    first<{ total: number; recent: number; watching: number }>(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS recent,
        SUM(CASE WHEN user_id IN (SELECT user_id FROM watches) THEN 1 ELSE 0 END) AS watching
       FROM alert_subscriptions`, sqliteTime(weekAgo)),
    first<{ users: number; watches: number; sections: number }>(
      "SELECT COUNT(DISTINCT user_id) AS users, COUNT(*) AS watches, COUNT(DISTINCT term || '|' || section_id) AS sections FROM watches"),
    first<{ sent: number; pending: number }>(
      "SELECT SUM(CASE WHEN alert_sent_at >= ? THEN 1 ELSE 0 END) AS sent, SUM(CASE WHEN alert_pending_at IS NOT NULL THEN 1 ELSE 0 END) AS pending FROM watches",
      weekAgo.toISOString()),
    all<{ day: string; count: number }>(
      "SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count FROM alert_subscriptions WHERE created_at >= ? GROUP BY day ORDER BY day",
      sqliteTime(monthAgo)),
    all<{ term: string; watches: number; students: number }>(
      "SELECT term, COUNT(*) AS watches, COUNT(DISTINCT user_id) AS students FROM watches GROUP BY term ORDER BY term DESC"),
    all<{ courseId: string; courseTitle: string; students: number }>(
      `SELECT course_id AS courseId, MAX(course_title) AS courseTitle, COUNT(DISTINCT user_id) AS students
       FROM watches GROUP BY course_id ORDER BY students DESC, course_id LIMIT 10`),
    all<{ email: string; createdAt: string; watches: number }>(
      `SELECT s.email AS email, s.created_at AS createdAt, (SELECT COUNT(*) FROM watches w WHERE w.user_id = s.user_id) AS watches
       FROM alert_subscriptions s ORDER BY s.created_at DESC LIMIT 20`),
    all<{ ref: string; total: number; last7Days: number; today: number }>(
      `SELECT ref, SUM(visits) AS total, SUM(CASE WHEN day >= ? THEN visits ELSE 0 END) AS last7Days, SUM(CASE WHEN day = ? THEN visits ELSE 0 END) AS today
       FROM referral_visits GROUP BY ref ORDER BY total DESC, ref LIMIT 50`, weekStart, today),
    all<{ day: string; ref: string; visits: number }>(
      "SELECT day, ref, visits FROM referral_visits WHERE day >= ? ORDER BY day, ref", monthStart),
    first<{ today: number; newToday: number; last7Days: number; last30Days: number; newTotal: number; since: string | null }>(
      `SELECT SUM(CASE WHEN day = ? THEN visitors ELSE 0 END) AS today, SUM(CASE WHEN day = ? THEN new_visitors ELSE 0 END) AS newToday,
        SUM(CASE WHEN day >= ? THEN visitors ELSE 0 END) AS last7Days, SUM(CASE WHEN day >= ? THEN visitors ELSE 0 END) AS last30Days,
        SUM(new_visitors) AS newTotal, MIN(day) AS since FROM site_visits`, today, today, weekStart, monthStart),
    all<{ day: string; visitors: number; newVisitors: number }>(
      "SELECT day, visitors, new_visitors AS newVisitors FROM site_visits WHERE day >= ? ORDER BY day", monthStart),
  ]);
  return {
    subscribers: subs?.total ?? 0,
    subscribersLast7Days: subs?.recent ?? 0,
    subscribersWithWatches: subs?.watching ?? 0,
    signedInWithWatches: watchTotals?.users ?? 0,
    watches: watchTotals?.watches ?? 0,
    watchedSections: watchTotals?.sections ?? 0,
    alertsSentLast7Days: alerts?.sent ?? 0,
    alertsPending: alerts?.pending ?? 0,
    signupsByDay,
    watchesByTerm,
    topCourses,
    recentSubscribers: recent.map((row) => ({ ...row, email: maskEmail(row.email) })),
    referrals,
    referralsByDay,
    visitors: {
      today: visitorTotals?.today ?? 0, newToday: visitorTotals?.newToday ?? 0, last7Days: visitorTotals?.last7Days ?? 0,
      last30Days: visitorTotals?.last30Days ?? 0, newTotal: visitorTotals?.newTotal ?? 0, since: visitorTotals?.since ?? null,
    },
    visitorsByDay,
    generatedAt: now.toISOString(),
  };
}
