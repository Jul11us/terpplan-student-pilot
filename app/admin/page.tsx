"use client";

import { useEffect, useState } from "react";
import { useDocumentLanguage } from "@/lib/document-language";
import Link from "next/link";
import type { AdminStats } from "@/lib/admin";
import { readSavedState } from "@/lib/saved-state";

type Language = "en" | "zh";
type State = { status: "loading" } | { status: "signedOut" } | { status: "notConfigured" } | { status: "forbidden" } | { status: "error" } | { status: "ok"; stats: AdminStats };

const copy = {
  en: {
    eyebrow: "Owner only", title: "Site numbers", back: "← TerpPlan", refresh: "Refresh",
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
    referrals: "Visits from links and QR codes", referralsNote: "Counted when someone opens a link with ?ref=<tag>, once per browser per day. Add your own tags to new links, e.g. terpplan.com/?ref=wechat.",
    refTag: "Tag", refToday: "Today", ref7: "Last 7 days", refTotal: "All time", refDaily: "Per day, last 30 days", noReferrals: "No tagged visits yet. Share terpplan.com/?ref=qr (the QR code) and they will show up here.",
    visits: "Visitors", visitsNote: "Each browser counts once a day; \"new\" means it had never opened TerpPlan before. Counting started {d}.",
    visitsNoteEmpty: "Each browser counts once a day; \"new\" means it had never opened TerpPlan before. No visits counted yet.",
    vToday: "Today", vTodayNote: "{n} new", v7: "Last 7 days", v7Note: "visitor-days", v30: "Last 30 days", v30Note: "visitor-days", vPeople: "Different people so far", vPeopleNote: "first-time browsers since counting began",
    vDaily: "Per day, last 30 days", vNew: "New", vReturning: "Returning", vTotal: "Total", alertsHeading: "Seat alert emails",
    usage: "What people use", usageNote: "Each browser counts once a day per item; nothing done in the sample counts. Counting started {d}.", usageNoteEmpty: "Each browser counts once a day per item; nothing done in the sample counts. Nothing counted yet.",
    uItem: "Did this", uToday: "Today", u7: "Last 7 days", u30: "Last 30 days", uShare: "Of visitors (7 days)",
    features: { planner: "Opened the planner", course: "Added a course", schedule: "Saw schedule options", share: "Shared a schedule or plan link", calendar: "Exported to calendar", alert: "Turned on a seat alert", signin: "Signed in with email", register: "Opened the registration-day page", hard: "Looked at the hardest courses", demo: "Tried the sample" },
    race: "How fast courses fill · {term}", raceNote: "The background run reads the 60 hardest courses to get, the 30 most planned and every watched course each half hour, and other courses students opened every two hours. \"Started\" is the first reading with more seats taken than when TerpPlan began reading the course; \"full\" is 2% of seats or fewer left (courses of 30+ seats).",
    rCourses: "Courses being read", rReadings: "Readings, last 24 hours", rFilled: "Courses that have filled",
    movers: "Most seats taken, last 24 hours", mTaken: "Taken", mLeft: "Left now", noMovers: "No seats have moved in the last 24 hours.",
    fastest: "Fastest to fill", fStarted: "Started", fFull: "Full", fTook: "Took", noFastest: "No course has gone from open to full yet. This fills in once registration opens.",
    minutes: "{n} min", hours: "{n} h", days: "{n} days",
    runs: "Background check", runsNote: "Checks watched sections, sends seat emails and reads seats for \"how fast courses fill\". It should run about every 10 minutes.",
    runLast: "Last run {t} ago", runJustNow: "Last run just now", runAt: "at {t} ET", runNever: "No run recorded yet. Runs are recorded from this version on.",
    runHealthy: "On time", runLate: "Running late", runStopped: "Not running regularly",
    run24: "{n} runs in the last 24 hours", runGap: "longest gap {t}",
    runTime: "Started", runDuration: "Took", runChecked: "Courses checked", runTracked: "Seats recorded", runEmails: "Emails", runFailed: "failed",
    errors: "Errors", errorsNote: "Failed requests seen in visitors' browsers (each kind at most once a minute per page), and background seat reads and emails that failed. Counts only.",
    errorsNone: "No errors in the last 24 hours.", errorsSome: "{n} in the last 24 hours", eKind: "What failed", e24: "Last 24 hours", e7: "Last 7 days",
    errorKinds: { search: "Course search", course: "Course details and ratings", schedule: "Building schedules", seats: "Seat counts and trends", alerts: "Seat alerts (in the page)", sync: "Account sync", signin: "Email sign-in", api: "Other requests", page: "Page errors (scripts)", testudo: "Background: reading seats from Testudo", email: "Emails that failed to send", run: "Background run failed" },
    feedback: "Feedback", feedbackNote: "Messages from the Feedback form. They are also emailed to the contact address.", feedbackNone: "No messages yet.",
    fKinds: { problem: "Problem", idea: "Idea", other: "Other" } as Record<string, string>, fReply: "Reply to", fAnonymous: "anonymous", fFrom: "from",
  },
  zh: {
    eyebrow: "仅站长可见", title: "网站数据", back: "← 返回 TerpPlan", refresh: "刷新",
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
    referrals: "通过链接和二维码来的访问", referralsNote: "有人打开带 ?ref=标记 的链接时计数，同一浏览器每天只算一次。新的渠道可以自己起标记，例如 terpplan.com/?ref=wechat。",
    refTag: "标记", refToday: "今天", ref7: "最近 7 天", refTotal: "累计", refDaily: "最近 30 天每天", noReferrals: "还没有带标记的访问。分享 terpplan.com/?ref=qr（就是二维码里的链接）后会显示在这里。",
    visits: "访问人数", visitsNote: "同一浏览器每天只算一次；“新访客”是第一次打开 TerpPlan 的浏览器。从 {d} 开始统计。",
    visitsNoteEmpty: "同一浏览器每天只算一次；“新访客”是第一次打开 TerpPlan 的浏览器。还没有统计到访问。",
    vToday: "今天", vTodayNote: "其中 {n} 位新访客", v7: "最近 7 天", v7Note: "人次（每人每天算一次）", v30: "最近 30 天", v30Note: "人次（每人每天算一次）", vPeople: "累计来过的人", vPeopleNote: "开始统计以来第一次来的浏览器数",
    vDaily: "最近 30 天每天", vNew: "新访客", vReturning: "老访客", vTotal: "合计", alertsHeading: "余位邮件通知",
    usage: "大家用了什么", usageNote: "同一浏览器每项每天只算一次；示例模式里的操作不算。从 {d} 开始统计。", usageNoteEmpty: "同一浏览器每项每天只算一次；示例模式里的操作不算。还没有统计到使用。",
    uItem: "做了这件事", uToday: "今天", u7: "最近 7 天", u30: "最近 30 天", uShare: "占访问（7 天）",
    features: { planner: "打开排课页", course: "加了课", schedule: "看到生成的课表", share: "分享课表或方案链接", calendar: "导出到日历", alert: "开了余位提醒", signin: "邮箱登录", register: "打开选课当天页", hard: "看了最难抢的课", demo: "试用示例" },
    race: "抢课速度 · {term}", raceNote: "后台每半小时读一次最难抢的 60 门课、排课最多的 30 门课和所有被关注的课，其他有人打开过的课每两小时读一次。“开抢”是第一次比开始记录时多被选走座位的时间；“满员”是剩余不超过 2% 的座位（只算 30 座以上的课）。",
    rCourses: "正在记录的课", rReadings: "最近 24 小时读数", rFilled: "已经满员的课",
    movers: "最近 24 小时被抢最多", mTaken: "被选走", mLeft: "现在剩余", noMovers: "最近 24 小时没有座位变化。",
    fastest: "满得最快的课", fStarted: "开抢", fFull: "满员", fTook: "用时", noFastest: "还没有课从有空位变成满员，选课开放后这里会出现数据。",
    minutes: "{n} 分钟", hours: "{n} 小时", days: "{n} 天",
    runs: "后台检查", runsNote: "检查被关注的班次、发余位邮件、记录抢课速度。正常应该每 10 分钟左右运行一次。",
    runLast: "上次运行：{t}前", runJustNow: "上次运行：刚刚", runAt: "（美东 {t}）", runNever: "还没有运行记录，从这个版本开始记录。",
    runHealthy: "运行正常", runLate: "有些延迟", runStopped: "没有按时运行",
    run24: "最近 24 小时运行 {n} 次", runGap: "最长间隔 {t}",
    runTime: "开始时间", runDuration: "耗时", runChecked: "检查课程", runTracked: "记录余位", runEmails: "邮件", runFailed: "失败",
    errors: "出错次数", errorsNote: "访客浏览器里失败的请求（同一页面每类每分钟最多算一次），以及后台读取余位、发邮件的失败。只记次数。",
    errorsNone: "最近 24 小时没有出错。", errorsSome: "最近 24 小时出错 {n} 次", eKind: "哪里出错", e24: "最近 24 小时", e7: "最近 7 天",
    errorKinds: { search: "搜索课程", course: "课程详情和评分", schedule: "生成课表", seats: "余位和趋势", alerts: "余位提醒（页面里）", sync: "账号同步", signin: "邮箱登录", api: "其他请求", page: "页面脚本出错", testudo: "后台：从 Testudo 读余位", email: "邮件没发出去", run: "后台检查整体失败" },
    feedback: "用户反馈", feedbackNote: "来自“反馈”表单的留言，同时会发到联系邮箱。", feedbackNone: "还没有留言。",
    fKinds: { problem: "有问题", idea: "提建议", other: "其他" } as Record<string, string>, fReply: "回复到", fAnonymous: "匿名", fFrom: "来自",
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

const duration = (hours: number, t: (typeof copy)[Language]) =>
  hours < 1 ? t.minutes.replace("{n}", String(Math.round(hours * 60))) : hours < 48 ? t.hours.replace("{n}", String(Math.round(hours * 10) / 10)) : t.days.replace("{n}", String(Math.round((hours / 24) * 10) / 10));

export default function AdminPage() {
  const [language, setLanguage] = useState<Language>("zh");
  useDocumentLanguage(language);
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
        {(() => {
          const runs = stats.backgroundRuns;
          const last = runs.recent[0];
          const minutesAgo = last ? Math.max(0, (Date.parse(stats.generatedAt) - Date.parse(last.startedAt)) / 60_000) : null;
          const health = minutesAgo === null ? null : minutesAgo <= 20 ? "healthy" : minutesAgo <= 60 ? "late" : "stopped";
          const badge = { healthy: ["bg-[#e3f0e8] text-[#24523a]", t.runHealthy], late: ["bg-[#fff1d6] text-[#7a5212]", t.runLate], stopped: ["bg-[#fbe1dc] text-[#8a2f22]", t.runStopped] } as const;
          return <section className="mt-6 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[#24312d]">{t.runs}</h2>
              {health && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge[health][0]}`}>{badge[health][1]}</span>}
            </div>
            <p className="mt-1 text-[11px] leading-4 text-[#646c68]">{t.runsNote}</p>
            {last && minutesAgo !== null ? <>
              <p className="mt-3 text-sm text-[#24312d]"><span className="font-semibold">{minutesAgo < 1 ? t.runJustNow : t.runLast.replace("{t}", duration(minutesAgo / 60, t))}</span> <span className="text-xs text-[#646c68]">{t.runAt.replace("{t}", easternTime(last.startedAt, language))}</span></p>
              <p className="mt-1 text-xs text-[#5d6561]">{t.run24.replace("{n}", String(runs.last24h))}{runs.longestGapMinutes24h !== null && <> · {t.runGap.replace("{t}", duration(runs.longestGapMinutes24h / 60, t))}</>}</p>
              <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[28rem] text-xs"><thead><tr className="border-b border-[#ece9e2] text-left text-[#5d6561]"><th className="py-1.5 font-medium">{t.runTime}</th><th className="py-1.5 text-right font-medium">{t.runDuration}</th><th className="py-1.5 text-right font-medium">{t.runChecked}</th><th className="py-1.5 text-right font-medium">{t.runTracked}</th><th className="py-1.5 text-right font-medium">{t.runEmails}</th></tr></thead>
                <tbody>{runs.recent.map((run) => <tr key={run.startedAt} className="border-b border-[#f0ede7]"><td className="py-1.5 text-[#5d6561]">{easternTime(run.startedAt, language)}{!run.ok && <span className="ml-2 font-semibold text-[#a34a39]">{t.runFailed}</span>}</td><td className="py-1.5 text-right">{(run.durationMs / 1000).toFixed(1)}s</td><td className="py-1.5 text-right">{run.checkedCourses}</td><td className="py-1.5 text-right">{run.trackedCourses}</td><td className="py-1.5 text-right">{run.emailsSent}</td></tr>)}</tbody></table></div>
            </> : <p className="mt-2 text-xs text-[#646c68]">{t.runNever}</p>}
          </section>;
        })()}

        {(() => {
          const total = stats.errors.reduce((sum, row) => sum + row.last24h, 0);
          const shown = stats.errors.filter((row) => row.last7Days > 0);
          return <section className="mt-4 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[#24312d]">{t.errors}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${total ? "bg-[#fbe1dc] text-[#8a2f22]" : "bg-[#e3f0e8] text-[#24523a]"}`}>{total ? t.errorsSome.replace("{n}", String(total)) : t.errorsNone}</span>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-[#646c68]">{t.errorsNote}</p>
            {shown.length > 0 && <table className="mt-3 w-full text-xs"><thead><tr className="border-b border-[#ece9e2] text-left text-[#5d6561]"><th className="py-1.5 font-medium">{t.eKind}</th><th className="py-1.5 text-right font-medium">{t.e24}</th><th className="py-1.5 text-right font-medium">{t.e7}</th></tr></thead>
              <tbody>{shown.map((row) => <tr key={row.kind} className="border-b border-[#f0ede7]"><td className="py-1.5">{t.errorKinds[row.kind]}</td><td className={`py-1.5 text-right ${row.last24h ? "font-semibold text-[#8a2f22]" : ""}`}>{row.last24h}</td><td className="py-1.5 text-right">{row.last7Days}</td></tr>)}</tbody></table>}
          </section>;
        })()}

        <section className="mt-4 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5">
          <h2 className="text-sm font-semibold text-[#24312d]">{t.feedback}</h2>
          <p className="mt-1 text-[11px] leading-4 text-[#646c68]">{t.feedbackNote}</p>
          {stats.feedback.length ? <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto">{stats.feedback.map((item) => <li key={item.id} className="rounded-xl border border-[#ece9e2] bg-white p-3">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#646c68]">
              <span className={`rounded-full px-2 py-0.5 font-semibold ${item.kind === "problem" ? "bg-[#fbe1dc] text-[#8a2f22]" : "bg-[#edf3ef] text-[#273c38]"}`}>{t.fKinds[item.kind] ?? item.kind}</span>
              <span>{easternTime(item.createdAt, language)}</span><span>· {t.fFrom} {item.page}</span>
              <span>· {t.fReply} {item.contact ? <a href={`mailto:${item.contact}`} className="font-medium text-[#a34a39] hover:underline">{item.contact}</a> : t.fAnonymous}</span>
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#24312d]">{item.message}</p>
            {item.context && <p className="mt-1.5 text-[11px] text-[#646c68]">{item.context.split("\n").join(" · ")}</p>}
          </li>)}</ul> : <p className="mt-2 text-xs text-[#646c68]">{t.feedbackNone}</p>}
        </section>

        <section className="mt-4 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5">
          <h2 className="text-sm font-semibold text-[#24312d]">{t.visits}</h2>
          <p className="mt-1 text-[11px] leading-4 text-[#646c68]">{stats.visitors.since ? t.visitsNote.replace("{d}", stats.visitors.since) : t.visitsNoteEmpty}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [t.vToday, stats.visitors.today, t.vTodayNote.replace("{n}", String(stats.visitors.newToday))],
              [t.v7, stats.visitors.last7Days, t.v7Note],
              [t.v30, stats.visitors.last30Days, t.v30Note],
              [t.vPeople, stats.visitors.newTotal, t.vPeopleNote],
            ].map(([label, value, note]) => <div key={String(label)} className="rounded-xl border border-[#ece9e2] bg-white p-3">
              <p className="text-xs font-medium text-[#5d6561]">{label}</p>
              <p className="mt-1 font-serif text-3xl text-[#24312d]">{value}</p>
              <p className="mt-1 text-[11px] text-[#646c68]">{note}</p>
            </div>)}
          </div>
          {stats.visitorsByDay.length > 0 && (() => {
            const max = Math.max(1, ...stats.visitorsByDay.map((row) => row.visitors));
            const colon = language === "zh" ? "：" : ": ";
            const unit = language === "zh" ? " 人" : "";
            return <>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5d6561]">
                <span className="font-medium">{t.vDaily}</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#273c38]" />{t.vNew}</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#8fa79d]" />{t.vReturning}</span>
              </div>
              <ul className="mt-2 space-y-1.5">{stats.visitorsByDay.map((row) => <li key={row.day} className="group relative grid grid-cols-[5.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-xs">
                <span className="text-[#5d6561]">{row.day.slice(5)}</span>
                <span className="h-2.5 rounded-full bg-[#ece9e2]"><span className="flex h-full overflow-hidden rounded-full" style={{ width: `${(row.visitors / max) * 100}%` }}>
                  <span className="h-full bg-[#273c38]" style={{ width: `${row.visitors ? (row.newVisitors / row.visitors) * 100 : 0}%` }} />
                  <span className="h-full flex-1 bg-[#8fa79d]" />
                </span></span>
                <span className="text-right font-semibold text-[#24312d]">{row.visitors}</span>
                <span className="pointer-events-none absolute bottom-full left-[5.5rem] z-10 mb-1 hidden whitespace-nowrap rounded-lg bg-[#273c38] px-2.5 py-1.5 text-[11px] leading-5 text-white shadow-md group-hover:block">
                  <span className="block">{t.vNew}{colon}<b className="font-semibold">{row.newVisitors}</b>{unit}</span>
                  <span className="block">{t.vReturning}{colon}<b className="font-semibold">{row.visitors - row.newVisitors}</b>{unit}</span>
                  <span className="block text-[#c9d8d1]">{t.vTotal}{colon}{row.visitors}{unit}</span>
                </span>
              </li>)}</ul>
            </>;
          })()}
        </section>

        <section className="mt-4 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5">
          <h2 className="text-sm font-semibold text-[#24312d]">{t.usage}</h2>
          <p className="mt-1 text-[11px] leading-4 text-[#646c68]">{stats.usageSince ? t.usageNote.replace("{d}", stats.usageSince) : t.usageNoteEmpty}</p>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[30rem] text-xs"><thead><tr className="border-b border-[#ece9e2] text-left text-[#5d6561]"><th className="py-1.5 font-medium">{t.uItem}</th><th className="py-1.5 text-right font-medium">{t.uToday}</th><th className="py-1.5 text-right font-medium">{t.u7}</th><th className="py-1.5 text-right font-medium">{t.u30}</th><th className="py-1.5 pl-3 font-medium">{t.uShare}</th></tr></thead>
            <tbody>{stats.usage.map((row) => {
              const share = stats.visitors.last7Days ? Math.min(100, Math.round((row.last7Days / stats.visitors.last7Days) * 100)) : 0;
              return <tr key={row.feature} className="border-b border-[#f0ede7]"><td className="py-1.5">{t.features[row.feature]}</td><td className="py-1.5 text-right">{row.today}</td><td className="py-1.5 text-right font-semibold">{row.last7Days}</td><td className="py-1.5 text-right">{row.last30Days}</td>
                <td className="py-1.5 pl-3"><span className="flex items-center gap-2"><span className="h-2 w-24 rounded-full bg-[#ece9e2]"><span className="block h-full rounded-full bg-[#536d64]" style={{ width: `${share}%` }} /></span><span className="w-8 text-right text-[#5d6561]">{share}%</span></span></td></tr>;
            })}</tbody></table></div>
        </section>

        <section className="mt-4 rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-5">
          <h2 className="text-sm font-semibold text-[#24312d]">{t.race.replace("{term}", termLabel(stats.seatRace.term, language))}</h2>
          <p className="mt-1 text-[11px] leading-4 text-[#646c68]">{t.raceNote}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[[t.rCourses, stats.seatRace.courses], [t.rReadings, stats.seatRace.readingsLast24h], [t.rFilled, stats.seatRace.filled]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-[#ece9e2] bg-white p-3">
              <p className="text-xs font-medium text-[#5d6561]">{label}</p>
              <p className="mt-1 font-serif text-3xl text-[#24312d]">{value}</p>
            </div>)}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold text-[#24312d]">{t.movers}</h3>
              {stats.seatRace.movers.length ? <table className="mt-2 w-full text-xs"><thead><tr className="border-b border-[#ece9e2] text-left text-[#5d6561]"><th className="py-1.5 font-medium">{t.course}</th><th className="py-1.5 text-right font-medium">{t.mTaken}</th><th className="py-1.5 text-right font-medium">{t.mLeft}</th></tr></thead>
                <tbody>{stats.seatRace.movers.map((row) => <tr key={row.courseId} className="border-b border-[#f0ede7]"><td className="py-1.5 font-semibold">{row.courseId}</td><td className="py-1.5 text-right">{row.taken}</td><td className="py-1.5 text-right text-[#5d6561]">{row.openSeats} / {row.totalSeats}</td></tr>)}</tbody></table>
                : <p className="mt-2 text-xs text-[#646c68]">{t.noMovers}</p>}
            </div>
            <div>
              <h3 className="text-xs font-semibold text-[#24312d]">{t.fastest}</h3>
              {stats.seatRace.fastest.length ? <div className="overflow-x-auto"><table className="mt-2 w-full min-w-[26rem] text-xs"><thead><tr className="border-b border-[#ece9e2] text-left text-[#5d6561]"><th className="py-1.5 font-medium">{t.course}</th><th className="py-1.5 font-medium">{t.fStarted}</th><th className="py-1.5 font-medium">{t.fFull}</th><th className="py-1.5 text-right font-medium">{t.fTook}</th></tr></thead>
                <tbody>{stats.seatRace.fastest.map((row) => <tr key={row.courseId} className="border-b border-[#f0ede7]"><td className="py-1.5"><span className="font-semibold">{row.courseId}</span> <span className="text-[#646c68]">({row.totalSeats})</span></td><td className="py-1.5 text-[#5d6561]">{easternTime(row.startedAt, language)}</td><td className="py-1.5 text-[#5d6561]">{easternTime(row.filledAt, language)}</td><td className="py-1.5 text-right font-semibold">{duration(row.hours, t)}</td></tr>)}</tbody></table></div>
                : <p className="mt-2 text-xs text-[#646c68]">{t.noFastest}</p>}
            </div>
          </div>
        </section>

        <h2 className="mt-6 text-sm font-semibold text-[#24312d]">{t.alertsHeading}</h2>
        <section className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <h2 className="text-sm font-semibold text-[#24312d]">{t.referrals}</h2>
          <p className="mt-1 text-[11px] leading-4 text-[#646c68]">{t.referralsNote}</p>
          {stats.referrals.length ? <>
            <table className="mt-3 w-full text-xs"><thead><tr className="border-b border-[#ece9e2] text-left text-[#5d6561]"><th className="py-1.5 font-medium">{t.refTag}</th><th className="py-1.5 text-right font-medium">{t.refToday}</th><th className="py-1.5 text-right font-medium">{t.ref7}</th><th className="py-1.5 text-right font-medium">{t.refTotal}</th></tr></thead>
              <tbody>{stats.referrals.map((row) => <tr key={row.ref} className="border-b border-[#f0ede7]"><td className="py-1.5 font-mono">{row.ref}</td><td className="py-1.5 text-right">{row.today}</td><td className="py-1.5 text-right">{row.last7Days}</td><td className="py-1.5 text-right font-semibold">{row.total}</td></tr>)}</tbody></table>
            {stats.referralsByDay.length > 0 && (() => {
              const days = [...new Set(stats.referralsByDay.map((row) => row.day))];
              const perDay = days.map((day) => ({ day, visits: stats.referralsByDay.filter((row) => row.day === day).reduce((sum, row) => sum + row.visits, 0), parts: stats.referralsByDay.filter((row) => row.day === day) }));
              const max = Math.max(1, ...perDay.map((row) => row.visits));
              return <><p className="mt-4 text-xs font-medium text-[#5d6561]">{t.refDaily}</p><ul className="mt-2 space-y-1.5">{perDay.map((row) => <li key={row.day} title={row.parts.map((part) => `${part.ref}: ${part.visits}`).join(" · ")} className="grid grid-cols-[5.5rem_minmax(0,1fr)_2rem] items-center gap-3 text-xs">
                <span className="text-[#5d6561]">{row.day.slice(5)}</span>
                <span className="h-2.5 rounded-full bg-[#ece9e2]"><span className="block h-full rounded-full bg-[#a34a39]" style={{ width: `${(row.visits / max) * 100}%` }} /></span>
                <span className="text-right font-semibold text-[#24312d]">{row.visits}</span>
              </li>)}</ul></>;
            })()}
          </> : <p className="mt-2 text-xs text-[#646c68]">{t.noReferrals}</p>}
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
