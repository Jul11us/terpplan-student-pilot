"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminStats } from "@/lib/admin";
import { readSavedState } from "@/lib/saved-state";

type Language = "en" | "zh";
type State = { status: "loading" } | { status: "signedOut" } | { status: "notConfigured" } | { status: "forbidden" } | { status: "error" } | { status: "ok"; stats: AdminStats };

const copy = {
  en: {
    eyebrow: "Owner only", title: "Seat alert sign-ups", back: "← TerpPlan", refresh: "Refresh",
    loading: "Loading…", error: "The numbers could not be loaded. Try again shortly.",
    signedOut: "Sign in with your email on TerpPlan's Seat alerts tab first, then come back to this page.",
    notConfigured: "Admin access is not set up. Add an ADMIN_EMAILS setting (your email; several are separated by commas) to the site's environment, redeploy, and sign in with that email.",
    forbidden: "This account cannot view these numbers. Sign in with an email listed in ADMIN_EMAILS.",
    subscribers: "Seat emails on", subscribersNote: "{n} new in the last 7 days",
    watching: "Signed in with watches", watchingNote: "{n} of the email sign-ups watch at least one section",
    watches: "Watches", watchesNote: "{n} different sections",
    alerts: "Emails sent (7 days)", alertsNote: "{n} waiting to send",
    byDay: "New seat-email sign-ups, last 30 days", noneDay: "No sign-ups in the last 30 days.",
    byTerm: "Watches by term", term: "Term", students: "Students", count: "Watches",
    top: "Most watched courses", course: "Course",
    recent: "Latest sign-ups", recentNote: "Addresses are masked.", email: "Email", since: "Signed up", sections: "Watches", noneRecent: "No one has turned seat emails on yet.",
    updated: "Updated {t}",
  },
  zh: {
    eyebrow: "仅站长可见", title: "余位邮件通知注册情况", back: "← 返回 TerpPlan", refresh: "刷新",
    loading: "加载中…", error: "暂时无法读取数据，请稍后再试。",
    signedOut: "请先在 TerpPlan 的“余位提醒”页用邮箱登录，再回到这个页面。",
    notConfigured: "还没有设置管理员。在站点环境变量里添加 ADMIN_EMAILS（填你的邮箱，多个用逗号隔开），重新部署后用这个邮箱登录。",
    forbidden: "这个账号不能查看这些数据。请用 ADMIN_EMAILS 里的邮箱登录。",
    subscribers: "开通余位邮件", subscribersNote: "最近 7 天新增 {n} 人",
    watching: "登录并关注了班次", watchingNote: "开通邮件的人里有 {n} 人至少关注了一个班次",
    watches: "关注总数", watchesNote: "涉及 {n} 个不同班次",
    alerts: "已发提醒（7 天）", alertsNote: "{n} 封等待发送",
    byDay: "最近 30 天每天新开通邮件的人数", noneDay: "最近 30 天没有新注册。",
    byTerm: "按学期的关注", term: "学期", students: "人数", count: "关注数",
    top: "关注最多的课程", course: "课程",
    recent: "最近注册", recentNote: "邮箱已部分隐藏。", email: "邮箱", since: "注册时间", sections: "关注数", noneRecent: "还没有人开通余位邮件。",
    updated: "更新于 {t}",
  },
} as const;

const TERM_NAMES = { en: { "01": "Spring", "05": "Summer", "08": "Fall", "12": "Winter" }, zh: { "01": "春季", "05": "夏季", "08": "秋季", "12": "冬季" } } as const;
const termLabel = (term: string, language: Language) => {
  const name = TERM_NAMES[language][term.slice(4) as "01"] ?? term.slice(4);
  return language === "zh" ? `${term.slice(0, 4)} ${name}` : `${name} ${term.slice(0, 4)}`;
};
// D1 stores "YYYY-MM-DD HH:MM:SS" in UTC; show it in Eastern time like the rest of the site.
const easternTime = (value: string, language: Language) => {
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(language === "zh" ? "zh-CN" : "en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

export default function AdminPage() {
  const [language, setLanguage] = useState<Language>("zh");
  const [state, setState] = useState<State>({ status: "loading" });
  const [reload, setReload] = useState(0);
  const t = copy[language];

  useEffect(() => {
    const saved = readSavedState().language;
    // Restoring the saved language after the first render keeps the server and client HTML the same.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "en" || saved === "zh") setLanguage(saved);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/stats", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as AdminStats & { code?: string };
        if (!active) return;
        if (response.status === 401) setState({ status: "signedOut" });
        else if (response.status === 403) setState({ status: body.code === "notConfigured" ? "notConfigured" : "forbidden" });
        else if (!response.ok) setState({ status: "error" });
        else setState({ status: "ok", stats: body });
      })
      .catch(() => { if (active) setState({ status: "error" }); });
    return () => { active = false; };
  }, [reload]);

  const stats = state.status === "ok" ? state.stats : null;
  const maxDay = Math.max(1, ...(stats?.signupsByDay.map((row) => row.count) ?? [1]));

  return <main className="min-h-screen bg-[#f4f2ed] px-4 py-8 text-[#202728] sm:px-6">
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="text-xs font-medium text-[#a34a39] hover:underline">{t.back}</Link>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[.13em] text-[#9a5040]">{t.eyebrow}</p>
          <h1 className="mt-2 font-serif text-3xl">{t.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setLanguage(language === "zh" ? "en" : "zh")} className="rounded-lg border border-[#d9d6ce] px-3 py-1.5 text-xs font-semibold text-[#48534f] hover:bg-white">{language === "zh" ? "English" : "中文"}</button>
          {stats && <button type="button" onClick={() => { setState({ status: "loading" }); setReload((value) => value + 1); }} className="rounded-lg bg-[#273c38] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d302c]">{t.refresh}</button>}
        </div>
      </div>

      {state.status !== "ok" && <p role={state.status === "loading" ? "status" : "alert"} className={`mt-6 rounded-xl border px-4 py-3 text-sm ${state.status === "loading" ? "border-[#e0ddd5] bg-[#fbfaf8] text-[#5d6561]" : "border-[#ead8b5] bg-[#fff8e8] text-[#745424]"}`}>{t[state.status]}</p>}

      {stats && <>
        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [t.subscribers, stats.subscribers, t.subscribersNote.replace("{n}", String(stats.subscribersLast7Days))],
            [t.watching, stats.signedInWithWatches, t.watchingNote.replace("{n}", String(stats.subscribersWithWatches))],
            [t.watches, stats.watches, t.watchesNote.replace("{n}", String(stats.watchedSections))],
            [t.alerts, stats.alertsSentLast7Days, t.alertsNote.replace("{n}", String(stats.alertsPending))],
          ].map(([label, value, note]) => <div key={String(label)} className="rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-4">
            <p className="text-xs font-medium text-[#5d6561]">{label}</p>
            <p className="mt-1 font-serif text-3xl text-[#24312d]">{value}</p>
            <p className="mt-1 text-[11px] text-[#646c68]">{note}</p>
          </div>)}
        </section>

        <section className="mt-4 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5">
          <h2 className="text-sm font-semibold text-[#24312d]">{t.byDay}</h2>
          {stats.signupsByDay.length ? <ul className="mt-3 space-y-1.5">{stats.signupsByDay.map((row) => <li key={row.day} className="grid grid-cols-[5.5rem_minmax(0,1fr)_2rem] items-center gap-3 text-xs">
            <span className="text-[#5d6561]">{row.day.slice(5)}</span>
            <span className="h-2.5 rounded-full bg-[#ece9e2]"><span className="block h-full rounded-full bg-[#536d64]" style={{ width: `${(row.count / maxDay) * 100}%` }} /></span>
            <span className="text-right font-semibold text-[#24312d]">{row.count}</span>
          </li>)}</ul> : <p className="mt-2 text-xs text-[#646c68]">{t.noneDay}</p>}
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5">
            <h2 className="text-sm font-semibold text-[#24312d]">{t.byTerm}</h2>
            <table className="mt-3 w-full text-xs"><thead><tr className="border-b border-[#ece9e2] text-left text-[#5d6561]"><th className="py-1.5 font-medium">{t.term}</th><th className="py-1.5 text-right font-medium">{t.students}</th><th className="py-1.5 text-right font-medium">{t.count}</th></tr></thead>
              <tbody>{stats.watchesByTerm.map((row) => <tr key={row.term} className="border-b border-[#f0ede7]"><td className="py-1.5">{termLabel(row.term, language)}</td><td className="py-1.5 text-right">{row.students}</td><td className="py-1.5 text-right">{row.watches}</td></tr>)}</tbody></table>
          </section>
          <section className="rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5">
            <h2 className="text-sm font-semibold text-[#24312d]">{t.top}</h2>
            <table className="mt-3 w-full text-xs"><thead><tr className="border-b border-[#ece9e2] text-left text-[#5d6561]"><th className="py-1.5 font-medium">{t.course}</th><th className="py-1.5 text-right font-medium">{t.students}</th></tr></thead>
              <tbody>{stats.topCourses.map((row) => <tr key={row.courseId} className="border-b border-[#f0ede7]"><td className="py-1.5"><span className="font-semibold">{row.courseId}</span> <span className="text-[#646c68]">{row.courseTitle}</span></td><td className="py-1.5 text-right">{row.students}</td></tr>)}</tbody></table>
          </section>
        </div>

        <section className="mt-4 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5">
          <h2 className="text-sm font-semibold text-[#24312d]">{t.recent} <span className="font-normal text-[#646c68]">· {t.recentNote}</span></h2>
          {stats.recentSubscribers.length ? <table className="mt-3 w-full text-xs"><thead><tr className="border-b border-[#ece9e2] text-left text-[#5d6561]"><th className="py-1.5 font-medium">{t.email}</th><th className="py-1.5 font-medium">{t.since}</th><th className="py-1.5 text-right font-medium">{t.sections}</th></tr></thead>
            <tbody>{stats.recentSubscribers.map((row, index) => <tr key={index} className="border-b border-[#f0ede7]"><td className="py-1.5">{row.email}</td><td className="py-1.5 text-[#5d6561]">{easternTime(row.createdAt, language)}</td><td className="py-1.5 text-right">{row.watches}</td></tr>)}</tbody></table>
            : <p className="mt-2 text-xs text-[#646c68]">{t.noneRecent}</p>}
        </section>

        <p className="mt-4 text-[11px] text-[#646c68]">{t.updated.replace("{t}", easternTime(stats.generatedAt, language))} ET</p>
      </>}
    </div>
  </main>;
}
