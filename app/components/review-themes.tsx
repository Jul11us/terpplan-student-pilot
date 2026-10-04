import { THEME_LABELS, type ReviewTheme } from "@/lib/review-themes";

type Language = "en" | "zh";

const copy = {
  en: { title: "What reviews keep mentioning", count: "{n} of {total} reviews", note: "Counted from the words reviewers used ({total} PlanetTerp reviews), not a summary anyone wrote." },
  zh: { title: "评价里反复提到的", count: "{total} 条评价中有 {n} 条", note: "按评价里用到的词统计（共 {total} 条 PlanetTerp 评价），不是谁写的总结。" },
} as const;

const TONE = {
  good: "border-[#cddbd1] bg-[#edf3ef] text-[#315c43]",
  bad: "border-[#ead8b5] bg-[#fff8e8] text-[#745424]",
  neutral: "border-[#e0ddd5] bg-[#f6f4ef] text-[#48534f]",
} as const;

// The themes as chips, each with how many reviews mention it, so "Hard exams" from 2 of 60 reviews does not
// read like a verdict.
export default function ReviewThemes({ themes, total, language, compact = false }: { themes: ReviewTheme[] | undefined; total: number | null; language: Language; compact?: boolean }) {
  if (!themes?.length || !total) return null;
  const t = copy[language];
  return <div className={compact ? "mt-1" : "mb-3"}>
    <p className={`font-semibold text-[#5d6561] ${compact ? "text-[11px]" : "text-xs"}`}>{t.title}</p>
    <ul className="mt-1.5 flex flex-wrap gap-1.5">{themes.map((theme) => <li key={theme.key} title={t.count.replace("{n}", String(theme.count)).replace("{total}", String(total))} className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE[theme.tone]}`}>
      {THEME_LABELS[language][theme.key]} <span className="font-normal opacity-90">· {theme.count}</span>
    </li>)}</ul>
    <p className="mt-1 text-[10px] leading-4 text-[#646c68]">{t.note.replace("{total}", String(total))}</p>
  </div>;
}
