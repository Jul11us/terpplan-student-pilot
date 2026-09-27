"use client";

import { useEffect, useRef } from "react";
import { analyticsEnabled } from "@/lib/site-config";

type Language = "en" | "zh";

const CONTACT_EMAIL = "terpplan@proton.me";

const copy = {
  en: {
    title: "About TerpPlan",
    intro: "TerpPlan is a free, student-built tool that helps University of Maryland students review degree audits, find courses, compare conflict-free schedules, and keep an eye on open seats.",
    unofficial: "TerpPlan is an independent project. It is not affiliated with or endorsed by the University of Maryland. Always confirm sections and register through Testudo.",
    dataTitle: "Where the data comes from",
    data: [
      "Courses, sections, and seat counts come from umd.io and the UMD Schedule of Classes. Seat counts can lag the official numbers.",
      "Instructor averages and review excerpts come from PlanetTerp and link back to the source.",
    ],
    creditBefore: "The degree audit course-suggestion workflow was informed by",
    creditAfter: ", with the creator's permission.",
    privacyTitle: "Your privacy",
    privacy: [
      "Your plan and schedule preferences are saved only in this browser.",
      "Your degree audit PDF is read only in your browser; the PDF and extracted audit text are not uploaded or saved.",
      "If you share a schedule, its link contains the term and section numbers, and anyone with the link can view that schedule. No name, email, or seat watches are included.",
      "Your email is used to send sign-in codes for seat watches. It is stored only if you turn on seat emails, and deleted when you turn them off.",
      "With seat emails on, TerpPlan checks your watched sections about every 10 minutes and emails you once each time a full section opens. Every email has a link to stop them.",
      "Seat watches are removed automatically 150 days after you add them.",
    ],
    analytics: "We count visits anonymously with Cloudflare Web Analytics (no cookies, no personal data) to see how TerpPlan is used.",
    contactTitle: "Feedback & collaboration",
    contact: "Found a bug, have an idea, or want to work together? Email",
    close: "Close",
  },
  zh: {
    title: "关于 TerpPlan",
    intro: "TerpPlan 是一个由学生开发的免费工具，帮助马里兰大学的同学核对学位审计、查找课程、比较无时间冲突的排课方案，并关注课程余位。",
    unofficial: "TerpPlan 是独立项目，与马里兰大学没有隶属或官方合作关系。班次信息请以 Testudo 为准，并在 Testudo 完成注册。",
    dataTitle: "数据来源",
    data: [
      "课程、班次和余位来自 umd.io 与马里兰大学官方课表（Schedule of Classes），余位数可能比官方数据稍晚更新。",
      "教师平均分和评论摘录来自 PlanetTerp，并附有原文链接。",
    ],
    creditBefore: "学位审计课程建议的流程参考了",
    creditAfter: "，并已获得项目作者授权。",
    privacyTitle: "隐私",
    privacy: [
      "你的排课计划和偏好只保存在当前浏览器里。",
      "学位审计 PDF 只在你的浏览器里读取；PDF 和解析出的审计文字不会上传或保存。",
      "分享方案时，链接里会包含学期和班号，拿到链接的人都能查看这个方案；链接里不含姓名、邮箱或余位关注信息。",
      "邮箱用于发送余位关注的登录验证码；只有开启邮件提醒时才会保存，关闭提醒后即删除。",
      "开启邮件提醒后，TerpPlan 约每 10 分钟检查一次你关注的班次，班次从满员变为有空位时每次发一封邮件，每封邮件都附有停止提醒的链接。",
      "关注的班次会在添加 150 天后自动删除。",
    ],
    analytics: "我们使用 Cloudflare Web Analytics 匿名统计访问量（不使用 cookie，不收集个人信息），以了解 TerpPlan 的使用情况。",
    contactTitle: "反馈与合作",
    contact: "发现问题、有建议，或想合作？欢迎发邮件到",
    close: "关闭",
  },
} as const;

export default function AboutDialog({ language, onClose }: { language: Language; onClose: () => void }) {
  const t = copy[language];
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#202728]/40 px-4 py-10 sm:items-center" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-6 text-[#202728] shadow-xl sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <h2 id="about-title" className="font-serif text-2xl">{t.title}</h2>
        <button ref={closeRef} onClick={onClose} aria-label={t.close} className="rounded-lg border border-[#dcd9d0] px-2.5 py-1 text-sm text-[#68716e] hover:bg-white">✕</button>
      </div>
      <p className="mt-4 text-sm leading-6 text-[#48534f]">{t.intro}</p>
      <p className="mt-3 rounded-xl border border-[#ead8b5] bg-[#fff8e8] px-4 py-3 text-xs leading-5 text-[#745424]">{t.unofficial}</p>
      <h3 className="mt-6 text-xs font-semibold uppercase tracking-[.13em] text-[#9a5040]">{t.dataTitle}</h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-[#48534f]">{t.data.map((item) => <li key={item}>{item}</li>)}</ul>
      <p className="mt-2 text-xs leading-5 text-[#68716e]">{t.creditBefore} <a href="https://github.com/wonder4hth/umd-course-recommender" target="_blank" rel="noopener noreferrer" className="font-medium text-[#a34a39] underline underline-offset-2">wonder4hth/umd-course-recommender</a>{t.creditAfter}</p>
      <h3 className="mt-5 text-xs font-semibold uppercase tracking-[.13em] text-[#9a5040]">{t.privacyTitle}</h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-[#48534f]">{[...t.privacy, ...(analyticsEnabled ? [t.analytics] : [])].map((item) => <li key={item}>{item}</li>)}</ul>
      <h3 className="mt-5 text-xs font-semibold uppercase tracking-[.13em] text-[#9a5040]">{t.contactTitle}</h3>
      <p className="mt-2 text-sm leading-6 text-[#48534f]">{t.contact} <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#a34a39] underline underline-offset-2">{CONTACT_EMAIL}</a></p>
    </section>
  </div>;
}
