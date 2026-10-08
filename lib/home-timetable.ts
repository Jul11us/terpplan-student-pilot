// Illustrative homepage schedules, not live Testudo sections or degree recommendations.
type Language = "en" | "zh";
type Copy = Record<Language, string>;
export type Meeting = { day: number; start: number; end: number };
type Section = Meeting[];
const pattern = (days: number[], start: number, length: number): Section => days.map((day) => ({ day, start, end: start + length }));
const MW = [0, 2], TUTH = [1, 3], MWF = [0, 2, 4];
const SECTION_PATTERNS = [
  ...[9, 11, 13].map((hour) => pattern(MWF, hour, 5 / 6)),
  ...[8, 10, 12, 14, 16].map((hour) => pattern(MW, hour, 1.25)),
  ...[8, 9.5, 11, 12.5, 14, 15.5, 16.5].map((hour) => pattern(TUTH, hour, 1.25)),
];
export const COURSE_POOL = [
  "MATH141", "CMSC132", "COMM107", "PSYC100", "ENGL101", "BMGT220", "ECON200", "STAT400",
  "CHEM135", "BSCI170", "INST126", "HIST200", "PHYS161", "ARTT100", "CMSC131", "MATH140",
  "ECON201", "SOCY100", "GEOG100", "ANTH260", "PHIL100", "LING200", "MUSC205", "ASTR100",
  "BSCI160", "CHEM131", "BMGT230", "BMGT110", "INST201", "HIST201", "ENGL250", "JOUR150",
  "GVPT170", "CCJS100", "NFSC100", "KNES100", "MATH240", "STAT100", "PHYS121", "ENES100",
].map((id, index) => ({
  id,
  // Rotate the preferred section order so different courses produce different shapes.
  sections: SECTION_PATTERNS.map((_, offset) => SECTION_PATTERNS[(offset + index * 7) % SECTION_PATTERNS.length]!),
}));
const COURSE_BY_ID = new Map(COURSE_POOL.map((course) => [course.id, course]));
export const PERSONAL_COMMITMENTS: Array<{ label: Copy; text: Copy; explanation: Copy; meetings: Section }> = [
  { label: { en: "Job", zh: "打工" }, text: { en: "Job Tue & Thu 1–4pm", zh: "周二周四 1–4pm 打工" }, explanation: { en: "Classes now avoid work on Tuesday and Thursday, 1–4pm.", zh: "已避开周二、周四下午 1–4 点的打工时间。" }, meetings: pattern(TUTH, 13, 3) },
  { label: { en: "Job", zh: "打工" }, text: { en: "Job Mon & Wed 3–6pm", zh: "周一周三 3–6pm 打工" }, explanation: { en: "Classes now avoid work on Monday and Wednesday, 3–6pm.", zh: "已避开周一、周三下午 3–6 点的打工时间。" }, meetings: pattern(MW, 15, 3) },
  { label: { en: "Job", zh: "打工" }, text: { en: "Job Fri mornings", zh: "周五上午打工" }, explanation: { en: "Friday morning is now kept free for work.", zh: "已为周五上午的打工时间留出空档。" }, meetings: pattern([4], 8.5, 3.5) },
  { label: { en: "Gym", zh: "健身" }, text: { en: "Gym Tue & Thu 8–9am", zh: "周二周四早上健身" }, explanation: { en: "Tuesday and Thursday, 8–9am, are now kept free for the gym.", zh: "已为周二、周四早上 8–9 点的健身留出时间。" }, meetings: pattern(TUTH, 8, 1) },
  { label: { en: "Club", zh: "社团" }, text: { en: "Club Wed 4–6pm", zh: "周三下午社团" }, explanation: { en: "Wednesday, 4–6pm, is now kept free for your club.", zh: "已为周三下午 4–6 点的社团活动留出时间。" }, meetings: pattern([2], 16, 2) },
  { label: { en: "Lunch", zh: "午休" }, text: { en: "Lunch Mon–Fri 12–1pm", zh: "每天 12–1pm 午休" }, explanation: { en: "Every weekday, noon–1pm, is now kept free for lunch.", zh: "已为每天中午 12–1 点的午休留出时间。" }, meetings: pattern([0, 1, 2, 3, 4], 12, 1) },
  { label: { en: "Practice", zh: "训练" }, text: { en: "Practice Tue & Thu 4–6pm", zh: "周二周四 4–6pm 训练" }, explanation: { en: "Tuesday and Thursday, 4–6pm, are now kept free for practice.", zh: "已避开周二、周四下午 4–6 点的训练时间。" }, meetings: pattern(TUTH, 16, 2) },
  { label: { en: "Job", zh: "打工" }, text: { en: "Job Mon & Wed 8–10am", zh: "周一周三 8–10am 打工" }, explanation: { en: "Classes now avoid work on Monday and Wednesday, 8–10am.", zh: "已避开周一、周三上午 8–10 点的打工时间。" }, meetings: pattern(MW, 8, 2) },
];
export type Preference = "none" | "noFriday" | "lateStart" | "earlyEnd";
export const PREFERENCES: Record<Preference, Copy | null> = {
  none: null, noFriday: { en: "No Friday classes", zh: "周五不上课" }, lateStart: { en: "Nothing before 10", zh: "10 点前不上课" }, earlyEnd: { en: "Done by 3pm", zh: "下午 3 点前下课" },
};
const PREFERENCE_EXPLANATIONS: Record<Preference, Copy> = {
  none: { en: "The time preference is cleared; personal commitments still stay free.", zh: "已取消时间偏好，仍为个人日程留出时间。" },
  noFriday: { en: "Friday is now free; classes fit into Monday through Thursday.", zh: "已避开周五，把课程排在周一至周四。" },
  lateStart: { en: "Early classes are avoided; every class now starts at 10am or later.", zh: "已避开早课，所有课程都在上午 10 点或之后开始。" },
  earlyEnd: { en: "Every class now finishes by 3pm.", zh: "已调整上课时间，最晚下午 3 点下课。" },
};
export type DemoWeek = { courses: string[]; picked: Record<string, number>; own: number; preference: Preference };
type Random = () => number;
const randomIndex = (count: number, rng: Random) => Math.floor(rng() * count);
function shuffled<T>(items: T[], rng: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, rng);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
export const meetingsOverlap = (a: Meeting, b: Meeting) => a.day === b.day && a.start < b.end && b.start < a.end;
const allowed = (section: Section, preference: Preference) => section.every((meeting) =>
  !(preference === "noFriday" && meeting.day === 4) && !(preference === "lateStart" && meeting.start < 10) && !(preference === "earlyEnd" && meeting.end > 15));

// Backtrack when a choice blocks a later course. Keep every requested course, or reject the candidate.
export function planDemoWeek(week: DemoWeek, rng: Random = Math.random, reroll?: string): DemoWeek | null {
  const taken = [...PERSONAL_COMMITMENTS[week.own]!.meetings];
  const picked: Record<string, number> = {};
  let attempts = 0;
  const place = (position: number): boolean => {
    if (position === week.courses.length) return true;
    if (++attempts > 4000) return false;
    const id = week.courses[position]!;
    const course = COURSE_BY_ID.get(id);
    if (!course) return false;
    const candidates = shuffled(course.sections.map((_, index) => index), rng);
    const previous = week.picked[id];
    if (previous !== undefined && id !== reroll) candidates.sort((a, b) => Number(b === previous) - Number(a === previous));
    for (const index of candidates) {
      if (id === reroll && index === previous) continue;
      const section = course.sections[index]!;
      if (!allowed(section, week.preference) || section.some((meeting) => taken.some((other) => meetingsOverlap(meeting, other)))) continue;
      picked[id] = index;
      const length = taken.length;
      taken.push(...section);
      if (place(position + 1)) return true;
      taken.length = length;
    }
    return false;
  };
  return place(0) ? { ...week, picked } : null;
}

export function weekSignature(week: DemoWeek): string {
  return `${week.own}:${week.preference}:${[...week.courses].sort().map((id) => `${id}-${week.picked[id]}`).join(",")}`;
}

// Cycle through different kinds of change, and skip unchanged/recent schedules.
export function nextDemoWeek(week: DemoWeek, step: number, recent: string[], rng: Random = Math.random): DemoWeek {
  const action = ["section", "own", "course", "preference", "section", "mix"][step % 6];
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = { ...week, courses: [...week.courses] };
    let reroll: string | undefined;
    if (action === "own") candidate.own = (week.own + 1 + randomIndex(PERSONAL_COMMITMENTS.length - 1, rng)) % PERSONAL_COMMITMENTS.length;
    else if (action === "preference") {
      const preferences = (Object.keys(PREFERENCES) as Preference[]).filter((item) => item !== week.preference);
      candidate.preference = preferences[randomIndex(preferences.length, rng)]!;
    } else if (action === "mix") candidate.courses = shuffled(COURSE_POOL.map((item) => item.id), rng).slice(0, 5);
    else if (action === "course") {
      const outside = COURSE_POOL.filter((item) => !week.courses.includes(item.id));
      candidate.courses[randomIndex(candidate.courses.length, rng)] = outside[randomIndex(outside.length, rng)]!.id;
    } else reroll = week.courses[randomIndex(week.courses.length, rng)];
    const result = planDemoWeek(candidate, rng, reroll);
    if (result && weekSignature(result) !== weekSignature(week) && !recent.includes(weekSignature(result))) return result;
  }
  return week;
}

// Fixed initial choices keep the server and first client render identical.
export const FIRST_DEMO_WEEK = planDemoWeek({ courses: ["MATH141", "CMSC132", "COMM107", "PSYC100", "ENGL101"], picked: {}, own: 0, preference: "none" }, () => 0.5)!;

export function weekExplanation(before: DemoWeek | null, after: DemoWeek, language: Language): string {
  const zh = language === "zh";
  if (!before) return PERSONAL_COMMITMENTS[after.own]!.explanation[language];
  if (before.own !== after.own) return PERSONAL_COMMITMENTS[after.own]!.explanation[language];
  if (before.preference !== after.preference) return PREFERENCE_EXPLANATIONS[after.preference][language];
  const added = after.courses.filter((id) => !before.courses.includes(id));
  const removed = before.courses.filter((id) => !after.courses.includes(id));
  if (added.length === 1 && removed.length === 1) return zh
    ? `已将 ${removed[0]} 换为 ${added[0]}，重新避开时间冲突。`
    : `Replaced ${removed[0]} with ${added[0]} and checked for time conflicts.`;
  if (added.length > 1) return zh
    ? "已换一组示例课程，重新排好 5 门课并避开个人日程。"
    : "A new mix of five sample courses is arranged around your personal commitments.";
  const changed = after.courses.filter((id) => after.picked[id] !== before.picked[id]);
  if (changed.length) {
    const names = changed.slice(0, 2).join(zh ? "、" : ", ");
    const rest = changed.length > 2 ? zh ? ` 等 ${changed.length} 门课` : ` and ${changed.length - 2} other courses` : "";
    return zh ? `已调整 ${names}${rest} 的班次，避开时间冲突。` : `Changed sections for ${names}${rest} to avoid time conflicts.`;
  }
  return zh ? "已重新检查，当前课表仍避开个人日程。" : "Rechecked the schedule; personal commitments still stay free.";
}

export function weekBlocks(week: DemoWeek, language: Language) {
  const own = PERSONAL_COMMITMENTS[week.own]!;
  return [
    ...week.courses.flatMap((id) => COURSE_BY_ID.get(id)!.sections[week.picked[id]!]!.map((meeting, index) => ({ key: `${id}-${index}`, label: id, personal: false, meeting }))),
    ...own.meetings.map((meeting, index) => ({ key: `own-${index}`, label: own.label[language], personal: true, meeting })),
  ];
}
