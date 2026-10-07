"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDocumentLanguage } from "@/lib/document-language";
import { readSavedState, writeSavedState } from "@/lib/saved-state";
import { CONTACT_EMAIL } from "@/lib/site-config";

type Language = "en" | "zh";

// The planner used to live at "/", so links already sent out (QR-code posters aside, which carry only ?ref=)
// can still point here with planner parameters: a sample (?demo=1), a seat alert (?opening=), a course
// (?course=), Gen Ed categories (?gened=) or a plan moved from another device (#move=). Those go straight on to
// /plan, before the home page renders.
const PLANNER_PARAMS = ["demo", "opening", "course", "gened"];
if (typeof window !== "undefined") {
  const params = new URLSearchParams(window.location.search);
  if (PLANNER_PARAMS.some((key) => params.has(key)) || window.location.hash.startsWith("#move=")) {
    window.location.replace("/plan" + window.location.search + window.location.hash);
  }
}

const copy = {
  en: {
    nav: { audit: "Degree audit", minor: "Minor / double major", hard: "Hardest courses" },
    eyebrow: "University of Maryland · Free, student-built",
    title: "Plan a semester you can actually get into.",
    lead: "Search UMD courses, get conflict-free schedules built around your job and other commitments, check prerequisites against your degree audit, and get an email the moment a full section opens.",
    start: "Start planning", continue: "Continue your plan", sample: "Try a sample schedule",
    startNote: "No account needed to plan. 中文界面可用。",
    stepsTitle: "How it works",
    steps: [
      ["Find courses", "Search by code or name, or by Gen Ed (including courses that count for two). See open seats, credits and each instructor's average GPA."],
      ["Build your schedule", "Get ranked, conflict-free options. Skip Fridays or 8 a.m.s, block out work hours, then swap any section right in the timetable."],
      ["Get your seats", "Watch full sections and get an email when one opens, with a check that it fits your schedule. On registration day, your section numbers and backups are on one page."],
    ],
    whyTitle: "What other tools don't tell you",
    why: [
      ["Can you take it?", "Prerequisites and credit requirements (\"60 credits completed\") checked against the courses on your degree audit. The PDF is read in your browser.", "/audit", "Check your audit"],
      ["Can you get in?", "Which courses were still full after registration in recent semesters, so you plan backups and seat alerts early.", "/hard-courses", "See the hardest courses"],
      ["Will it be too much?", "A workload estimate from each course's historical GPA, and how many hours a day you would be in class.", "/plan", "Build a schedule"],
      ["Minor or double major?", "See which of your courses already count, what is left, and how much it overlaps with your major.", "/minor", "Explore minors"],
    ],
    extrasTitle: "Also included",
    extras: ["Plan A and Plan B for each term", "Export to Apple or Google Calendar, or print", "\"My week\" on your phone, even offline", "Share a schedule with a link", "Your plan on every device once you sign in", "English and 中文"],
    footer: "TerpPlan is an independent student project, not affiliated with the University of Maryland. Always confirm sections and register in Testudo.",
    contact: "Feedback or ideas:",
  },
  zh: {
    nav: { audit: "学位审计", minor: "辅修 / 双专业", hard: "最难抢的课" },
    eyebrow: "马里兰大学 · 学生开发 · 免费",
    title: "排一份能上、也抢得到的课表",
    lead: "搜索 UMD 课程，自动排出避开打工等时间、没有冲突的课表，对照学位审计检查先修课；满了的班一有空位，马上发邮件提醒你。",
    start: "开始排课", continue: "继续排课", sample: "先试试示例课表",
    startNote: "不用注册就能排课。English available.",
    stepsTitle: "三步排好下学期",
    steps: [
      ["找课", "按课号、课名或 Gen Ed 搜索（包括一课两用）。直接看到余位、学分和每位老师往年的平均 GPA。"],
      ["排课", "自动给出排好序、不冲突的方案。可以避开周五、早八，空出打工时间，在课表上直接换班。"],
      ["抢位", "关注满了的班，有空位就发邮件，并帮你检查是否和课表冲突。选课当天，课号、班号和备选都在一页。"],
    ],
    whyTitle: "别的工具不会告诉你的",
    why: [
      ["能不能上？", "对照学位审计里的已修课程，检查先修课和学分要求（比如“需修满 60 学分”）。PDF 只在你的浏览器里读取。", "/audit", "查看学位审计"],
      ["抢不抢得到？", "最近几个学期注册结束后仍然满员的课，提前准备备选和余位提醒。", "/hard-courses", "看最难抢的课"],
      ["会不会太累？", "按每门课往年的平均 GPA 估算学期负担，还能看到每天要上几小时课。", "/plan", "去排课"],
      ["修辅修 / 双专业？", "看看你已修的课哪些能算进去、还差什么、和主修重合多少。", "/minor", "评估辅修"],
    ],
    extrasTitle: "还有这些",
    extras: ["每学期两个方案（A / B）", "导出到苹果或谷歌日历，或打印", "手机上的“我的一周”，离线也能看", "用链接分享课表", "登录后所有设备看到同一份方案", "中文和 English"],
    footer: "TerpPlan 是学生独立开发的项目，与马里兰大学没有隶属关系。班次以 Testudo 为准，并在 Testudo 完成注册。",
    contact: "反馈和建议：",
  },
} as const;

// A small picture of what the planner makes: a week with classes and a work shift kept free.
function TimetableSketch({ language }: { language: Language }) {
  const days = language === "zh" ? ["周一", "周二", "周三", "周四", "周五"] : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const blocks: Array<{ day: number; top: number; height: number; label: string; tone: string }> = [
    { day: 0, top: 6, height: 18, label: "MATH141", tone: "bg-[#f9d9d6] text-[#7c2f27]" },
    { day: 2, top: 6, height: 18, label: "MATH141", tone: "bg-[#f9d9d6] text-[#7c2f27]" },
    { day: 4, top: 6, height: 18, label: "MATH141", tone: "bg-[#f9d9d6] text-[#7c2f27]" },
    { day: 1, top: 14, height: 22, label: "CMSC132", tone: "bg-[#d3ece4] text-[#24524a]" },
    { day: 3, top: 14, height: 22, label: "CMSC132", tone: "bg-[#d3ece4] text-[#24524a]" },
    { day: 0, top: 32, height: 16, label: "COMM107", tone: "bg-[#f3e3b3] text-[#5f4316]" },
    { day: 2, top: 32, height: 16, label: "COMM107", tone: "bg-[#f3e3b3] text-[#5f4316]" },
    { day: 1, top: 52, height: 30, label: language === "zh" ? "打工" : "Job", tone: "bg-[#e6e3dc] text-[#5d6561] border border-dashed border-[#bdb8ad]" },
    { day: 3, top: 52, height: 30, label: language === "zh" ? "打工" : "Job", tone: "bg-[#e6e3dc] text-[#5d6561] border border-dashed border-[#bdb8ad]" },
    { day: 4, top: 40, height: 18, label: "PSYC100", tone: "bg-[#dcd6f0] text-[#3e3470]" },
  ];
  return <div aria-hidden="true" className="rounded-2xl border border-[#e0ddd5] bg-white p-3 shadow-sm">
    <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] font-semibold text-[#646c68]">{days.map((day) => <span key={day}>{day}</span>)}</div>
    <div className="relative mt-2 grid h-56 grid-cols-5 gap-1.5">
      {days.map((day) => <div key={day} className="rounded-md bg-[#f7f5f0]" />)}
      {blocks.map((block, index) => <div key={index} className={`absolute flex items-center justify-center rounded-md text-[10px] font-semibold ${block.tone}`} style={{ left: `calc(${block.day} * (100% + 6px) / 5)`, width: "calc((100% - 24px) / 5)", top: `${block.top}%`, height: `${block.height}%` }}>{block.label}</div>)}
    </div>
  </div>;
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("en");
  useDocumentLanguage(language);
  const [hasPlan, setHasPlan] = useState(false);
  const t = copy[language];

  useEffect(() => {
    // Read after the first render, so the server and client HTML match.
    const saved = readSavedState();
    /* eslint-disable react-hooks/set-state-in-effect */
    if (saved.language) setLanguage(saved.language);
    setHasPlan(Object.values(saved.plans).some((courses) => courses.length > 0));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const switchLanguage = () => { const next = language === "en" ? "zh" : "en"; setLanguage(next); writeSavedState({ language: next }); };
  const primary = "inline-flex items-center justify-center rounded-xl bg-[#a34a39] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#8f3f30]";
  const secondary = "inline-flex items-center justify-center rounded-xl border border-[#d9d6ce] bg-white px-5 py-3 text-sm font-semibold text-[#273c38] hover:border-[#536d64] hover:bg-[#edf3ef]";

  return <main className="min-h-screen bg-[#f5f3ef] text-[#202728]">
    <header className="border-b border-[#dedbd3] bg-[#fbfaf8]"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4 sm:px-8">
      <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#bd302f] font-serif text-lg text-white">T</span>TerpPlan</Link>
      <nav aria-label={language === "en" ? "Tools" : "工具"} className="order-last flex w-full items-center gap-4 overflow-x-auto text-xs font-medium text-[#48534f] sm:order-none sm:w-auto">
        <Link href="/audit" className="whitespace-nowrap hover:text-[#a34a39]">{t.nav.audit}</Link>
        <Link href="/minor" className="whitespace-nowrap hover:text-[#a34a39]">{t.nav.minor}</Link>
        <Link href="/hard-courses" className="whitespace-nowrap hover:text-[#a34a39]">{t.nav.hard}</Link>
      </nav>
      <div className="flex items-center gap-2">
        <button type="button" onClick={switchLanguage} className="rounded-lg border border-[#dcd9d0] px-3 py-2 text-xs">{language === "en" ? "中文" : "English"}</button>
        <Link href="/plan" className="whitespace-nowrap rounded-lg bg-[#273c38] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d302c]">{hasPlan ? t.continue : t.start} →</Link>
      </div>
    </div></header>

    <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-12 pt-12 sm:px-8 sm:pt-16 lg:grid-cols-[1.15fr_1fr]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[.17em] text-[#a34a39]">{t.eyebrow}</p>
        <h1 className="mt-4 max-w-2xl font-serif text-4xl leading-[1.1] tracking-[-.02em] sm:text-6xl">{t.title}</h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-[#48534f]">{t.lead}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/plan" className={primary}>{hasPlan ? t.continue : t.start} →</Link>
          {/* A full page load, so the sample is set up before the planner reads this browser's plan. */}
          <a href="/plan?demo=1" className={secondary}>{t.sample}</a>
        </div>
        <p className="mt-3 text-xs text-[#646c68]">{t.startNote}</p>
      </div>
      <TimetableSketch language={language} />
    </section>

    <section className="border-y border-[#e0ddd5] bg-[#fbfaf8]"><div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <h2 className="font-serif text-3xl">{t.stepsTitle}</h2>
      <ol className="mt-6 grid gap-4 md:grid-cols-3">{t.steps.map(([title, body], index) => <li key={title} className="rounded-2xl border border-[#e3e0d8] bg-white p-5">
        <span className="font-serif text-2xl text-[#a34a39]">0{index + 1}</span>
        <h3 className="mt-2 text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[#5d6561]">{body}</p>
      </li>)}</ol>
    </div></section>

    <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <h2 className="font-serif text-3xl">{t.whyTitle}</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">{t.why.map(([title, body, href, link]) => <Link key={title} href={href} className="group rounded-2xl border border-[#e3e0d8] bg-white p-5 hover:border-[#536d64]">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[#5d6561]">{body}</p>
        <p className="mt-3 text-sm font-semibold text-[#a34a39] group-hover:underline">{link} →</p>
      </Link>)}</div>
      <h2 className="mt-12 text-sm font-semibold uppercase tracking-[.13em] text-[#5d6561]">{t.extrasTitle}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">{t.extras.map((item) => <li key={item} className="rounded-full border border-[#e0ddd5] bg-white px-3 py-1.5 text-xs text-[#48534f]">{item}</li>)}</ul>
      <div className="mt-12 flex flex-col items-start gap-4 rounded-2xl bg-[#273c38] p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <p className="font-serif text-2xl">{t.title}</p>
        <Link href="/plan" className="inline-flex shrink-0 items-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#273c38] hover:bg-[#edf3ef]">{hasPlan ? t.continue : t.start} →</Link>
      </div>
    </section>

    <footer className="border-t border-[#e0ddd5]"><div className="mx-auto max-w-6xl px-5 py-6 text-xs leading-5 text-[#646c68] sm:px-8">
      <p>{t.footer}</p>
      <p className="mt-1">{t.contact} <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-[#a34a39] hover:underline">{CONTACT_EMAIL}</a></p>
    </div></footer>
  </main>;
}
