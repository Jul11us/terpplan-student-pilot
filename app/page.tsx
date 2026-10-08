"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDocumentLanguage } from "@/lib/document-language";
import { readSavedState, writeSavedState } from "@/lib/saved-state";
import { CONTACT_EMAIL } from "@/lib/site-config";
import { openFeedback } from "@/lib/feedback";
import homeReviews from "@/data/home-reviews.json";
import { readRegistrationDay, savedReminder } from "@/lib/registration-day";
import { RegistrationCountdown } from "@/app/components/registration-countdown";

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
    lead: "Get conflict-free schedules built around your job, and an email the moment a full section opens.",
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
    contact: "Feedback or ideas:", feedbackButton: "Send feedback", orEmail: "or email",
    closing: "Registration is coming. Have a backup plan ready.",
    registrationDay: "Registration day", registrationOpen: "Open your section numbers and backups",
    faqTitle: "Questions",
    faq: [
      ["Is TerpPlan official?", "No. It is an independent project by UMD students, not affiliated with the university. You still register in Testudo, and Testudo is the final word on sections, times and seats."],
      ["Does it cost anything?", "No. TerpPlan is free, and you can plan without an account."],
      ["Where is my plan stored?", "In your browser. If you sign in with your email, your plan, preferences and courses taken are also kept in your account so they open on your other devices; you can delete that copy. Degree audit PDFs are read in your browser and never uploaded."],
      ["How fresh are the seat counts?", "With seat emails on, watched sections are checked about every 10 minutes, sometimes later at busy times. While the planner is open it reads seats at most once a minute. A seat can fill again before you see it, so register right away."],
      ["Where does the course data come from?", "Courses, sections and seats come from UMD's Schedule of Classes (Testudo) and umd.io. Instructor ratings, reviews and average GPAs come from PlanetTerp."],
      ["Is there a Chinese version?", "Yes. Switch to 中文 at the top of any page."],
    ] as Array<[string, string]>,
  },
  zh: {
    nav: { audit: "学位审计", minor: "辅修 / 双专业", hard: "最难抢的课" },
    eyebrow: "马里兰大学 · 学生开发 · 免费",
    title: "排一份能上、也抢得到的课表",
    lead: "自动避开打工时间排课，满了的班一有空位就发邮件提醒你。",
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
    contact: "反馈和建议：", feedbackButton: "写反馈", orEmail: "或发邮件到",
    closing: "下学期选课前，先排好一份备选方案。",
    registrationDay: "选课当天", registrationOpen: "打开课号、班号和备选清单",
    faqTitle: "常见问题",
    faq: [
      ["TerpPlan 是官方的吗？", "不是。这是 UMD 学生做的独立项目，与学校没有隶属关系。最终仍要在 Testudo 注册，班次、时间和余位以 Testudo 为准。"],
      ["要钱吗？", "不要，完全免费，不注册账号也能排课。"],
      ["我的数据存在哪？", "默认存在你的浏览器里。用邮箱登录后，方案、偏好和已修课程也会保存到账号，换设备登录就能看到，你也可以删除这份副本。学位审计 PDF 只在你的浏览器里读取，不会上传。"],
      ["余位多久更新一次？", "开通邮件提醒后，关注的班次大约每 10 分钟检查一次，高峰时可能更晚。排课页打开时，最多每分钟读取一次余位。空位可能很快又被抢走，收到提醒请尽快注册。"],
      ["课程数据从哪来？", "课程、班次和余位来自 UMD 官方课表（Testudo）和 umd.io；老师评分、评论和平均 GPA 来自 PlanetTerp。"],
      ["有中文吗？", "有，在任意页面右上角切换。"],
    ] as Array<[string, string]>,
  },
} as const;

// A small picture of what the planner does: one week that keeps re-planning itself. Every couple of seconds
// one thing changes (a course is swapped, a job or the gym moves, a preference such as "no Friday classes"
// is turned on or off) and the sections are chosen again around it, keeping every class that still fits
// where it is. Blocks slide to their new times. With reduced motion it stays on the first week.
const TONES = [
  "bg-[#f9d9d6] text-[#7c2f27]", "bg-[#d3ece4] text-[#24524a]", "bg-[#f3e3b3] text-[#5f4316]", "bg-[#dcd6f0] text-[#3e3470]",
  "bg-[#d7e6f5] text-[#24496b]", "bg-[#f8dcc4] text-[#7a3f12]", "bg-[#e2edcf] text-[#3d5520]",
];
const OWN_TONE = "bg-[#e6e3dc] text-[#5d6561] outline-dashed outline-1 -outline-offset-1 outline-[#bdb8ad]";
// Days 0–4 (Mon–Fri), hours on an 8am–6pm day.
type Meeting = { day: number; start: number; end: number };
type Section = Meeting[];
const pattern = (days: number[], start: number, length: number): Section => days.map((day) => ({ day, start, end: start + length }));
const MWF = [0, 2, 4], MW = [0, 2], TUTH = [1, 3];
// Each course with the sections it could take (lecture patterns at different times).
const POOL: Array<{ id: string; sections: Section[] }> = [
  { id: "MATH141", sections: [pattern(MWF, 9, 0.83), pattern(MWF, 11, 0.83), pattern(MWF, 13, 0.83), pattern(TUTH, 14, 1.25)] },
  { id: "CMSC132", sections: [pattern(TUTH, 9.5, 1.25), pattern(TUTH, 12.5, 1.25), pattern(MW, 14, 1.25)] },
  { id: "COMM107", sections: [pattern(MW, 8, 0.83), pattern(MW, 11, 0.83), pattern(TUTH, 11, 1.25), pattern(MW, 15, 0.83), pattern(TUTH, 16, 1.25)] },
  { id: "PSYC100", sections: [pattern(MWF, 10, 0.83), pattern(TUTH, 14, 1.25), pattern(MW, 16, 1.25)] },
  { id: "ENGL101", sections: [pattern(TUTH, 8, 1.25), pattern(MW, 12, 1.25), pattern(TUTH, 12.5, 1.25), pattern(MW, 15.5, 1.25)] },
  { id: "BMGT220", sections: [pattern(MW, 10, 1.25), pattern(TUTH, 9.5, 1.25), pattern(TUTH, 15.5, 1.25)] },
  { id: "ECON200", sections: [pattern(TUTH, 11, 1.25), pattern(MWF, 12, 0.83), pattern(MW, 13.5, 1.25)] },
  { id: "STAT400", sections: [pattern(MW, 14, 1.25), pattern(TUTH, 9.5, 1.25), pattern(MWF, 15, 0.83)] },
  { id: "CHEM135", sections: [pattern(MWF, 9, 0.83), pattern(MWF, 12, 0.83), pattern(MWF, 14, 0.83)] },
  { id: "BSCI170", sections: [pattern(TUTH, 11, 1.25), pattern(TUTH, 14, 1.25), pattern(MW, 9.5, 1.25)] },
  { id: "INST126", sections: [pattern(MW, 10, 1.25), pattern(TUTH, 15.5, 1.25), pattern(MW, 16, 1.25)] },
  { id: "HIST200", sections: [pattern(TUTH, 12.5, 1.25), pattern(MW, 11, 1.25), pattern(MWF, 13, 0.83)] },
  { id: "PHYS161", sections: [pattern(MWF, 10, 0.83), pattern(MWF, 15, 0.83), pattern(TUTH, 8, 1.25)] },
  { id: "ARTT100", sections: [pattern([4], 13, 2.75), pattern([1], 13, 2.75), pattern([3], 9, 2.75)] },
];
const OWN: Array<{ label: { en: string; zh: string }; text: { en: string; zh: string }; meetings: Section }> = [
  { label: { en: "Job", zh: "打工" }, text: { en: "Job Tue & Thu 1–4pm", zh: "周二周四 1–4pm 打工" }, meetings: pattern(TUTH, 13, 3) },
  { label: { en: "Job", zh: "打工" }, text: { en: "Job Mon & Wed 3–6pm", zh: "周一周三 3–6pm 打工" }, meetings: pattern(MW, 15, 3) },
  { label: { en: "Job", zh: "打工" }, text: { en: "Job Fri mornings", zh: "周五上午打工" }, meetings: pattern([4], 8.5, 3.5) },
  { label: { en: "Gym", zh: "健身" }, text: { en: "Gym Tue & Thu 8–9am", zh: "周二周四早上健身" }, meetings: pattern(TUTH, 8, 1) },
  { label: { en: "Club", zh: "社团" }, text: { en: "Club Wed 4–6pm", zh: "周三下午社团" }, meetings: pattern([2], 16, 2) },
];
type Preference = "none" | "noFriday" | "lateStart" | "earlyEnd";
const PREFERENCES: Record<Preference, { en: string; zh: string } | null> = {
  none: null, noFriday: { en: "No Friday classes", zh: "周五不上课" }, lateStart: { en: "Nothing before 10", zh: "10 点前不上课" }, earlyEnd: { en: "Done by 3pm", zh: "下午 3 点前下课" },
};
type Week = { courses: string[]; picked: Record<string, number>; own: number; preference: Preference };

const random = (count: number) => Math.floor(Math.random() * count);
const overlaps = (a: Meeting, b: Meeting) => a.day === b.day && a.start < b.end && b.start < a.end;
const allowed = (section: Section, preference: Preference) => section.every((meeting) =>
  !(preference === "noFriday" && meeting.day === 4) && !(preference === "lateStart" && meeting.start < 10) && !(preference === "earlyEnd" && meeting.end > 15));

const COURSE_COUNT = 5;

// Chooses a section for each course in turn: the one it has if that still fits, otherwise the first that does.
// A course with no section left that fits is replaced by another course that fits, so the week keeps five.
function plan(week: Week): Week {
  const taken: Meeting[] = [...OWN[week.own]!.meetings];
  const picked: Record<string, number> = {};
  const courses: string[] = [];
  const place = (id: string) => {
    const course = POOL.find((item) => item.id === id)!;
    const fits = (index: number) => allowed(course.sections[index]!, week.preference) && course.sections[index]!.every((meeting) => !taken.some((other) => overlaps(meeting, other)));
    const choice = [week.picked[id] ?? 0, ...course.sections.map((_, index) => index)].find(fits);
    if (choice === undefined) return;
    picked[id] = choice; courses.push(id); taken.push(...course.sections[choice]!);
  };
  week.courses.slice(0, COURSE_COUNT).forEach(place);
  const start = random(POOL.length);
  for (let step = 0; step < POOL.length && courses.length < COURSE_COUNT; step += 1) {
    const id = POOL[(start + step) % POOL.length]!.id;
    if (!courses.includes(id) && !week.courses.includes(id)) place(id);
  }
  return { ...week, courses, picked };
}

// One change at a time: swap a course, move the personal commitment, or change the preference.
function nextWeek(week: Week): Week {
  const roll = Math.random();
  if (roll < 0.45) {
    const outside = POOL.map((item) => item.id).filter((id) => !week.courses.includes(id));
    const out = random(week.courses.length);
    return plan({ ...week, courses: [...week.courses.filter((_, index) => index !== out), outside[random(outside.length)]!] });
  }
  if (roll < 0.75) return plan({ ...week, own: (week.own + 1 + random(OWN.length - 1)) % OWN.length });
  const options = (Object.keys(PREFERENCES) as Preference[]).filter((item) => item !== week.preference);
  return plan({ ...week, preference: options[random(options.length)]! });
}

const FIRST_WEEK = plan({ courses: ["MATH141", "CMSC132", "COMM107", "PSYC100", "ENGL101"], picked: {}, own: 0, preference: "none" });
const toneOf = (id: string) => TONES[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % TONES.length]!;

function TimetableSketch({ language }: { language: Language }) {
  const days = language === "zh" ? ["周一", "周二", "周三", "周四", "周五"] : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const [week, setWeek] = useState<Week>(FIRST_WEEK);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setWeek((current) => nextWeek(current)), 2200);
    return () => window.clearInterval(timer);
  }, []);
  const at = (hour: number) => ((hour - 8) / 10) * 100;
  const own = OWN[week.own]!;
  const preference = PREFERENCES[week.preference];
  const blocks = [
    ...week.courses.flatMap((id) => POOL.find((item) => item.id === id)!.sections[week.picked[id]!]!.map((meeting, index) => ({ key: `${id}-${index}`, label: id, tone: toneOf(id), meeting }))),
    ...own.meetings.map((meeting, index) => ({ key: `own-${index}`, label: own.label[language], tone: OWN_TONE, meeting })),
  ];
  return <figure aria-hidden="true" className="rounded-2xl border border-[#e0ddd5] bg-white p-3 shadow-sm">
    <figcaption className="mb-3 flex min-h-7 flex-wrap items-center gap-1.5 px-1 text-[11px] font-semibold">
      <span className="rounded-full bg-[#f1efe9] px-2.5 py-1 text-[#48534f] transition-all">{own.text[language]}</span>
      {preference && <span className="rounded-full bg-[#edf3ef] px-2.5 py-1 text-[#273c38]">{preference[language]}</span>}
    </figcaption>
    <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] font-semibold text-[#646c68]">{days.map((day, index) => <span key={day} className={`transition-opacity duration-500 ${week.preference === "noFriday" && index === 4 ? "opacity-40" : ""}`}>{day}</span>)}</div>
    <div className="relative mt-2 grid h-60 grid-cols-5 gap-1.5">
      {days.map((day, index) => <div key={day} className={`rounded-md transition-colors duration-500 ${week.preference === "noFriday" && index === 4 ? "bg-[#efece6]" : "bg-[#f7f5f0]"}`} />)}
      {blocks.map(({ key, label, tone, meeting }) => <div key={key} className={`sketch-in absolute flex items-center justify-center overflow-hidden rounded-md text-[10px] font-semibold transition-all duration-700 ease-out ${tone}`}
        style={{ left: `calc(${meeting.day} * (100% + 6px) / 5)`, width: "calc((100% - 24px) / 5)", top: `${at(meeting.start)}%`, height: `${at(meeting.end) - at(meeting.start)}%` }}>{label}</div>)}
    </div>
  </figure>;
}

// Real student reviews of popular intro courses (data/home-reviews.json, from PlanetTerp), praise and criticism,
// drifting past in one row: the kind of reviews the planner shows next to each instructor. Cards name the
// course, not the instructor. Each visit shows a different mix; hovering pauses; a card opens the course on
// PlanetTerp.
type HomeReview = { course: string; rating: number; excerpt: string };
const REVIEWS = (homeReviews as { reviews: HomeReview[] }).reviews;

function ReviewCard({ review, copy = false }: { review: HomeReview; copy?: boolean }) {
  return <a href={`https://planetterp.com/course/${review.course}`} target="_blank" rel="noreferrer" tabIndex={copy ? -1 : undefined} className="flex w-80 shrink-0 flex-col justify-between rounded-2xl border border-[#e3e0d8] bg-white p-4 text-left hover:border-[#536d64]">
    <p className="text-sm leading-6 text-[#2c3533]">“{review.excerpt}”</p>
    <p className="mt-3 flex items-center justify-between gap-2 text-[11px] text-[#646c68]">
      <span className="font-semibold text-[#273c38]">{review.course}</span>
      <span className="shrink-0 tracking-wider" aria-label={`${review.rating} / 5`}><span className="text-[#a3772b]">{"★".repeat(review.rating)}</span><span className="text-[#d9d6ce]">{"★".repeat(5 - review.rating)}</span></span>
    </p>
  </a>;
}

function ReviewStream({ language }: { language: Language }) {
  const [order, setOrder] = useState(REVIEWS);
  useEffect(() => {
    // A new mix each visit, shuffled after the first render so the server and client HTML match.
    const shuffled = [...REVIEWS];
    for (let index = shuffled.length - 1; index > 0; index -= 1) { const other = Math.floor(Math.random() * (index + 1)); [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!]; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrder(shuffled);
  }, []);
  const rows = [order.slice(0, 30)];
  return <section aria-labelledby="reviews-title" className="py-12">
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <h2 id="reviews-title" className="font-serif text-3xl">{language === "zh" ? "在 TerpPlan 里，每门课都能看到同学的真实评价" : "See what students really say about each class"}</h2>
      <p className="mt-2 text-sm text-[#5d6561]">{language === "zh" ? "以下是 PlanetTerp 上热门入门课的评论，好评差评都有，每次随机。排课时点老师名字，就能看到他教这门课的评价。" : "Reviews of popular intro courses from PlanetTerp, good and bad, a different mix each visit. In the planner, click an instructor to see theirs."}</p>
    </div>
    <div className="mt-6 [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
      {rows.map((row, index) => <div key={index} className="marquee overflow-hidden">
        {/* Two copies of the row: moving by half the width loops without a jump. The copy is hidden from screen readers. */}
        <div className={`marquee-track flex w-max ${index ? "reverse" : ""}`} style={{ ["--marquee-duration" as string]: index ? "220s" : "200s" }}>
          <div className="flex gap-4 pr-4">{row.map((review, item) => <ReviewCard key={item} review={review} />)}</div>
          <div aria-hidden="true" className="flex gap-4 pr-4">{row.map((review, item) => <ReviewCard key={item} review={review} copy />)}</div>
        </div>
      </div>)}
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
    if (saved.language) setLanguage(saved.language);
    setHasPlan(Object.values(saved.plans).some((courses) => courses.length > 0));
    const day = readRegistrationDay();
    if (day?.courses.length) setRegistration(savedReminder(day.termName));
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
        {registration && <Link href="/register" className="whitespace-nowrap rounded-lg border border-[#cddbd1] bg-[#edf3ef] px-3 py-2 text-xs font-semibold text-[#273c38] hover:bg-[#e2ece6]">📋 {t.registrationDay}</Link>}
        <button type="button" onClick={switchLanguage} className="rounded-lg border border-[#dcd9d0] px-3 py-2 text-xs">{language === "en" ? "中文" : "English"}</button>
        <Link href="/plan" className="whitespace-nowrap rounded-lg bg-[#273c38] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d302c]">{hasPlan ? t.continue : t.start} →</Link>
      </div>
    </div></header>

    <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-12 pt-12 sm:px-8 sm:pt-16 lg:grid-cols-[1.15fr_1fr]">
      <div>
        {registration && <Link href="/register" className="mb-6 flex max-w-xl flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-[#cddbd1] bg-[#edf3ef] px-4 py-3 hover:border-[#536d64]">
          <span className="min-w-0"><span className="block text-sm font-semibold text-[#273c38]">📋 {t.registrationDay}</span>{registration.date && registration.time ? <RegistrationCountdown date={registration.date} time={registration.time} language={language} /> : null}</span>
          <span className="text-xs font-semibold text-[#a34a39]">{t.registrationOpen} →</span>
        </Link>}
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

    <ReviewStream language={language} />

    <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <h2 className="font-serif text-3xl">{t.whyTitle}</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">{t.why.map(([title, body, href, link]) => <Link key={title} href={href} className="group rounded-2xl border border-[#e3e0d8] bg-white p-5 hover:border-[#536d64]">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[#5d6561]">{body}</p>
        <p className="mt-3 text-sm font-semibold text-[#a34a39] group-hover:underline">{link} →</p>
      </Link>)}</div>
      <h2 className="mt-12 text-sm font-semibold uppercase tracking-[.13em] text-[#5d6561]">{t.extrasTitle}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">{t.extras.map((item) => <li key={item} className="rounded-full border border-[#e0ddd5] bg-white px-3 py-1.5 text-xs text-[#48534f]">{item}</li>)}</ul>
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
      <p className="mt-1">{t.contact} <button type="button" onClick={() => openFeedback({ kind: "idea" })} className="font-medium text-[#a34a39] hover:underline">{t.feedbackButton}</button> {t.orEmail} <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-[#a34a39] hover:underline">{CONTACT_EMAIL}</a></p>
    </div></footer>
  </main>;
}
