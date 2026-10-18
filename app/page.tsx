"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDocumentLanguage } from "@/lib/document-language";
import { readLanguage, readSavedState, writeSavedState } from "@/lib/saved-state";
import { CONTACT_EMAIL } from "@/lib/site-config";
import { openFeedback } from "@/lib/feedback";
import { SEAT_CHECK_MINUTES } from "@/lib/seat-cadence";
import homeReviews from "@/data/home-reviews.json";
import { readRegistrationDay, savedReminder } from "@/lib/registration-day";
import { RegistrationCountdown } from "@/app/components/registration-countdown";
import { RoadmapSketch } from "@/app/components/roadmap-sketch";
import { TimetableSketch } from "@/app/components/timetable-sketch";
import { SiteHeader } from "@/app/components/site-header";

type Language = "en" | "zh";

// Small line icons for the steps and the tool cards.
const ICONS: Record<string, ReactNode> = {
  search: <><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></>,
  calendar: <><rect x="2.5" y="3.5" width="11" height="10" rx="2" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" /></>,
  bell: <><path d="M4 11V7a4 4 0 0 1 8 0v4l1.2 1.5H2.8z" /><path d="M6.5 14a1.5 1.5 0 0 0 3 0" /></>,
  audit: <><rect x="3.5" y="2.5" width="9" height="11.5" rx="1.5" /><path d="M6 2.5h4v2H6zM6 9.2l1.5 1.5 2.8-3" /></>,
  door: <><path d="M9.5 2.5h3v11h-3" /><path d="M2.5 8h7M7 5.5 9.5 8 7 10.5" /></>,
  gauge: <><path d="M2.5 11.5a5.5 5.5 0 1 1 11 0" /><path d="M8 11.5l2.6-3.6" /></>,
  layers: <><path d="m8 2.5 5.5 3L8 8.5l-5.5-3z" /><path d="m2.5 8.5 5.5 3 5.5-3" /></>,
  pin: <><path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 9.8 8 14 8 14z" /><circle cx="8" cy="6.5" r="1.6" /></>,
  more: <><path d="M6 4.5h7.5M6 8h7.5M6 11.5h7.5" /><path d="M2.5 4.5h.5M2.5 8h.5M2.5 11.5h.5" /></>,
  check: <path d="m3.5 8.5 3 3 6-7" />,
};
const Icon = ({ name, className = "h-4 w-4" }: { name: string; className?: string }) => <svg aria-hidden="true" viewBox="0 0 16 16" className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{ICONS[name]}</svg>;
const iconTile = "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#edf3ef] text-[#315c43]";
const card = "flex gap-3 rounded-2xl border border-[#e3e0d8] bg-white p-4 sm:flex-col sm:p-5";

// "Between classes, find a room": a way into /rooms, with how many rooms are free right now. The count is asked
// for only once the card scrolls into view, so the home page itself loads nothing extra.
function RoomsCard({ t }: { t: { roomsTitle: string; roomsBody: string; roomsLive: (rooms: number, buildings: number) => string; roomsButton: string } }) {
  const [now, setNow] = useState<{ show: boolean; rooms: number; buildings: number } | null>(null);
  const element = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const target = element.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      void fetch("/api/rooms/now").then((response) => response.ok ? response.json() as Promise<{ show: boolean; rooms: number; buildings: number }> : null).then(setNow).catch(() => undefined);
    }, { rootMargin: "200px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  return <Link href="/rooms" className={`group ${card} hover:border-[#536d64] sm:col-span-2 lg:col-span-3`}>
    <span className={iconTile}><Icon name="pin" /></span>
    <span ref={element} className="min-w-0">
      <span className="block font-semibold text-[#202728]">{t.roomsTitle}</span>
      <span className="mt-1 block text-sm leading-6 text-[#5d6561]">{t.roomsBody}</span>
      {now?.show && now.rooms > 0 && <span className="mt-1.5 flex items-center gap-2 text-xs font-semibold text-[#273c38]"><span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[#3f9b6e]" />{t.roomsLive(now.rooms, now.buildings)}</span>}
      <span className="mt-2 block text-sm font-semibold text-[#a34a39] group-hover:underline">{t.roomsButton} →</span>
    </span>
  </Link>;
}

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
    eyebrow: "University of Maryland · Free, student-built",
    title: "Plan a semester you can actually get into.",
    lead: "Get conflict-free schedules built around your job, and an email the moment a full section opens.",
    start: "Start planning", continue: "Continue your plan", sample: "Try a sample schedule",
    startNote: "No account needed to plan. 中文界面可用。",
    stepsTitle: "How it works",
    steps: [
      ["search", "Find courses", "Search by code, name or Gen Ed. See seats, credits and each instructor's average GPA."],
      ["calendar", "Build your schedule", "Ranked, conflict-free options around work and 8 a.m.s; swap sections right in the timetable."],
      ["bell", "Get your seats", "An email when a full section opens, and your section numbers in one place on registration day."],
    ],
    roadmapEyebrow: "Four-year plan", roadmapTitle: "Plan all four years, not just next semester",
    roadmapLead: "Lay out every term from now to graduation. Credits, prerequisites, Gen Eds and your major are checked as you go.",
    roadmapPoints: [
      "Your major, line by line: Computer Science by the department's own rules, and 100+ other majors from the catalog.",
      "Upload your degree audit, and what it says is unfinished is matched against the terms ahead.",
      "Print it as the department's graduation plan form, ready for your advisor.",
    ],
    roadmapCta: "Open the 4-year plan",
    reviewsTitle: "What students say about these classes",
    reviewsLead: "Real PlanetTerp reviews of popular intro courses, good and bad, a different mix each visit. In the planner, click an instructor to see theirs.",
    whyTitle: "What other tools don't tell you",
    why: [
      ["audit", "Can you take it?", "Prerequisites and credit rules checked against your degree audit, read in your browser.", "/audit", "Check your audit"],
      ["door", "Can you get in?", "Courses still full after registration in recent terms, so you line up backups early.", "/hard-courses", "See the hardest courses"],
      ["gauge", "Will it be too much?", "A workload estimate from each course's historical GPA, and your hours in class each day.", "/plan", "Build a schedule"],
      ["layers", "Minor or double major?", "What already counts, what is left, and how much it overlaps with your major.", "/minor", "Explore minors"],
    ],
    roomsTitle: "Between classes, find a room", roomsBody: "Classrooms with no class right now, how long they stay free, and which are closest.",
    roomsLive: (rooms: number, buildings: number) => `Right now ${rooms} classrooms in ${buildings} buildings have no class.`, roomsButton: "Find an empty room",
    extrasTitle: "Also included",
    extras: ["Plan A and Plan B for each term", "Export to Apple or Google Calendar, or print", "\"My week\" on your phone, even offline", "Share a schedule with a link", "Your plan on every device once you sign in", "English and 中文"],
    footer: "TerpPlan is an independent student project, not affiliated with the University of Maryland. Always confirm sections and register in Testudo.",
    contact: "Feedback or ideas:", feedbackButton: "Send feedback", orEmail: "or email",
    closing: "Registration is coming. Have a backup plan ready.",
    registrationDay: "Registration day", registrationOpen: "Open your section numbers and backups",
    faqTitle: "Questions",
    faq: [
      ["Is TerpPlan official?", "No. It is an independent project by UMD students, not affiliated with the university. You still register in Testudo, and Testudo is the final word on sections, times and seats."],
      ["Does it cost anything?", "No. TerpPlan is free, and you can plan without an account."],
      ["Which majors does the four-year plan check?", "Computer Science is checked against the department's own rules, with its four specializations and the LEP benchmarks. Other majors are checked against the course lists in the undergraduate catalog, and rules the catalog writes only in words are shown for you to check. Upload your degree audit to match any major's unfinished requirements as well."],
      ["Can I give the printout to my advisor?", "Yes. Print or save the four-year plan as a PDF: it is laid out like the department's graduation plan form, in English, with the Gen Ed table and a summary of your major's requirements. It is a planning aid; your advisor and your uAchieve audit have the final word."],
      ["Where is my plan stored?", "In your browser. If you sign in with your email, your plan, preferences and courses taken are also kept in your account so they open on your other devices; you can delete that copy. Degree audit PDFs are read in your browser and never uploaded."],
      ["How fresh are the seat counts?", `With seat emails on, watched sections are checked about every ${SEAT_CHECK_MINUTES} minutes, sometimes later at busy times. While the planner is open it reads seats at most once a minute. A seat can fill again before you see it, so register right away.`],
      ["Where does the course data come from?", "Courses, sections and seats come from UMD's Schedule of Classes (Testudo) and umd.io. Instructor ratings, reviews and average GPAs come from PlanetTerp."],
      ["Are the empty rooms accurate?", "A room on the empty-room page has no class scheduled at that time, from this term's Testudo schedule. It can still be used for an exam, a review session or an event, and some rooms are locked outside class hours, so treat it as a good place to look, not a booking."],
      ["Is there a Chinese version?", "Yes. Switch to 中文 at the top of any page."],
    ] as Array<[string, string]>,
  },
  zh: {
    eyebrow: "马里兰大学 · 学生开发 · 免费",
    title: "排一份能上、\n也抢得到的课表",
    lead: "自动避开打工时间排课，满了的班一有空位就发邮件提醒你。",
    start: "开始排课", continue: "继续排课", sample: "先试试示例课表",
    startNote: "不用注册就能排课。English available.",
    stepsTitle: "三步排好下学期",
    steps: [
      ["search", "找课", "按课号、课名或 Gen Ed 搜，直接看余位、学分和老师往年的平均 GPA。"],
      ["calendar", "排课", "自动给出不冲突的方案，避开打工和早八，在课表上直接换班。"],
      ["bell", "抢位", "满了的班一有空位就发邮件，选课当天课号、班号和备选都在一页。"],
    ],
    roadmapEyebrow: "四年规划", roadmapTitle: "不只下学期，\n四年也帮你排好",
    roadmapLead: "把到毕业的每个学期都排出来，学分、先修、Gen Ed 和专业要求边排边检查。",
    roadmapPoints: [
      "专业要求逐项检查：计算机科学按系里的规则，另外 100 多个专业按 catalog。",
      "上传 degree audit，自动对照审计里还没完成的要求。",
      "一键打印成系里的毕业规划表（Graduation Plan），直接交给 advisor。",
    ],
    roadmapCta: "打开四年规划",
    reviewsTitle: "同学怎么评价这些课",
    reviewsLead: "PlanetTerp 上热门入门课的真实评价，好评差评都有，每次随机。排课时点老师名字，就能看到他教这门课的评价。",
    whyTitle: "别的工具不会告诉你的",
    why: [
      ["audit", "能不能上？", "对照学位审计检查先修课和学分要求，PDF 只在你的浏览器里读取。", "/audit", "查看学位审计"],
      ["door", "抢不抢得到？", "最近几个学期注册后仍满员的课，提前准备备选和余位提醒。", "/hard-courses", "看最难抢的课"],
      ["gauge", "会不会太累？", "按往年平均 GPA 估算学期负担，还能看每天要上几小时课。", "/plan", "去排课"],
      ["layers", "修辅修 / 双专业？", "已修的课能算进去多少、还差什么、和主修重合多少。", "/minor", "评估辅修"],
    ],
    roomsTitle: "课间去哪自习？", roomsBody: "现在没课的教室，能空到几点、离你最近的是哪间。",
    roomsLive: (rooms: number, buildings: number) => `现在有 ${buildings} 栋楼的 ${rooms} 间教室没有排课。`, roomsButton: "找空教室",
    extrasTitle: "还有这些",
    extras: ["每学期两个方案（A / B）", "导出到苹果或谷歌日历，或打印", "手机上的“我的一周”，离线也能看", "用链接分享课表", "登录后所有设备看到同一份方案", "中文和 English"],
    footer: "TerpPlan 是学生独立开发的项目，与马里兰大学没有隶属关系。班次以 Testudo 为准，并在 Testudo 完成注册。",
    contact: "反馈和建议：", feedbackButton: "写反馈", orEmail: "或发邮件到",
    closing: "下学期选课前，先排好一份备选方案。",
    registrationDay: "选课当天", registrationOpen: "打开课号、班号和备选清单",
    faqTitle: "常见问题",
    faq: [
      ["TerpPlan 是官方的吗？", "不是。这是 UMD 学生做的独立项目，与学校没有隶属关系。最终仍要在 Testudo 注册，班次、时间和余位以 Testudo 为准。"],
      ["要钱吗？", "不要，完全免费，不注册账号也能排课。"],
      ["四年规划能检查哪些专业？", "计算机科学按系里的规则逐条检查，包括四个方向和 LEP Benchmark；其他专业按本科 catalog 列出的课程检查，catalog 只用文字描述的要求会列出来让你自己核对。上传 degree audit 后，任何专业都能对照审计里还没完成的要求。"],
      ["打印版能直接交给 advisor 吗？", "可以。四年规划可以打印或存成 PDF，按系里毕业规划表（Graduation Plan）的格式排版，英文，附 Gen Ed 表和专业要求摘要。它是规划工具，最终以 advisor 和 uAchieve 审计为准。"],
      ["我的数据存在哪？", "默认存在你的浏览器里。用邮箱登录后，方案、偏好和已修课程也会保存到账号，换设备登录就能看到，你也可以删除这份副本。学位审计 PDF 只在你的浏览器里读取，不会上传。"],
      ["余位多久更新一次？", `开通邮件提醒后，关注的班次大约每 ${SEAT_CHECK_MINUTES} 分钟检查一次，高峰时可能更晚。排课页打开时，最多每分钟读取一次余位。空位可能很快又被抢走，收到提醒请尽快注册。`],
      ["课程数据从哪来？", "课程、班次和余位来自 UMD 官方课表（Testudo）和 umd.io；老师评分、评论和平均 GPA 来自 PlanetTerp。"],
      ["空教室准吗？", "列出的教室只表示这个时段没有排课（根据 Testudo 本学期的课表）。它仍可能被考试、习题课或活动占用，有些教室课后会上锁，所以把它当作“值得去看看”的地方，而不是预约。"],
      ["有中文吗？", "有，在任意页面右上角切换。"],
    ] as Array<[string, string]>,
  },
} as const;

// Real student reviews of popular intro courses (data/home-reviews.json, from PlanetTerp), praise and criticism:
// the kind of reviews the planner shows next to each instructor. Cards name the course, not the instructor. Each
// visit shows a different mix; a card opens the course on PlanetTerp. On a wide screen they drift past in one row
// (hovering pauses); on a phone they are a row to swipe through, one whole card at a time.
type HomeReview = { course: string; rating: number; excerpt: string };
const REVIEWS = (homeReviews as { reviews: HomeReview[] }).reviews;

function ReviewCard({ review, copy = false, className = "w-80" }: { review: HomeReview; copy?: boolean; className?: string }) {
  return <a href={`https://planetterp.com/course/${review.course}`} target="_blank" rel="noreferrer" tabIndex={copy ? -1 : undefined} className={`flex shrink-0 flex-col justify-between rounded-2xl border border-[#e3e0d8] bg-white p-4 text-left hover:border-[#536d64] ${className}`}>
    <p className="text-sm leading-6 text-[#2c3533]">“{review.excerpt}”</p>
    <p className="mt-3 flex items-center justify-between gap-2 text-[11px] text-[#646c68]">
      <span className="font-semibold text-[#273c38]">{review.course}</span>
      <span className="shrink-0 tracking-wider" aria-label={`${review.rating} / 5`}><span className="text-[#a3772b]">{"★".repeat(review.rating)}</span><span className="text-[#d9d6ce]">{"★".repeat(5 - review.rating)}</span></span>
    </p>
  </a>;
}

function ReviewStream({ t }: { t: { reviewsTitle: string; reviewsLead: string } }) {
  const [order, setOrder] = useState(REVIEWS);
  useEffect(() => {
    // A new mix each visit, shuffled after the first render so the server and client HTML match.
    const shuffled = [...REVIEWS];
    for (let index = shuffled.length - 1; index > 0; index -= 1) { const other = Math.floor(Math.random() * (index + 1)); [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!]; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrder(shuffled);
  }, []);
  const row = order.slice(0, 30);
  return <section aria-labelledby="reviews-title" className="py-12">
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <h2 id="reviews-title" className="font-serif text-3xl">{t.reviewsTitle}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5d6561]">{t.reviewsLead}</p>
    </div>
    {/* Phone: swipe, stopping on whole cards, with the next one showing at the edge. */}
    <div className="scrollbar-none mt-6 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 sm:hidden">
      {row.slice(0, 12).map((review, item) => <ReviewCard key={item} review={review} className="w-[82%] snap-start" />)}
    </div>
    <div className="mt-6 hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)] sm:block">
      <div className="marquee overflow-hidden">
        {/* Two copies of the row: moving by half the width loops without a jump. The copy is hidden from screen readers. */}
        <div className="marquee-track flex w-max" style={{ ["--marquee-duration" as string]: "200s" }}>
          <div className="flex gap-4 pr-4">{row.map((review, item) => <ReviewCard key={item} review={review} />)}</div>
          <div aria-hidden="true" className="flex gap-4 pr-4">{row.map((review, item) => <ReviewCard key={item} review={review} copy />)}</div>
        </div>
      </div>
    </div>
  </section>;
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("en");
  useDocumentLanguage(language);
  const [hasPlan, setHasPlan] = useState(false);
  // Shown only to students whose planner saved a registration-day list (and their own registration time).
  const [registration, setRegistration] = useState<{ date: string; time: string } | null>(null);
  const t = copy[language];

  useEffect(() => {
    // Read after the first render, so the server and client HTML match.
    const saved = readSavedState();
    /* eslint-disable react-hooks/set-state-in-effect */
    setLanguage(readLanguage(saved));
    setHasPlan(Object.values(saved.plans).some((courses) => courses.length > 0));
    const day = readRegistrationDay();
    if (day?.courses.length) setRegistration(savedReminder(day.termName));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const switchLanguage = () => { const next = language === "en" ? "zh" : "en"; setLanguage(next); writeSavedState({ language: next }); };
  const primary = "inline-flex items-center justify-center rounded-xl bg-[#a34a39] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#8f3f30]";
  const secondary = "inline-flex items-center justify-center rounded-xl border border-[#d9d6ce] bg-white px-5 py-3 text-sm font-semibold text-[#273c38] hover:border-[#536d64] hover:bg-[#edf3ef]";

  return <main className="min-h-screen bg-[#f5f3ef] text-[#202728]">
    <SiteHeader language={language} onLanguage={switchLanguage} actions={<>{registration && <Link href="/register" className="hidden whitespace-nowrap rounded-lg border border-[#cddbd1] bg-[#edf3ef] px-3 py-2 text-xs font-semibold text-[#273c38] hover:bg-[#e2ece6] sm:inline-flex">📋 {t.registrationDay}</Link>}<Link href="/plan" className="whitespace-nowrap rounded-lg bg-[#273c38] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d302c]">{hasPlan ? t.continue : t.start} →</Link></>} />

    <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-10 pt-12 sm:px-8 sm:pt-16 lg:grid-cols-[1.15fr_1fr]">
      <div>
        {registration && <Link href="/register" className="mb-6 flex max-w-xl flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-[#cddbd1] bg-[#edf3ef] px-4 py-3 hover:border-[#536d64]">
          <span className="min-w-0"><span className="block text-sm font-semibold text-[#273c38]">📋 {t.registrationDay}</span>{registration.date && registration.time ? <RegistrationCountdown date={registration.date} time={registration.time} language={language} /> : null}</span>
          <span className="text-xs font-semibold text-[#a34a39]">{t.registrationOpen} →</span>
        </Link>}
        <p className="text-[11px] font-semibold uppercase tracking-[.17em] text-[#a34a39]">{t.eyebrow}</p>
        <h1 className="mt-4 max-w-2xl whitespace-pre-line text-balance font-serif text-4xl leading-[1.1] tracking-[-.02em] sm:text-6xl">{t.title}</h1>
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

    {/* How the semester planner works, in one row under the sample it shows. */}
    <section aria-labelledby="steps-title" className="mx-auto max-w-6xl px-5 pb-12 sm:px-8">
      <div className="border-t border-[#e0ddd5] pt-8">
        <h2 id="steps-title" className="text-sm font-semibold uppercase tracking-[.13em] text-[#5d6561]">{t.stepsTitle}</h2>
        <ol className="mt-4 grid gap-5 md:grid-cols-3 md:gap-6">{t.steps.map(([icon, title, body], index) => <li key={title} className="flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#a34a39] shadow-[0_1px_2px_rgba(32,39,40,.06)] ring-1 ring-[#e7e3db]"><Icon name={icon} /></span>
          <div className="min-w-0">
            <h3 className="font-semibold"><span className="mr-1.5 font-serif text-[#a34a39]">0{index + 1}</span>{title}</h3>
            <p className="mt-1 text-sm leading-6 text-[#5d6561]">{body}</p>
          </div>
        </li>)}</ol>
      </div>
    </section>

    {/* The four-year plan: every term to graduation, checked against the major and the degree audit. */}
    <section aria-labelledby="roadmap-title" className="border-y border-[#e0ddd5] bg-[#fbfaf8]">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.17em] text-[#a34a39]">{t.roadmapEyebrow}</p>
          <h2 id="roadmap-title" className="mt-3 max-w-xl whitespace-pre-line text-balance font-serif text-3xl leading-tight sm:text-4xl">{t.roadmapTitle}</h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-[#48534f]">{t.roadmapLead}</p>
          <ul className="mt-5 max-w-xl space-y-3">{t.roadmapPoints.map((point) => <li key={point} className="flex gap-3 text-sm leading-6 text-[#2c3533]">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#edf3ef] text-[#315c43]"><Icon name="check" className="h-3 w-3" /></span>{point}
          </li>)}</ul>
          <Link href="/roadmap" className={`mt-7 ${primary}`}>{t.roadmapCta} →</Link>
        </div>
        <RoadmapSketch language={language} />
      </div>
    </section>

    <ReviewStream t={t} />

    <section className="mx-auto max-w-6xl px-5 pb-12 sm:px-8">
      <h2 className="font-serif text-3xl">{t.whyTitle}</h2>
      {/* Three across, then two wider ones: the minor check and the empty rooms. */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-6">
        {t.why.map(([icon, title, body, href, link], index) => <Link key={title} href={href} className={`group ${card} hover:border-[#536d64] ${index < 3 ? "lg:col-span-2" : "lg:col-span-3"}`}>
          <span className={iconTile}><Icon name={icon} /></span>
          <span className="min-w-0">
            <span className="block font-semibold text-[#202728]">{title}</span>
            <span className="mt-1 block text-sm leading-6 text-[#5d6561]">{body}</span>
            <span className="mt-2 block text-sm font-semibold text-[#a34a39] group-hover:underline">{link} →</span>
          </span>
        </Link>)}
        <RoomsCard t={t} />
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <h3 className="flex shrink-0 items-center gap-2 text-xs font-semibold uppercase tracking-[.13em] text-[#5d6561] sm:pt-1.5"><Icon name="more" className="h-3.5 w-3.5 text-[#536d64]" />{t.extrasTitle}</h3>
        <ul className="flex flex-wrap gap-2">{t.extras.map((item) => <li key={item} className="rounded-full border border-[#e0ddd5] bg-white px-3 py-1.5 text-xs text-[#48534f]">{item}</li>)}</ul>
      </div>
      <h2 className="mt-12 font-serif text-3xl">{t.faqTitle}</h2>
      <div className="mt-4 divide-y divide-[#e3e0d8] rounded-2xl border border-[#e3e0d8] bg-white">{t.faq.map(([question, answer]) => <details key={question} className="group px-5 py-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-[#24312d]">{question}<span aria-hidden="true" className="text-[#646c68] transition-transform group-open:rotate-45">+</span></summary>
        <p className="mt-2 text-sm leading-6 text-[#5d6561]">{answer}</p>
      </details>)}</div>
      <div className="mt-12 flex flex-col items-start gap-4 rounded-2xl bg-[#273c38] p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <p className="font-serif text-2xl">{t.closing}</p>
        <Link href="/plan" className="inline-flex shrink-0 items-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#273c38] hover:bg-[#edf3ef]">{hasPlan ? t.continue : t.start} →</Link>
      </div>
    </section>

    <footer className="border-t border-[#e0ddd5]"><div className="mx-auto max-w-6xl px-5 py-6 text-xs leading-5 text-[#646c68] sm:px-8">
      <p>{t.footer}</p>
      <p className="mt-1">{t.contact} <button type="button" onClick={() => openFeedback({ kind: "idea" })} className="-my-1 py-1 font-medium text-[#a34a39] hover:underline">{t.feedbackButton}</button> {t.orEmail} <a href={`mailto:${CONTACT_EMAIL}`} className="py-[5px] font-medium text-[#a34a39] hover:underline">{CONTACT_EMAIL}</a></p>
    </div></footer>
  </main>;
}
