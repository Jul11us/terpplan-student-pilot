// The home page's picture of the four-year plan (/roadmap): a Computer Science plan by year and term, the totals
// the page keeps, and three requirement lines as the plan shows them. Illustrative, not a real student's plan, and
// still: the timetable above it is the moving one.

type Language = "en" | "zh";

// Course pills take the colour of their subject, like the planner's own course colours.
const SUBJECTS: Record<string, { fill: string; text: string }> = {
  CMSC: { fill: "#e4e9f3", text: "#24395e" },
  MATH: { fill: "#e2eee6", text: "#21493a" },
  STAT: { fill: "#e2eee6", text: "#21493a" },
};
const OTHER = { fill: "#f6ecd3", text: "#5b4110" };

// Year by year: fall, then spring. The last spring is still open.
const YEARS = [
  [["CMSC131", "MATH141", "ENGL101", "LING200"], ["CMSC132", "CMSC250", "COMM107"]],
  [["CMSC216", "CMSC320", "STAT400", "MATH240"], ["CMSC330", "CMSC351", "ARTH200"]],
  [["CMSC422", "CMSC424", "STAT401"], ["CMSC414", "CMSC454", "STAT430"]],
  [["CMSC421", "STAT440", "ENGL393"], []],
];

const copy = {
  en: {
    title: "4-year plan · Computer Science, Data Science", totals: ["98 / 120 credits", "Major 15 / 18", "Gen Ed 13 / 17"],
    term: (fall: boolean, year: number) => `${fall ? "Fall" : "Spring"} ${year}`, add: "Add a course",
    lines: [
      { mark: "✓", text: "CMSC216 Introduction to Computer Systems", detail: "Fall 2027", tone: "ok" },
      { mark: "◐", text: "Two of CMSC411, 412, 414, 417, 430…", detail: "1 / 2", tone: "part", chip: "CMSC412" },
      { mark: "✓", text: "LEP benchmark at 45 credits", detail: "reached in Fall 2027", tone: "ok" },
    ],
  },
  zh: {
    title: "四年规划 · 计算机科学（数据科学方向）", totals: ["98 / 120 学分", "专业要求 15 / 18 项", "Gen Ed 13 / 17 项"],
    term: (fall: boolean, year: number) => `${year} ${fall ? "秋季" : "春季"}`, add: "加课程",
    lines: [
      { mark: "✓", text: "CMSC216 计算机系统导论", detail: "2027 秋季", tone: "ok" },
      { mark: "◐", text: "CMSC411、412、414、417、430… 中选 2 门", detail: "1 / 2 门", tone: "part", chip: "CMSC412" },
      { mark: "✓", text: "45 学分时的 LEP Benchmark", detail: "2027 秋季达到", tone: "ok" },
    ],
  },
} as const;

export function RoadmapSketch({ language }: { language: Language }) {
  const t = copy[language];
  const pill = (id: string) => {
    const tone = SUBJECTS[id.slice(0, 4)] ?? OTHER;
    return <span key={id} className="rounded-[5px] px-1.5 py-[3px] text-[9.5px] font-semibold leading-none tracking-[.01em] sm:text-[10px]" style={{ backgroundColor: tone.fill, color: tone.text }}>{id}</span>;
  };
  return <figure aria-hidden="true" className="rounded-2xl border border-[#e4e0d8] bg-white p-3 shadow-[0_1px_2px_rgba(32,39,40,.04),0_18px_40px_-22px_rgba(32,39,40,.28)] sm:p-4">
    <div className="px-1">
      <p className="text-[11px] font-semibold tracking-wide text-[#5d6561]">{t.title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">{t.totals.map((total, index) => <span key={total} className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold ${index ? "border-[#e6e2da] bg-[#faf9f6] text-[#48534f]" : "border-[#d3e2d8] bg-[#f1f6f2] text-[#273c38]"}`}>{total}</span>)}</div>
    </div>
    <div className="mt-3 space-y-1.5">{YEARS.map((terms, index) => <div key={index} className="grid grid-cols-[18px_minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-1.5 sm:grid-cols-[22px_minmax(0,1fr)_minmax(0,1fr)]">
      <span className="flex items-center justify-center font-serif text-sm text-[#a34a39]">{index + 1}</span>
      {terms.map((courses, position) => <div key={position} className="min-w-0 rounded-lg bg-[#f8f6f2] p-1.5">
        <p className="text-[9px] font-semibold uppercase tracking-[.08em] text-[#7a817d]">{t.term(position === 0, 2026 + index + position)}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {courses.map(pill)}
          {!courses.length && <span className="rounded-[5px] border border-dashed border-[#cfcac0] px-1.5 py-[2px] text-[9.5px] font-medium leading-none text-[#7a817d]">+ {t.add}</span>}
        </div>
      </div>)}
    </div>)}</div>
    <ul className="mt-3 divide-y divide-[#eeece6] border-t border-[#eeece6] px-1">{t.lines.map((line) => <li key={line.text} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-[11px]">
      <span className="min-w-0 text-[#24312d]"><span className={`mr-1.5 font-semibold ${line.tone === "ok" ? "text-[#315c43]" : "text-[#8a5a17]"}`}>{line.mark}</span>{line.text}</span>
      <span className="flex items-center gap-2">
        {"chip" in line && <span className="rounded-full border border-[#cfdcd3] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#273c38]"><span className="mr-0.5 text-[#536d64]">+</span>{line.chip}</span>}
        <span className={`tabular-nums ${line.tone === "ok" ? "text-[#315c43]" : "text-[#8a5a17]"}`}>{line.detail}</span>
      </span>
    </li>)}</ul>
  </figure>;
}
