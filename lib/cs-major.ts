// The Computer Science major, checked against a four-year plan. The rules are the 2026–2027 undergraduate
// catalog's (Computer Science Major) and the department's own pages at undergrad.cs.umd.edu: degree
// requirements, the general track's distributive areas (which every track uses, special topics included),
// the upper level concentration and the LEP benchmarks. Grades and GPA are not known here, so "C- or better"
// and the GPA rules are the student's to confirm; everything else is counted. Shared by the page and the tests.

import type { CourseInfo } from "@/lib/roadmap";

export type CsTrack = "general" | "cyber" | "data" | "ml" | "quantum";
export const CS_TRACKS: CsTrack[] = ["general", "cyber", "data", "ml", "quantum"];
export type Text = { en: string; zh: string };
type Area = 1 | 2 | 3 | 4 | 5;

export const TRACK_NAMES: Record<CsTrack, Text> = {
  general: { en: "General track", zh: "General（不选方向）" },
  cyber: { en: "Cybersecurity", zh: "Cybersecurity 网络安全" },
  data: { en: "Data Science", zh: "Data Science 数据科学" },
  ml: { en: "Machine Learning", zh: "Machine Learning 机器学习" },
  quantum: { en: "Quantum Information", zh: "Quantum Information 量子信息" },
};

// Distributive areas (department, general track; the same for every track). CMSC471 is area 2 or area 3.
const AREAS: Record<string, Area[]> = {
  CMSC411: [1], CMSC412: [1], CMSC414: [1], CMSC416: [1], CMSC417: [1],
  CMSC420: [2], CMSC421: [2], CMSC422: [2], CMSC423: [2], CMSC424: [2], CMSC426: [2], CMSC427: [2], CMSC470: [2], CMSC471: [2, 3], CMSC472: [2],
  CMSC430: [3], CMSC431: [3], CMSC433: [3], CMSC434: [3], CMSC435: [3], CMSC436: [3],
  CMSC451: [4], CMSC452: [4], CMSC454: [4], CMSC456: [4], CMSC457: [4], CMSC474: [4],
  CMSC460: [5], CMSC466: [5],
};
// Special topics count for an area only when taken in the terms the department lists; otherwise they are
// upper level electives.
const TOPICS: Record<string, { area: Area; terms: string[] }> = {
  CMSC498B: { area: 1, terms: ["202408", "202508"] },
  CMSC498C: { area: 1, terms: ["202401", "202501", "202601", "202608"] },
  CMSC498I: { area: 1, terms: ["202208"] },
  CMSC498N: { area: 1, terms: ["202701"] },
  CMSC498X: { area: 1, terms: ["202008"] },
  CMSC498D: { area: 2, terms: ["202501", "202601"] },
  CMSC498E: { area: 2, terms: ["202308", "202601", "202701"] },
  CMSC498F: { area: 2, terms: ["202201", "202301", "202401", "202601"] },
  CMSC498K: { area: 2, terms: ["202508"] },
  CMSC498P: { area: 2, terms: ["202701"] },
  CMSC498Y: { area: 2, terms: ["202401", "202501", "202601", "202701"] },
  CMSC498Z: { area: 2, terms: ["202308", "202508", "202608"] },
  CMSC498G: { area: 3, terms: ["202501", "202601"] },
  CMSC498J: { area: 3, terms: ["202508"] },
  CMSC498W: { area: 4, terms: ["202701"] },
};
// Cross-listed courses count as the CMSC course (Testudo: "Cross-listed with").
const SAME_AS: Record<string, string> = { AMSC460: "CMSC460", AMSC466: "CMSC466", MATH456: "CMSC456", ENEE456: "CMSC456", MATH475: "CMSC475", PHYS457: "CMSC457", GEOG470: "CMSC401" };
// Never in the upper level concentration: cross-listed with a CMSC course, or credited only once together with
// one (Testudo: "Credit only granted for").
const NOT_ULC = new Set([...Object.keys(SAME_AS), "DATA320", "ENEE447", "STAT426"]);
const LINEAR_ALGEBRA = ["MATH240", "MATH341", "MATH461"];

// The code a course counts as: its CMSC listing when cross-listed, the regular course for an honors one.
export function csCode(id: string) {
  return SAME_AS[id] ?? (/^[A-Z]{4}\d{3}H$/.test(id) ? id.slice(0, 7) : id);
}

const number = (id: string) => Number(id.slice(4, 7));
const isStat4xx = (id: string) => /^STAT4\d\d/.test(id);
// A MATH, AMSC or STAT course that has MATH141 (or higher) behind it and is not a CMSC course under another name.
const isMathStat = (id: string) => /^(MATH|AMSC|STAT)\d{3}/.test(id) && number(id) >= 240 && !NOT_ULC.has(id);
const isCmscUpper = (id: string) => /^CMSC[34]\d\d/.test(id) && !["CMSC330", "CMSC351"].includes(id);

// One requirement: `options` are the ways to meet one course of it (a list of codes that count as one option);
// `count` how many different options it needs.
type Pick = { key: string; label: Text; options: string[][]; count: number };
const pick = (key: string, label: Text, options: string[][], count = 1): Pick => ({ key, label, options, count });
const each = (codes: string[]) => codes.map((code) => [code]);

const LOWER: Pick[] = [
  pick("MATH140", { en: "MATH140 Calculus I", zh: "MATH140 微积分 I" }, [["MATH140"]]),
  pick("MATH141", { en: "MATH141 Calculus II", zh: "MATH141 微积分 II" }, [["MATH141"]]),
  pick("CMSC131", { en: "CMSC131 (or CMSC133) Object-Oriented Programming I", zh: "CMSC131（或 CMSC133）面向对象编程 I" }, [["CMSC131", "CMSC133"]]),
  pick("CMSC132", { en: "CMSC132 Object-Oriented Programming II", zh: "CMSC132 面向对象编程 II" }, [["CMSC132"]]),
  pick("CMSC216", { en: "CMSC216 Introduction to Computer Systems", zh: "CMSC216 计算机系统导论" }, [["CMSC216"]]),
  pick("CMSC250", { en: "CMSC250 Discrete Structures", zh: "CMSC250 离散结构" }, [["CMSC250"]]),
  pick("CMSC330", { en: "CMSC330 Organization of Programming Languages", zh: "CMSC330 程序设计语言" }, [["CMSC330"]]),
  pick("CMSC351", { en: "CMSC351 Algorithms", zh: "CMSC351 算法" }, [["CMSC351"]]),
];

type TrackRules = {
  picks: Pick[];
  // Distributive area courses the track asks for directly: how many, from how many areas at least, which areas.
  areas?: { count: number; minAreas: number; allowed: Area[] };
  electiveCredits: number;
  // Specializations: their upper level CS courses together must cover at least three areas.
  overallAreas: boolean;
};

const TRACKS: Record<CsTrack, TrackRules> = {
  general: { picks: [], areas: { count: 5, minAreas: 3, allowed: [1, 2, 3, 4, 5] }, electiveCredits: 6, overallAreas: false },
  cyber: {
    picks: [
      pick("CMSC414", { en: "CMSC414 Computer and Network Security", zh: "CMSC414 计算机与网络安全" }, [["CMSC414"]]),
      pick("CMSC456", { en: "CMSC456 Cryptography", zh: "CMSC456 密码学" }, [["CMSC456"]]),
      pick("cyberFour", { en: "Four of CMSC411, 412, 417, 430, 433, 451", zh: "CMSC411、412、417、430、433、451 中选 4 门" }, each(["CMSC411", "CMSC412", "CMSC417", "CMSC430", "CMSC433", "CMSC451"]), 4),
    ],
    electiveCredits: 3, overallAreas: true,
  },
  data: {
    picks: [
      pick("CMSC320", { en: "CMSC320 Introduction to Data Science", zh: "CMSC320 数据科学导论" }, [["CMSC320"]]),
      pick("CMSC422", { en: "CMSC422 Introduction to Machine Learning", zh: "CMSC422 机器学习导论" }, [["CMSC422"]]),
      pick("CMSC424", { en: "CMSC424 Database Design", zh: "CMSC424 数据库设计" }, [["CMSC424"]]),
      pick("dataOne", { en: "One of CMSC420, 421, 423, 425, 426, 427, 470", zh: "CMSC420、421、423、425、426、427、470 中选 1 门" }, each(["CMSC420", "CMSC421", "CMSC423", "CMSC425", "CMSC426", "CMSC427", "CMSC470"])),
      pick("dataTheory", { en: "One of CMSC451, 454, 460", zh: "CMSC451、454、460 中选 1 门" }, each(["CMSC451", "CMSC454", "CMSC460"])),
      pick("dataTwo", { en: "Two of CMSC411, 412, 414, 417, 430, 433, 434, 435", zh: "CMSC411、412、414、417、430、433、434、435 中选 2 门" }, each(["CMSC411", "CMSC412", "CMSC414", "CMSC417", "CMSC430", "CMSC433", "CMSC434", "CMSC435"]), 2),
    ],
    electiveCredits: 0, overallAreas: true,
  },
  ml: {
    picks: [
      pick("CMSC320", { en: "CMSC320 Introduction to Data Science", zh: "CMSC320 数据科学导论" }, [["CMSC320"]]),
      pick("CMSC421", { en: "CMSC421 Introduction to Artificial Intelligence", zh: "CMSC421 人工智能导论" }, [["CMSC421"]]),
      pick("CMSC422", { en: "CMSC422 Introduction to Machine Learning", zh: "CMSC422 机器学习导论" }, [["CMSC422"]]),
      pick("mlTwo", { en: "Two of CMSC426, 460 (or 466, or MATH401), 470, 472, 473, 474, 476", zh: "CMSC426、460（或 466、MATH401）、470、472、473、474、476 中选 2 门" },
        [["CMSC426"], ["CMSC460", "CMSC466", "MATH401"], ["CMSC470"], ["CMSC472"], ["CMSC473"], ["CMSC474"], ["CMSC476"]], 2),
    ],
    electiveCredits: 6, overallAreas: true,
  },
  quantum: {
    picks: [
      pick("CMSC457", { en: "CMSC457 Introduction to Quantum Computing", zh: "CMSC457 量子计算导论" }, [["CMSC457"]]),
      pick("PHYS467", { en: "PHYS467 Introduction to Quantum Technology", zh: "PHYS467 量子技术导论" }, [["PHYS467"]]),
    ],
    areas: { count: 4, minAreas: 2, allowed: [1, 2, 3, 5] }, electiveCredits: 3, overallAreas: true,
  },
};

export type CsCourse = { id: string; term: string | null; credits: number | null };
export type CsLine = {
  key: string;
  // Core courses, math and statistics, the track's upper level CS courses, the upper level concentration.
  group: "core" | "math" | "track" | "ulc";
  label: Text;
  // Courses (or credits, for electives and the concentration) needed and planned.
  need: number;
  have: number;
  unit: "courses" | "credits" | "areas";
  courses: CsCourse[];
  // Met: enough courses or credits, and (for the distributive areas) enough areas.
  ok: boolean;
  note?: Text;
  // For a rule not met: courses not in the plan that would count, the likeliest first (empty where any course of a
  // kind counts: electives, the concentration).
  options: string[];
};
export type CsBenchmark = {
  at: 45 | 75;
  // The term the plan reaches that many credits in; null when it does not.
  term: string | null;
  // What is not done by the end of that term.
  missing: Text[];
};
export type CsCheck = {
  lines: CsLine[];
  // Areas the upper level CS courses cover (for the "at least three areas" rule).
  areas: number[];
  needAreas: number;
  benchmarks: CsBenchmark[];
  // The outside discipline with the most planned credits.
  ulc: { discipline: string | null; credits: number };
  done: number;
};

type NewLine = Omit<CsLine, "ok" | "group" | "options"> & { ok?: boolean; options?: string[] };
const groupOf = (key: string): CsLine["group"] => key === "ulc" ? "ulc" : key === "STAT4XX" || key === "MATHSTAT" ? "math" : LOWER.some((rule) => rule.key === key) ? "core" : "track";
const line = (item: NewLine): CsLine => {
  const ok = item.ok ?? item.have >= item.need;
  return { ...item, group: groupOf(item.key), ok, options: ok ? [] : item.options ?? [] };
};

const AREA_RULE_AREAS = 3;

// The areas a course can count for, given the term it is taken in.
function areasOf(course: CsCourse): Area[] {
  const id = csCode(course.id);
  if (AREAS[id]) return AREAS[id];
  const topic = TOPICS[course.id];
  return topic && course.term && topic.terms.includes(course.term) ? [topic.area] : [];
}

// The most different areas a set of courses covers, one area each (CMSC471 picks the one that helps), with no
// more than three courses counted in one area; -1 when no way keeps to that.
function areaSpread(courses: CsCourse[], allowed: Area[]) {
  let best = -1;
  const counts = new Map<Area, number>();
  const visit = (index: number) => {
    if (index === courses.length) { best = Math.max(best, counts.size); return; }
    for (const area of areasOf(courses[index]!).filter((item) => allowed.includes(item))) {
      if ((counts.get(area) ?? 0) >= 3) continue;
      counts.set(area, (counts.get(area) ?? 0) + 1);
      visit(index + 1);
      const left = counts.get(area)! - 1;
      if (left) counts.set(area, left); else counts.delete(area);
    }
  };
  visit(0);
  return best;
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, size - 1).map((combo) => [first!, ...combo]), ...combinations(rest, size)];
}

// `courses`: the plan in time order (earlier courses first), each once.
export function checkCsMajor(track: CsTrack, courses: CsCourse[], info: Record<string, CourseInfo | null | undefined>): CsCheck {
  const rules = TRACKS[track];
  const used = new Set<string>();
  const lines: CsLine[] = [];
  const free = () => courses.filter((course) => !used.has(course.id));
  const take = (course: CsCourse) => { used.add(course.id); return course; };
  // What a rule could still use: courses the plan does not have (under any listing).
  const planned = new Set(courses.flatMap((course) => [course.id, csCode(course.id)]));
  const notPlanned = (codes: string[]) => [...new Set(codes)].filter((code) => !planned.has(code) && !planned.has(csCode(code)));

  // Requirements met by named courses: each option used once, earliest course first.
  const fill = (rule: Pick) => {
    const found: CsCourse[] = [];
    for (const option of rule.options) {
      if (found.length >= rule.count) break;
      const course = free().find((item) => option.includes(csCode(item.id)));
      if (course) found.push(take(course));
    }
    lines.push(line({ key: rule.key, label: rule.label, need: rule.count, have: found.length, unit: "courses", courses: found, options: notPlanned(rule.options.filter((option) => !option.some((code) => planned.has(code))).flat()) }));
  };
  for (const rule of LOWER) fill(rule);

  // The statistics course, then the second math course; Data Science names STAT400, and the data science, machine
  // learning and quantum tracks need linear algebra for the second.
  const statLabel: Text = track === "data" ? { en: "STAT400 Applied Probability and Statistics I", zh: "STAT400 应用概率与统计 I" } : { en: "STAT4XX with a MATH141 prerequisite", zh: "STAT4XX（先修课含 MATH141）" };
  const stat = free().find((course) => track === "data" ? csCode(course.id) === "STAT400" : isStat4xx(course.id));
  lines.push(line({ key: "STAT4XX", label: statLabel, need: 1, have: stat ? 1 : 0, unit: "courses", courses: stat ? [take(stat)] : [], options: notPlanned(["STAT400"]) }));
  const linear = track === "data" || track === "ml" || track === "quantum";
  const second = free().find((course) => linear ? LINEAR_ALGEBRA.includes(csCode(course.id)) : isMathStat(course.id));
  lines.push(line({
    key: "MATHSTAT", need: 1, have: second ? 1 : 0, unit: "courses", courses: second ? [take(second)] : [], options: notPlanned(linear ? LINEAR_ALGEBRA : ["MATH240", "MATH241", "MATH246", "STAT401"]),
    label: linear ? { en: "Linear algebra: MATH240, MATH341 or MATH461", zh: "线性代数：MATH240、MATH341 或 MATH461" } : { en: "MATH/AMSC/STAT course with a MATH141 prerequisite", zh: "MATH/AMSC/STAT 课（先修课含 MATH141）" },
  }));

  for (const rule of rules.picks) fill(rule);

  // Distributive area courses: the set (of up to `count`) that covers the most areas, earliest courses first.
  if (rules.areas) {
    const { count, minAreas, allowed } = rules.areas;
    const candidates = free().filter((course) => areasOf(course).some((area) => allowed.includes(area)));
    let chosen: CsCourse[] = [];
    let spread = -1;
    for (let size = Math.min(count, candidates.length); size >= 0 && spread < 0; size -= 1) {
      for (const combo of combinations(candidates, size)) {
        const covered = areaSpread(combo, allowed);
        if (covered > spread) { spread = covered; chosen = combo; }
      }
    }
    chosen.forEach(take);
    const covered = Math.max(0, spread);
    // Courses from areas not covered yet come first.
    const coveredAreas = new Set(chosen.flatMap(areasOf));
    const fresh = (code: string) => Number(AREAS[code]!.some((area) => coveredAreas.has(area)));
    const areaOptions = notPlanned(Object.keys(AREAS).filter((code) => AREAS[code]!.some((area) => allowed.includes(area))).sort((a, b) => fresh(a) - fresh(b) || a.localeCompare(b)));
    const areaNote = track === "quantum"
      ? { en: `From at least ${minAreas} of areas 1, 2, 3 and 5, no more than three in one area (${covered} covered)`, zh: `至少覆盖领域 1、2、3、5 中的 ${minAreas} 个，同一领域最多算 3 门（已覆盖 ${covered} 个）` }
      : { en: `From at least ${minAreas} areas, no more than three in one area (${covered} covered)`, zh: `至少覆盖 ${minAreas} 个领域，同一领域最多算 3 门（已覆盖 ${covered} 个）` };
    lines.push(line({
      key: "areas", need: count, have: chosen.length, unit: "courses", courses: chosen, note: areaNote, ok: chosen.length >= count && covered >= minAreas, options: areaOptions,
      label: track === "quantum" ? { en: "Four 400-level courses outside area 4 (Theory)", zh: "4 门 400 级 CS 课（不含领域 4 理论）" } : { en: "Five 400-level courses from the distributive areas", zh: "5 门分布在各领域的 400 级 CS 课" },
    }));
  }

  // Upper level CS electives: CMSC 3xx/4xx courses not counted above (not CMSC330 or CMSC351), by credits.
  if (rules.electiveCredits) {
    const found: CsCourse[] = [];
    let credits = 0;
    for (const course of free().filter((item) => isCmscUpper(csCode(item.id)))) {
      if (credits >= rules.electiveCredits) break;
      found.push(take(course));
      credits += course.credits ?? 0;
    }
    lines.push(line({ key: "electives", label: { en: `${rules.electiveCredits} credits of CMSC 3xx/4xx electives`, zh: `${rules.electiveCredits} 学分 CMSC 3xx/4xx 选修` }, need: rules.electiveCredits, have: Math.min(credits, rules.electiveCredits), unit: "credits", courses: found, note: { en: "Not CMSC330 or CMSC351; three 1-credit STICs make one 3-credit elective", zh: "不含 CMSC330 和 CMSC351；三门 1 学分的 STIC 算一门 3 学分选修" } }));
  }

  // The areas the upper level CS courses counted for the major cover together.
  const upper = courses.filter((course) => used.has(course.id) && areasOf(course).length);
  const areas = (() => {
    let best: Area[] = [];
    const visit = (index: number, picked: Area[]) => {
      if (index === upper.length) { const distinct = [...new Set(picked)]; if (distinct.length > best.length) best = distinct; return; }
      for (const area of areasOf(upper[index]!)) visit(index + 1, [...picked, area]);
    };
    visit(0, []);
    return best.sort();
  })();
  if (rules.overallAreas) {
    lines.push(line({ key: "overallAreas", label: { en: "Upper level CS courses from at least three areas", zh: "高年级 CS 课至少覆盖 3 个领域" }, need: AREA_RULE_AREAS, have: Math.min(areas.length, AREA_RULE_AREAS), unit: "areas", courses: [], note: { en: `Areas covered: ${areas.join(", ") || "none"}`, zh: `已覆盖领域：${areas.join("、") || "无"}` } }));
  }

  // Upper level concentration: 12 credits of 300–400 level courses (3 credits or more each) in one discipline
  // outside CMSC, none of them counted for the major; MATH and STAT, and LGBT and WGSS, count as one discipline.
  // An English concentration cannot use the professional writing (FSPW) course.
  const discipline = (id: string) => /^(MATH|STAT)/.test(id) ? "MATH/STAT" : /^(LGBT|WGSS)/.test(id) ? "LGBT/WGSS" : id.slice(0, 4);
  const byDiscipline = new Map<string, CsCourse[]>();
  for (const course of free()) {
    const id = course.id;
    if (id.startsWith("CMSC") || NOT_ULC.has(id) || number(id) < 300 || number(id) > 499 || (course.credits ?? 0) < 3) continue;
    if (info[id]?.ge.flat().includes("FSPW")) continue;
    byDiscipline.set(discipline(id), [...(byDiscipline.get(discipline(id)) ?? []), course]);
  }
  const sum = (list: CsCourse[]) => list.reduce((total, course) => total + (course.credits ?? 0), 0);
  const [ulcName, ulcCourses] = [...byDiscipline.entries()].sort((a, b) => sum(b[1]) - sum(a[1]) || a[0].localeCompare(b[0]))[0] ?? [null, []];
  const ulcCredits = sum(ulcCourses);
  lines.push(line({
    key: "ulc", label: { en: "Upper level concentration: 12 credits of 300–400 level courses in one discipline outside CMSC", zh: "Upper Level Concentration：CMSC 以外同一学科 12 学分 300–400 级课" },
    need: 12, have: Math.min(ulcCredits, 12), unit: "credits", courses: ulcCourses,
    note: ulcName ? { en: `Most so far: ${ulcName}`, zh: `目前学分最多的学科：${ulcName}` } : undefined,
  }));

  const done = lines.filter((item) => item.ok).length;
  return { lines, areas, needAreas: AREA_RULE_AREAS, benchmarks: [], ulc: { discipline: ulcName, credits: ulcCredits }, done };
}

// The LEP benchmark reviews at 45 and 75 credits (department): the courses that must be done by then. Credits
// include AP and transfer credit, so the term found is the earliest it could be.
export function csBenchmarks(courses: CsCourse[], terms: string[]): CsBenchmark[] {
  const credit = (list: CsCourse[]) => list.reduce((total, course) => total + (course.credits ?? 0), 0);
  let running = credit(courses.filter((course) => course.term === null));
  const reached = new Map<number, string>();
  for (const term of terms) {
    running += credit(courses.filter((course) => course.term === term));
    for (const at of [45, 75]) if (running >= at && !reached.has(at)) reached.set(at, term);
  }
  const doneBy = (term: string | null) => new Set(courses.filter((course) => course.term === null || (term !== null && course.term <= term)).map((course) => csCode(course.id)));
  const check = (at: 45 | 75, needs: Array<{ label: Text; ok: (done: Set<string>) => boolean }>): CsBenchmark => {
    const term = reached.get(at) ?? null;
    const done = doneBy(term ?? terms[terms.length - 1] ?? null);
    return { at, term, missing: needs.filter((need) => !need.ok(done)).map((need) => need.label) };
  };
  const has = (...codes: string[]) => (done: Set<string>) => codes.some((code) => done.has(code));
  return [
    check(45, [
      { label: { en: "CMSC131 (or CMSC133)", zh: "CMSC131（或 CMSC133）" }, ok: has("CMSC131", "CMSC133") },
      { label: { en: "CMSC132", zh: "CMSC132" }, ok: has("CMSC132") },
      { label: { en: "MATH140", zh: "MATH140" }, ok: has("MATH140") },
    ]),
    check(75, [
      { label: { en: "CMSC330", zh: "CMSC330" }, ok: has("CMSC330") },
      { label: { en: "CMSC351", zh: "CMSC351" }, ok: has("CMSC351") },
      { label: { en: "STAT4XX or a MATH/AMSC/STAT course with a MATH141 prerequisite", zh: "STAT4XX 或先修课含 MATH141 的 MATH/AMSC/STAT 课" }, ok: (done) => [...done].some((id) => isStat4xx(id) || isMathStat(id)) },
    ]),
  ];
}
