"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { sharingEnabled, sharingId, setSharing, subscribeSharing } from "@/lib/popularity-sharing";
import type { PopularCourse } from "@/lib/seat-trends";

type PopularCoursesProps = {
  term: string;
  lang: "en" | "zh";
  courseIds: string[];
};

const texts = {
  en: {
    title: "Popular Courses",
    loading: "Loading...",
    error: "Could not load popular courses",
    planCount: "shared browsers",
    activeCount: "active shared plans",
    demand: "Demand",
    trendRising: "↗ Rising",
    trendStable: "→ Stable",
    trendFalling: "↘ Falling",
    empty: "No popular courses yet",
  },
  zh: {
    title: "热门课程",
    loading: "加载中...",
    error: "无法加载热门课程",
    planCount: "个匿名浏览器",
    activeCount: "个活跃共享计划",
    demand: "热度",
    trendRising: "↗ 上升",
    trendStable: "→ 稳定",
    trendFalling: "↘ 下降",
    empty: "暂无热门课程",
  },
};

export function PopularCourses({ term, lang, courseIds }: PopularCoursesProps) {
  const shared = useSyncExternalStore(subscribeSharing, sharingEnabled, () => false);
  const [revision, setRevision] = useState(0);
  const [syncFailed, setSyncFailed] = useState(false);
  const courseKey = [...new Set(courseIds)].sort().join(",");
  useEffect(() => {
    const id = sharingId();
    if (!id) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch("/api/trends/activity", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ term, id, courseIds: shared ? courseKey.split(",").filter(Boolean) : [], withdraw: !shared }), signal: controller.signal })
        .then((response) => { if (!response.ok) throw new Error("sharing"); if (!controller.signal.aborted) { setSyncFailed(false); setRevision((value) => value + 1); } })
        .catch(() => { if (!controller.signal.aborted) setSyncFailed(true); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term, courseKey, shared]);
  return <section aria-label={lang === "zh" ? "热门课程" : "Popular courses"}>
    <label className="flex items-start gap-2 text-xs text-[#59635f]"><input type="checkbox" checked={shared} onChange={(event) => setSharing(event.target.checked)} />{lang === "zh" ? "分享当前计划的匿名课程统计，帮助生成热门榜（可随时关闭）" : "Share anonymous course counts from this plan for the popularity list (optional)"}</label>
    <p className="mt-1 text-[11px] text-[#646c68]">{lang === "zh" ? "开启后仅发送学期、课程编号和随机浏览器编号。榜单来自自愿共享的样本；不代表全校选课人数。" : "Sharing sends the term, course codes and a random browser ID. Counts reflect voluntary shared plans, not campus enrollment."}</p>
    {syncFailed && <p role="alert" className="text-xs text-[#8c352c]">{lang === "zh" ? "共享统计尚未更新，请稍后重试。" : "Shared counts have not been updated. Please try again later."}</p>}
    <PopularCourseList key={term + "|" + revision} term={term} lang={lang} />
  </section>;
}

function PopularCourseList({ term, lang }: { term: string; lang: "en" | "zh" }) {
  const t = texts[lang];
  const [courses, setCourses] = useState<PopularCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    fetch(`/api/trends/popular?term=${term}&limit=20`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        if (!data || typeof data !== "object" || !("courses" in data) || !Array.isArray(data.courses)) throw new Error("Invalid popularity response");
        if (mounted && data && typeof data === 'object' && 'courses' in data) {
          setCourses((data.courses as PopularCourse[]) ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [term]);

  if (loading) {
    return (
      <div className="popular-courses loading">
        <p>{t.loading}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="popular-courses error">
        <p>{t.error}</p>
      </div>
    );
  }

  if (!courses.length) {
    return (
      <div className="popular-courses empty">
        <p>{t.empty}</p>
      </div>
    );
  }

  return (
    <div className="popular-courses">
      <h3>{t.title}</h3>
      <div className="courses-list">
        {courses.map((course, index) => (
          <div key={course.courseId} className="course-card">
            <div className="rank">#{index + 1}</div>
            <div className="course-info">
              <div className="course-header">
                <span className="course-id">{course.courseId}</span>
                <span className={`trend trend-${course.trendDirection}`}>
                  {t[`trend${course.trendDirection.charAt(0).toUpperCase()}${course.trendDirection.slice(1)}` as keyof typeof t]}
                </span>
              </div>
              <div className="course-title">{course.courseTitle}</div>
              <div className="course-stats">
                <span>
                  {course.activeCount} {t.activeCount}
                </span>
                <span className="separator">·</span>
                <span>
                  {course.planCount} {t.planCount}
                </span>
                <span className="separator">·</span>
                <span className={`demand demand-${Math.floor(course.demandIndex / 20)}`}>
                  {t.demand} {course.demandIndex}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .popular-courses {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 1.5rem;
          margin-block: 1rem;
        }

        .popular-courses.loading,
        .popular-courses.error,
        .popular-courses.empty {
          padding: 3rem;
          text-align: center;
          color: #9ca3af;
        }

        .popular-courses h3 {
          margin: 0 0 1.25rem 0;
          font-size: 1.125rem;
          font-weight: 700;
          color: #111827;
        }

        .courses-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .course-card {
          display: flex;
          gap: 1rem;
          padding: 1rem;
          background: #fafafa;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          transition: all 0.15s;
        }

        .course-card:hover {
          background: #f3f4f6;
          border-color: #d1d5db;
          transform: translateX(2px);
        }

        .rank {
          flex-shrink: 0;
          width: 2rem;
          height: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.875rem;
          color: #6b7280;
          background: #ffffff;
          border: 2px solid #e5e7eb;
          border-radius: 50%;
        }

        .course-card:nth-child(1) .rank {
          color: #eab308;
          border-color: #eab308;
          background: #fef9c3;
        }

        .course-card:nth-child(2) .rank {
          color: #9ca3af;
          border-color: #9ca3af;
          background: #f3f4f6;
        }

        .course-card:nth-child(3) .rank {
          color: #f59e0b;
          border-color: #f59e0b;
          background: #fef3c7;
        }

        .course-info {
          flex: 1;
          min-width: 0;
        }

        .course-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.25rem;
        }

        .course-id {
          font-size: 0.875rem;
          font-weight: 600;
          font-family: "SF Mono", "Consolas", monospace;
          color: #3b82f6;
        }

        .trend {
          font-size: 0.75rem;
          padding: 0.125rem 0.5rem;
          border-radius: 999px;
          font-weight: 500;
        }

        .trend-rising {
          background: #dcfce7;
          color: #166534;
        }

        .trend-stable {
          background: #f3f4f6;
          color: #6b7280;
        }

        .trend-falling {
          background: #fee2e2;
          color: #991b1b;
        }

        .course-title {
          font-size: 0.9375rem;
          font-weight: 500;
          color: #111827;
          margin-bottom: 0.5rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .course-stats {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8125rem;
          color: #6b7280;
        }

        .separator {
          color: #d1d5db;
        }

        .demand {
          font-weight: 600;
        }

        .demand-0 { color: #10b981; }
        .demand-1 { color: #22c55e; }
        .demand-2 { color: #eab308; }
        .demand-3 { color: #f59e0b; }
        .demand-4 { color: #ef4444; }
        .demand-5 { color: #dc2626; }

        @media (prefers-color-scheme: dark) {
          .popular-courses {
            background: #111827;
            border-color: #374151;
          }

          .popular-courses h3 {
            color: #f9fafb;
          }

          .course-card {
            background: #1f2937;
            border-color: #374151;
          }

          .course-card:hover {
            background: #374151;
            border-color: #4b5563;
          }

          .rank {
            background: #111827;
            border-color: #4b5563;
            color: #9ca3af;
          }

          .course-card:nth-child(1) .rank {
            background: #422006;
            border-color: #eab308;
            color: #fde047;
          }

          .course-card:nth-child(2) .rank {
            background: #1f2937;
            border-color: #6b7280;
            color: #d1d5db;
          }

          .course-card:nth-child(3) .rank {
            background: #431407;
            border-color: #f59e0b;
            color: #fbbf24;
          }

          .course-id {
            color: #60a5fa;
          }

          .course-title {
            color: #f9fafb;
          }

          .course-stats {
            color: #9ca3af;
          }

          .trend-rising {
            background: #064e3b;
            color: #6ee7b7;
          }

          .trend-stable {
            background: #374151;
            color: #d1d5db;
          }

          .trend-falling {
            background: #7f1d1d;
            color: #fca5a5;
          }
        }

        @media (max-width: 640px) {
          .popular-courses {
            padding: 1rem;
          }

          .course-card {
            padding: 0.75rem;
          }

          .rank {
            width: 1.75rem;
            height: 1.75rem;
            font-size: 0.75rem;
          }

          .course-title {
            font-size: 0.875rem;
          }

          .course-stats {
            font-size: 0.75rem;
            flex-wrap: wrap;
          }
        }
      `}</style>
    </div>
  );
}
