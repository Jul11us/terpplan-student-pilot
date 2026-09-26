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

const copy = {
  en: { none: "No prerequisites or restrictions listed.", source: "Requirement text is from UMD. Testudo decides whether you meet it.", description: "Course description", note: "Note" },
  zh: { none: "没有列出先修课或选课限制。", source: "要求原文来自 UMD（英文）；是否满足以 Testudo 为准。", description: "课程介绍", note: "备注" },
} as const;

export default function CourseRequirements({ requirements, description, language }: { requirements: CourseRequirement[]; description: string | null; language: Language }) {
  const t = copy[language];
  const colon = language === "zh" ? "：" : ": ";
  const label = (item: CourseRequirement) => LABELS[language][item.kind] ?? (item.label === "Note" ? t.note : item.label);
  const blocking = requirements.filter((item) => BLOCKING.includes(item.kind)).sort((a, b) => BLOCKING.indexOf(a.kind) - BLOCKING.indexOf(b.kind));
  const other = requirements.filter((item) => !BLOCKING.includes(item.kind));

  return <div className="mt-4 space-y-2">
    {blocking.length > 0
      ? <dl className="space-y-1.5 rounded-xl border border-[#ead8b5] bg-[#fff8e8] px-4 py-3 text-xs leading-5 text-[#5d4a24]">{blocking.map((item, index) => <div key={index}><dt className="inline font-semibold">{label(item)}{colon}</dt><dd className="inline">{item.text}</dd></div>)}</dl>
      : <p className="text-xs text-[#737b77]">{t.none}</p>}
    {other.length > 0 && <dl className="space-y-1 text-xs leading-5 text-[#626c67]">{other.map((item, index) => <div key={index}><dt className="inline font-medium text-[#48534f]">{label(item)}{colon}</dt><dd className="inline">{item.text}</dd></div>)}</dl>}
    {description && <details className="text-xs leading-5 text-[#626c67]"><summary className="cursor-pointer font-medium text-[#48534f] hover:text-[#a34a39]">{t.description}</summary><p className="mt-1">{description}</p></details>}
    {(blocking.length > 0 || other.length > 0) && <p className="text-[11px] text-[#8a918e]">{t.source}</p>}
  </div>;
}
