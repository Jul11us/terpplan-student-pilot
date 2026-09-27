"use client";

import { useState } from "react";
import type { ProfessorReviews, ProfessorSummary } from "@/lib/planetterp";

type Props = {
  names: string[];
  courseId: string;
  ratings: Record<string, ProfessorSummary>;
  language: "en" | "zh";
  ratingsLoading: boolean;
  compact?: boolean;
};

const labels = {
  en: {
    average: "PlanetTerp average",
    ratingLoading: "Loading rating…",
    noRating: "No average rating",
    unmatched: "Not matched on PlanetTerp",
    unavailable: "Rating unavailable",
    reviews: "Student comments",
    show: "View comments",
    hide: "Hide comments",
    loading: "Loading comments…",
    empty: "No usable comments are available for this instructor and course.",
    failed: "PlanetTerp comments could not be loaded. Try again later.",
    otherCourse: "Another course",
    source: "All reviews on PlanetTerp",
    disclaimer: "Selected excerpts from student-submitted PlanetTerp reviews. See the source for the full set.",
  },
  zh: {
    average: "PlanetTerp 教师平均分",
    ratingLoading: "正在读取评分…",
    noRating: "暂无平均分",
    unmatched: "未能在 PlanetTerp 确认该教师",
    unavailable: "评分暂不可用",
    reviews: "学生评论",
    show: "查看评论",
    hide: "收起评论",
    loading: "正在加载评论…",
    empty: "该教师或课程暂无可展示的评论。",
    failed: "暂时无法加载 PlanetTerp 评论，请稍后再试。",
    otherCourse: "其他课程",
    source: "在 PlanetTerp 查看全部评论",
    disclaimer: "以下为 PlanetTerp 学生评论的精选摘录。完整评论请查看来源页面。",
  },
} as const;

function keyFor(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export default function SectionProfessors({ names, courseId, ratings, language, ratingsLoading, compact = false }: Props) {
  const t = labels[language];
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<Record<string, ProfessorReviews>>({});
  const uniqueNames = [...new Set(names.map((name) => name.trim()).filter(Boolean))];

  const toggleReviews = async (name: string) => {
    const key = keyFor(name) + "|" + courseId;
    if (openKey === key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(key);
    if (reviewData[key] && reviewData[key].status !== "failed") return;
    setLoadingKey(key);
    try {
      const params = new URLSearchParams({ name, course: courseId });
      const response = await fetch("/api/professor-reviews?" + params.toString());
      const payload = await response.json();
      if (!response.ok) throw new Error("reviews");
      setReviewData((current) => ({ ...current, [key]: payload as ProfessorReviews }));
    } catch {
      setReviewData((current) => ({
        ...current,
        [key]: {
          name,
          matched: false,
          status: "failed",
          averageRating: null,
          reviewCount: null,
          sourceUrl: null,
          highlights: [],
        },
      }));
    } finally {
      setLoadingKey(null);
    }
  };

  if (!uniqueNames.length) return null;
  return (
    <div className={compact ? "space-y-3" : "mt-3 space-y-3 border-t border-[#ece9e2] pt-3"}>
      {uniqueNames.map((name) => {
        const key = keyFor(name) + "|" + courseId;
        const rating = ratings[keyFor(name)];
        const data = reviewData[key];
        const isOpen = openKey === key;
        const isTba = /^(TBA|T\.B\.A\.?|TO BE ANNOUNCED|TO BE ARRANGED)$/i.test(name.trim());
        return (
          <div key={name} className="text-xs">
            <div className={compact ? "flex flex-col items-start gap-1.5" : "flex flex-wrap items-center gap-x-2 gap-y-1"}>
              <span className={`font-medium text-[#525d59] ${compact ? "text-sm" : ""}`}>{name}</span>
              {isTba ? null : rating?.averageRating !== null && rating?.averageRating !== undefined ? (
                <span className="rounded-full bg-[#f5efe2] px-2 py-1 text-[#795f2d]">
                  {t.average}: {rating.averageRating.toFixed(2)} / 5
                </span>
              ) : ratingsLoading && !rating ? (
                <span className="text-[#89908c]">{t.ratingLoading}</span>
              ) : (
                <span className="text-[#89908c]">
                  {rating?.status === "unmatched" ? t.unmatched : rating?.status === "failed" || rating?.status === "limited" ? t.unavailable : t.noRating}
                </span>
              )}
              {!isTba && rating?.status !== "unmatched" && <button
                type="button"
                onClick={() => void toggleReviews(name)}
                disabled={ratingsLoading}
                className="font-semibold text-[#9a5040] underline-offset-2 hover:underline"
                aria-expanded={isOpen}
              >
                {ratingsLoading ? t.ratingLoading : isOpen ? t.hide : t.show}
              </button>}
            </div>
            {isOpen && <div className="mt-2 rounded-lg border border-[#e7e4dc] bg-[#faf9f6] p-3">
              {loadingKey === key && <p className="text-[#68716e]">{t.loading}</p>}
              {data?.status === "failed" && <p className="text-[#8c352c]">{t.failed}</p>}
              {data?.status === "unmatched" && <p className="text-[#68716e]">{t.unmatched}</p>}
              {data && data.status !== "failed" && data.status !== "unmatched" && data.highlights.length === 0 && <p className="text-[#68716e]">{t.empty}</p>}
              {data && data.highlights.length > 0 && <>
                <p className="mb-3 leading-5 text-[#858d89]">{t.disclaimer}</p>
                <div className="space-y-3">
                  {data.highlights.map((item, index) => <div key={index} className="border-t border-[#e7e4dc] pt-3 first:border-0 first:pt-0">
                    <p className="mb-1 text-[11px] text-[#858d89]">
                      {item.courseId ?? courseId}{item.rating !== null ? " · " + item.rating : ""}{item.created ? " · " + item.created : ""}{item.otherCourse ? " · " + t.otherCourse : ""}
                    </p>
                    <p className="whitespace-pre-wrap leading-5 text-[#3e4945]">{item.excerpt}</p>
                  </div>)}
                </div>
                {data.sourceUrl && <a className="mt-3 inline-block font-semibold text-[#9a5040] hover:underline" href={data.sourceUrl} target="_blank" rel="noreferrer">{t.source} ↗</a>}
              </>}
            </div>}
          </div>
        );
      })}
    </div>
  );
}
