// "Report a problem" links: a mailto: draft that already names the course, sections and term, so a report
// says exactly where the wrong time, room, seat count or map link was. Nothing is sent until the student
// sends the email themselves, and nothing else from the browser (courses taken, events) is included.

import { CONTACT_EMAIL } from "@/lib/site-config";

export type ReportContext = {
  term: string;
  courseId?: string;
  sectionIds?: string[];
  seatReadAt?: string | null;
  language: "en" | "zh";
};

export function reportMailto({ term, courseId, sectionIds = [], seatReadAt, language }: ReportContext) {
  const about = courseId ?? (sectionIds.length ? sectionIds.join(", ") : "");
  const subject = language === "zh" ? `TerpPlan 问题反馈：${about || term}（${term}）` : `TerpPlan problem: ${about || term} (${term})`;
  const details = [
    courseId ? `Course: ${courseId}` : "",
    sectionIds.length ? `Sections: ${sectionIds.join(", ")}` : "",
    `Term: ${term}`,
    seatReadAt ? `Seat data read: ${seatReadAt}` : "",
    // The page only, never its #fragment, which can hold a whole plan.
    typeof window === "undefined" ? "" : `Page: ${window.location.origin}${window.location.pathname}`,
  ].filter(Boolean).join("\n");
  const prompt = language === "zh"
    ? "哪里不对？（比如上课时间、教室、空位数、楼的地图链接、老师评分）\n\n\n"
    : "What looks wrong? (for example a class time, room, seat count, building map link or instructor rating)\n\n\n";
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(prompt + "---\n" + details)}`;
}
