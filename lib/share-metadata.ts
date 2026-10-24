// What a shared schedule link says when it is pasted into a chat (iMessage, WeChat, Instagram, Discord): the term
// and course numbers it carries, in the sender's language. Nothing else is in the link, so nothing personal is shown.

import { parseSharedSchedule } from "@/lib/shared-schedule";
import { formatTermName } from "@/lib/seat-trends";

const SHOWN = 4;

export function shareMetadata(query: URLSearchParams): { title: string; description: string; language: "en" | "zh" } | null {
  const shared = parseSharedSchedule(query);
  if (!shared) return null;
  const { language } = shared;
  const courses = [...new Set(shared.sectionIds.map((id) => id.slice(0, id.lastIndexOf("-"))))];
  const listed = courses.slice(0, SHOWN).join(language === "zh" ? "、" : ", ") + (courses.length > SHOWN ? ` +${courses.length - SHOWN}` : "");
  const term = formatTermName(shared.term, language);
  return language === "zh"
    ? {
      language,
      title: `${term}课表 · ${listed} · TerpPlan`,
      description: `在 TerpPlan 分享的 UMD 课表，共 ${courses.length} 门课。打开可以看每周课表和最新余位；存了自己的“我的一周”，还能对比两份课表的空档。`,
    }
    : {
      language,
      title: `${term} schedule · ${listed} · TerpPlan`,
      description: `A UMD schedule shared on TerpPlan: ${courses.length === 1 ? "1 course" : `${courses.length} courses`}. Open it for the weekly timetable and current seats; with your own My week saved, compare the gaps in both timetables.`,
    };
}
