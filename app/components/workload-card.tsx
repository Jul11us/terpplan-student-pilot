"use client";

import { useEffect, useState } from "react";
import { semesterWorkload, type WorkloadLevel } from "@/lib/workload";

type Language = "en" | "zh";

const copy = {
  en: {
    title: "How heavy this semester looks",
    level: { light: "Light", moderate: "Moderate", heavy: "Heavy", veryHeavy: "Very heavy" } as Record<WorkloadLevel, string>,
    hard: "Historically hard: {list}.", together: "Taking these together is a lot; consider spreading them over two semesters if you can.",
    noHard: "None of these courses has a low historical average.", loading: "Looking up historical averages…",
    item: "{course} (avg GPA {g})", separator: ", ",
    note: "From each course's PlanetTerp average GPA (all past terms and instructors) and its credits. A hint about past students, not a prediction.",
  },
  zh: {
    title: "这学期的负担",
    level: { light: "轻松", moderate: "适中", heavy: "偏重", veryHeavy: "很重" } as Record<WorkloadLevel, string>,
    hard: "往年给分低（公认较难）：{list}。", together: "这几门放在同一学期压力会比较大，能分到两个学期会更稳。",
    noHard: "这几门课往年的平均 GPA 都不算低。", loading: "正在查询往年平均 GPA…",
    item: "{course}（平均 GPA {g}）", separator: "、",
    note: "按每门课在 PlanetTerp 上往年所有老师的平均 GPA 和学分估算，只反映以往学生的情况，不是预测。",
  },
} as const;

const TONE: Record<WorkloadLevel, string> = {
  light: "border-[#cddbd1] bg-[#edf3ef] text-[#315c43]",
  moderate: "border-[#e0ddd5] bg-[#f6f4ef] text-[#48534f]",
  heavy: "border-[#ead8b5] bg-[#fff8e8] text-[#745424]",
  veryHeavy: "border-[#e7c6bf] bg-[#fff0ec] text-[#8c352c]",
};

// Course averages already looked up on this page (null: PlanetTerp has none).
const known = new Map<string, number | null>();

export function WorkloadCard({ courses, language }: { courses: Array<{ courseId: string; credits: number | null }>; language: Language }) {
  const t = copy[language];
  const key = courses.map((course) => course.courseId).sort().join(",");
  const [, setVersion] = useState(0);

  useEffect(() => {
    const missing = key.split(",").filter((id) => id && !known.has(id));
    if (!missing.length) return;
    let active = true;
    void fetch("/api/audit/grades", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseIds: missing }) })
      .then(async (response) => response.ok ? ((await response.json()) as { averages?: Record<string, number | null> }).averages ?? {} : null)
      .catch(() => null)
      .then((averages) => {
        // A failed lookup leaves the courses unknown (counted as average difficulty) rather than retrying in a loop.
        for (const id of missing) known.set(id, averages?.[id] ?? null);
        if (active) setVersion((value) => value + 1);
      });
    return () => { active = false; };
  }, [key]);

  if (!courses.length) return null;
  const loading = courses.some((course) => !known.has(course.courseId));
  const workload = semesterWorkload(courses.map((course) => ({ ...course, averageGpa: known.get(course.courseId) })));
  return <div className="mb-3 rounded-xl border border-[#e3e0d8] bg-white px-4 py-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-semibold text-[#273c38]">{t.title}</p>
      {!loading && <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE[workload.level]}`}>{t.level[workload.level]}</span>}
    </div>
    {loading ? <p className="mt-1 text-xs text-[#646c68]">{t.loading}</p> : <>
      <p className="mt-1.5 text-xs leading-5 text-[#48534f]">{workload.hard.length
        ? t.hard.replace("{list}", workload.hard.map((item) => t.item.replace("{course}", item.courseId).replace("{g}", item.averageGpa.toFixed(2))).join(t.separator))
        : t.noHard}{workload.hard.length >= 2 ? " " + t.together : ""}</p>
      <p className="mt-1 text-[11px] leading-4 text-[#646c68]">{t.note}</p>
    </>}
  </div>;
}
