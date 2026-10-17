"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { openFeedback } from "@/lib/feedback";

type Language = "en" | "zh";
export type SitePage = "plan" | "audit" | "minor" | "hard" | "rooms" | "week";

// Phones get the short names, so the whole row fits next to the thumb.
const LINKS: Array<{ page: SitePage; href: string; label: Record<Language, string>; short: Record<Language, string> }> = [
  { page: "plan", href: "/plan", label: { en: "Planner", zh: "排课" }, short: { en: "Plan", zh: "排课" } },
  { page: "audit", href: "/audit", label: { en: "Degree audit", zh: "学位审计" }, short: { en: "Audit", zh: "审计" } },
  { page: "minor", href: "/minor", label: { en: "Minors", zh: "辅修 / 双专业" }, short: { en: "Minor", zh: "辅修" } },
  { page: "hard", href: "/hard-courses", label: { en: "Hardest courses", zh: "最难抢的课" }, short: { en: "Hardest", zh: "难抢的课" } },
  { page: "rooms", href: "/rooms", label: { en: "Empty rooms", zh: "空教室" }, short: { en: "Rooms", zh: "空教室" } },
  { page: "week", href: "/week", label: { en: "My week", zh: "我的一周" }, short: { en: "My week", zh: "我的一周" } },
];

const LINK_CLASS = "inline-flex min-h-8 shrink-0 items-center whitespace-nowrap rounded-lg px-1.5 hover:bg-[#eeece6] hover:text-[#a34a39] sm:px-2";

// The same header on every page: the logo (home), every tool, feedback and the language switch. A page can
// add its own buttons before the language switch (the planner's About, the home page's Start).
export function SiteHeader({ language, onLanguage, current, wide = false, actions }: {
  language: Language;
  onLanguage: () => void;
  current?: SitePage;
  wide?: boolean;
  actions?: ReactNode;
}) {
  return <header className="border-b border-[#dedbd3] bg-[#fbfaf8]">
    <div className={`mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 sm:px-8 ${wide ? "max-w-[1320px]" : "max-w-6xl"}`}>
      <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#bd302f] font-serif text-lg text-white">T</span>TerpPlan</Link>
      {/* Below lg the links take their own row under the logo, so the header never runs off a phone. */}
      <nav aria-label={language === "en" ? "TerpPlan tools" : "TerpPlan 工具"} className="order-last -mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-0.5 overflow-x-auto text-xs font-medium text-[#48534f] sm:-mx-2 sm:w-[calc(100%+1rem)] lg:order-none lg:mx-0 lg:mr-auto lg:w-auto">
        {LINKS.map((link) => <Link key={link.page} href={link.href} aria-current={current === link.page ? "page" : undefined}
          className={`${LINK_CLASS} ${current === link.page ? "bg-[#edf3ef] font-semibold text-[#273c38]" : ""}`}>
          <span className="sm:hidden">{link.short[language]}</span><span className="hidden sm:inline">{link.label[language]}</span>
        </Link>)}
        <button type="button" onClick={() => openFeedback({ kind: "idea" })} className={LINK_CLASS}>{language === "en" ? "Feedback" : "反馈"}</button>
      </nav>
      <div className="flex items-center gap-2">
        {actions}
        <button type="button" onClick={onLanguage} className="min-h-8 whitespace-nowrap rounded-lg border border-[#dcd9d0] px-3 text-xs font-medium hover:bg-white">{language === "en" ? "中文" : "English"}</button>
      </div>
    </div>
  </header>;
}
