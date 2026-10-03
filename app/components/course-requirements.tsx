"use client";

type Language = "en" | "zh";
export type CourseRequirement = { kind: string; label: string; text: string };

// The ones that decide whether a student can register; shown first and highlighted.
const BLOCKING = ["prerequisite", "corequisite", "restriction"];

const LABELS: Record<Language, Record<string, string>> = {
  en: {
    prerequisite: "Prerequisite", corequisite: "Corequisite", restriction: "Restriction", creditOnlyFor: "Credit only granted for",
    recommended: "Recommended", crossListed: "Also offered as", formerly: "Formerly", additionalInfo: "Additional information",
  },
  zh: {
    prerequisite: "先修课", corequisite: "同修课（可同时修）", restriction: "选课限制", creditOnlyFor: "学分只计一门",
    recommended: "建议先修", crossListed: "交叉列出课程", formerly: "原课程号", additionalInfo: "补充说明",
  },
};

// Course codes inside UMD's text, e.g. "CMSC131", "MATH 140", "ENGL101A".
const COURSE_CODE = /\b([A-Z]{4})\s?(\d{3}[A-Z]?)\b/g;

// Splits requirement text so each course code other than the current course becomes a button.
function linkedText(text: string, currentCourseId: string, onCourseClick?: (courseId: string) => void) {
  if (!onCourseClick) return text;
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(COURSE_CODE)) {
    const courseId = match[1]! + match[2]!;
    const index = match.index ?? 0;
    if (courseId === currentCourseId) continue;
    parts.push(text.slice(last, index));
    parts.push(<button key={index} type="button" onClick={() => onCourseClick(courseId)} className="font-medium text-[#a34a39] underline decoration-dotted underline-offset-2 hover:decoration-solid">{match[0]}</button>);
    last = index + match[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

const copy = {
  en: { none: "No prerequisites or restrictions listed.", source: "Requirement text is from UMD. Testudo decides whether you meet it.", description: "Course description", note: "Note" },
  zh: { none: "没有列出先修课或选课限制。", source: "要求原文来自 UMD（英文）；是否满足以 Testudo 为准。", description: "课程介绍", note: "备注" },
} as const;

export default function CourseRequirements({ requirements, description, language, currentCourseId, onCourseClick }: { requirements: CourseRequirement[]; description: string | null; language: Language; currentCourseId: string; onCourseClick?: (courseId: string) => void }) {
  const t = copy[language];
  const colon = language === "zh" ? "：" : ": ";
  const label = (item: CourseRequirement) => LABELS[language][item.kind] ?? (item.label === "Note" ? t.note : item.label);
  const blocking = requirements.filter((item) => BLOCKING.includes(item.kind)).sort((a, b) => BLOCKING.indexOf(a.kind) - BLOCKING.indexOf(b.kind));
  const other = requirements.filter((item) => !BLOCKING.includes(item.kind));

  return <div className="mt-4 space-y-2">
    {blocking.length > 0
      ? <dl className="space-y-1.5 rounded-xl border border-[#ead8b5] bg-[#fff8e8] px-4 py-3 text-xs leading-5 text-[#5d4a24]">{blocking.map((item, index) => <div key={index}><dt className="inline font-semibold">{label(item)}{colon}</dt><dd className="inline">{linkedText(item.text, currentCourseId, onCourseClick)}</dd></div>)}</dl>
      :<p className="text-xs text-[#646c68]">{t.none}</p>}
    {other.length > 0 && <dl className="space-y-1 text-xs leading-5 text-[#5d6561]">{other.map((item, index) => <div key={index}><dt className="inline font-medium text-[#48534f]">{label(item)}{colon}</dt><dd className="inline">{linkedText(item.text, currentCourseId, onCourseClick)}</dd></div>)}</dl>}
    {description && <details className="text-xs leading-5 text-[#5d6561]"><summary className="cursor-pointer font-medium text-[#48534f] hover:text-[#a34a39]">{t.description}</summary><p className="mt-1">{description}</p></details>}
    {(blocking.length > 0 || other.length > 0) && <p className="text-[11px] text-[#646c68]">{t.source}</p>}
  </div>;
}
