import { isInstructorTba, normalizeProfessorName, type ProfessorSummary } from "@/lib/planetterp";

export type PlanMeeting = {
  days?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  classtype?: string | null;
  building?: string | null;
  room?: string | null;
};

export type PlanSection = {
  section_id?: string;
  number?: string;
  seats?: string | number | null;
  open_seats?: string | number | null;
  waitlist?: string | number | null;
  instructors?: string[];
  meetings?: PlanMeeting[];
};

export type PlanCourse = {
  course_id: string;
  title: string;
  credits: number | null;
  sections: PlanSection[];
  seatCheckedAt?: string;
};

export type PlanPreferences = {
  earliestStart?: string | null;
  excludedDays?: string[];
  windowStart?: string | null;
  windowEnd?: string | null;
  strictTime?: boolean;
  openSeatsOnly?: boolean;
  includeFreshmanConnection?: boolean;
};

export type ScheduledSection = PlanSection & {
  course_id: string;
  course_title: string;
  section_id: string;
  credits: number | null;
  instructorRatings: ProfessorSummary[];
  seatCheckedAt?: string;
};

export type ScheduleOption = {
  selectedSections: ScheduledSection[];
  totalCredits: number;
  score: number;
  professorRating: number | null;
  gapMinutes: number;
  earliestStart: string | null;
  latestEnd: string | null;
  campusDays: string[];
  timeFitPercent: number | null;
  unknownSectionIds: string[];
  fullSectionIds: string[];
};

// Warnings are sent as codes so the page can show them in the viewer's language.
export type PlanWarning =
  | { code: "courseNotFound" | "noSectionsListed" | "noValidSections" | "courseLoadFailed" | "noEligibleSections" | "noSelectedInstructors" | "allSectionsExcluded"; courseId: string }
  | { code: "pinnedSectionUnavailable"; courseId: string; sectionId: string }
  | { code: "sectionsSkipped"; courseId: string; count: number }
  | { code: "ratingsLimited"; count: number }
  | { code: "someCoursesOmitted" | "noConflictFree" | "searchLimit" | "allOptionsFull" | "tbaTimes" };

export type PlannerResult = {
  options: ScheduleOption[];
  warnings: PlanWarning[];
  truncated: boolean;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MAX_NODES = 160_000;
const MAX_OPTIONS = 3;
// Keep a wider pool while searching so the final picks can differ in more than a discussion slot.
const CANDIDATE_POOL = 60;
// A full section cannot be registered for, so it should only win when nothing open fits.
const FULL_SECTION_PENALTY = 2.5;
const DAY_TOKENS: Array<[string, (typeof DAYS)[number]]> = [
  ["MONDAY", "Mon"], ["MON", "Mon"], ["MO", "Mon"], ["M", "Mon"],
  ["TUESDAY", "Tue"], ["TUES", "Tue"], ["TUE", "Tue"], ["TU", "Tue"],
  ["WEDNESDAY", "Wed"], ["WED", "Wed"], ["WE", "Wed"], ["W", "Wed"],
  ["THURSDAYS", "Thu"], ["THURSDAY", "Thu"], ["THURS", "Thu"], ["THUR", "Thu"], ["THU", "Thu"], ["TH", "Thu"],
  ["FRIDAY", "Fri"], ["FRI", "Fri"], ["FR", "Fri"], ["F", "Fri"],
  ["SATURDAY", "Sat"], ["SAT", "Sat"], ["SA", "Sat"],
  ["SUNDAY", "Sun"], ["SUN", "Sun"], ["SU", "Sun"],
  ["T", "Tue"],
];

export function sectionId(section: PlanSection, courseId: string) {
  return String(section.section_id || (section.number ? courseId + "-" + section.number : "")).trim().toUpperCase();
}

export function dayNames(raw: string | null | undefined) {
  if (!raw || /^(TBA|TBD|ARRANGED)$/i.test(raw.trim())) return [] as string[];
  const text = raw.toUpperCase().replace(/[^A-Z]/g, "");
  const result: string[] = [];
  for (let index = 0; index < text.length;) {
    const match = DAY_TOKENS.find(([token]) => text.startsWith(token, index));
    if (match) {
      if (!result.includes(match[1])) result.push(match[1]);
      index += match[0].length;
    } else {
      index += 1;
    }
  }
  return result;
}

export function minutes(raw: string | null | undefined) {
  if (!raw || /tba|tbd/i.test(raw)) return null;
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})\s*([ap]m)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (match[3]) {
    if (hour === 12) hour = 0;
    if (match[3].toLowerCase() === "pm") hour += 12;
  }
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function openSeatCount(section: PlanSection) {
  const value = section.open_seats;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return null;
}

// FC sections are reserved for students in the Freshman Connection program.
export function isFreshmanConnection(section: PlanSection) {
  const id = String(section.section_id || section.number || "").toUpperCase();
  return /(^|-)FC[A-Z0-9]*$/.test(id);
}

function instructorKey(section: ScheduledSection) {
  return section.course_id + ":" + (section.instructors ?? []).map(normalizeProfessorName).sort().join("+");
}

function isFull(section: PlanSection) {
  return openSeatCount(section) === 0;
}

// Sections that share a lecture (0101-0104) differ only in discussion; treat them as one choice for variety.
function lectureKey(section: ScheduledSection) {
  const lectures = (section.meetings ?? [])
    .filter((meeting) => !/discussion|lab/i.test(meeting.classtype ?? ""))
    .map((meeting) => [meeting.days, meeting.start_time, meeting.end_time].join(" "))
    .sort();
  return section.course_id + ":" + [...(section.instructors ?? [])].sort().join("+") + "@" + lectures.join(",");
}

function hasKnownTime(meeting: PlanMeeting) {
  const start = minutes(meeting.start_time);
  const end = minutes(meeting.end_time);
  return start !== null && end !== null && end > start && dayNames(meeting.days).length > 0;
}

function hasUnknownTime(section: PlanSection) {
  return !section.meetings?.length || section.meetings.some((meeting) => !hasKnownTime(meeting));
}

function overlaps(a: PlanMeeting, b: PlanMeeting) {
  if (!hasKnownTime(a) || !hasKnownTime(b)) return false;
  const aStart = minutes(a.start_time) as number;
  const aEnd = minutes(a.end_time) as number;
  const bStart = minutes(b.start_time) as number;
  const bEnd = minutes(b.end_time) as number;
  return dayNames(a.days).some((day) => dayNames(b.days).includes(day)) && aStart < bEnd && bStart < aEnd;
}

function conflicts(left: PlanSection, right: PlanSection) {
  return (left.meetings ?? []).some((a) => (right.meetings ?? []).some((b) => overlaps(a, b)));
}

function sectionRatings(section: PlanSection, ratings: Record<string, ProfessorSummary>) {
  return (section.instructors ?? []).filter((name) => name && !isInstructorTba(name)).map((name) => {
    const rating = ratings[normalizeProfessorName(name)];
    // Keep the Schedule of Classes spelling; PlanetTerp sometimes differs in capitalization.
    return rating ? { ...rating, name } : {
      name, matched: false, status: "limited" as const, averageRating: null, reviewCount: null, sourceUrl: null,
    };
  });
}

function parsePrefs(preferences: PlanPreferences) {
  const earliest = minutes(preferences.earliestStart);
  const start = minutes(preferences.windowStart);
  const end = minutes(preferences.windowEnd);
  const interval = start !== null && end !== null && end > start ? [start, end] as const : null;
  return {
    earliest,
    excludedDays: new Set((preferences.excludedDays ?? []).flatMap((day) => dayNames(day))),
    interval,
    strictTime: Boolean(preferences.strictTime && interval),
    openSeatsOnly: Boolean(preferences.openSeatsOnly),
    includeFreshmanConnection: Boolean(preferences.includeFreshmanConnection),
  };
}

function allowedByPreferences(section: PlanSection, preference: ReturnType<typeof parsePrefs>) {
  const meetings = section.meetings ?? [];
  for (const meeting of meetings) {
    const days = dayNames(meeting.days);
    if (days.some((day) => preference.excludedDays.has(day))) return false;
    const start = minutes(meeting.start_time);
    const end = minutes(meeting.end_time);
    if (preference.earliest !== null && start !== null && start < preference.earliest) return false;
    if (preference.strictTime) {
      if (!hasKnownTime(meeting) || !preference.interval) return false;
      if (start! < preference.interval[0] || end! > preference.interval[1]) return false;
    }
  }
  if (preference.strictTime && meetings.length === 0) return false;
  if (preference.openSeatsOnly && isFull(section)) return false;
  if (!preference.includeFreshmanConnection && isFreshmanConnection(section)) return false;
  return true;
}

function summarize(sections: ScheduledSection[], preferences: ReturnType<typeof parsePrefs>): ScheduleOption {
  const courseRatings = sections.flatMap((section) => {
    const values = section.instructorRatings.map((rating) => rating.averageRating).filter((rating): rating is number => rating !== null);
    return values.length ? [values.reduce((sum, rating) => sum + rating, 0) / values.length] : [];
  });
  const professorRating = courseRatings.length ? courseRatings.reduce((sum, value) => sum + value, 0) / courseRatings.length : null;
  const unknownSectionIds = sections.filter(hasUnknownTime).map((section) => section.section_id);
  const fullSectionIds = sections.filter(isFull).map((section) => section.section_id);
  let unknownCount = sections.reduce((sum, section) => {
    const meetingCount = section.meetings?.length ? section.meetings.filter((meeting) => !hasKnownTime(meeting)).length : 1;
    const missingRatings = section.instructorRatings.filter((rating) => !rating.matched || rating.averageRating === null).length;
    return sum + meetingCount + missingRatings;
  }, 0);
  const byDay = new Map<string, Array<[number, number]>>();
  let earliestStart: number | null = null;
  let latestEnd: number | null = null;
  let earlyCount = 0;
  let knownMinutes = 0;
  let insideMinutes = 0;
  for (const section of sections) {
    for (const meeting of section.meetings ?? []) {
      if (!hasKnownTime(meeting)) continue;
      const start = minutes(meeting.start_time) as number;
      const end = minutes(meeting.end_time) as number;
      earliestStart = earliestStart === null ? start : Math.min(earliestStart, start);
      latestEnd = latestEnd === null ? end : Math.max(latestEnd, end);
      if (start < 9 * 60) earlyCount += 1;
      const duration = end - start;
      knownMinutes += duration;
      const inside = preferences.interval
        ? Math.max(0, Math.min(end, preferences.interval[1]) - Math.max(start, preferences.interval[0]))
        : duration;
      insideMinutes += inside;
      for (const day of dayNames(meeting.days)) {
        const list = byDay.get(day) ?? [];
        list.push([start, end]);
        byDay.set(day, list);
      }
    }
  }
  let gapMinutes = 0;
  for (const meetings of byDay.values()) {
    meetings.sort((a, b) => a[0] - b[0]);
    for (let index = 1; index < meetings.length; index += 1) {
      const gap = meetings[index][0] - meetings[index - 1][1];
      if (gap > 0) gapMinutes += gap;
    }
  }
  const outsideMinutes = Math.max(0, knownMinutes - insideMinutes);
  if (preferences.interval) unknownCount += unknownSectionIds.length;
  const score = 0.4 + (professorRating ?? 0) - 0.008 * gapMinutes - 0.7 * earlyCount - 0.35 * unknownCount
    - (preferences.interval ? 0.05 * (outsideMinutes + 90 * unknownSectionIds.length) : 0)
    - FULL_SECTION_PENALTY * fullSectionIds.length;
  const campusDays = DAYS.filter((day) => sections.some((section) => (section.meetings ?? []).some((meeting) => dayNames(meeting.days).includes(day))));
  const totalCredits = sections.reduce((sum, section) => sum + (section.credits ?? 0), 0);
  return {
    selectedSections: sections,
    totalCredits,
    score,
    professorRating,
    gapMinutes,
    earliestStart: earliestStart === null ? null : formatClock(earliestStart),
    latestEnd: latestEnd === null ? null : formatClock(latestEnd),
    campusDays,
    timeFitPercent: preferences.interval && knownMinutes > 0 ? (insideMinutes / knownMinutes) * 100 : null,
    unknownSectionIds,
    fullSectionIds,
  };
}

function formatClock(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  const suffix = hour < 12 ? "am" : "pm";
  return (hour % 12 || 12) + ":" + String(minute).padStart(2, "0") + suffix;
}

export function generateOptions(
  courses: PlanCourse[],
  ratings: Record<string, ProfessorSummary>,
  preferences: PlanPreferences,
): PlannerResult {
  const warnings: PlanWarning[] = [];
  const parsed = parsePrefs(preferences);
  const groups = courses.map((course) => {
    const sections = (course.sections ?? [])
      .filter((section) => allowedByPreferences(section, parsed))
      .map((section) => ({
        ...section,
        course_id: course.course_id,
        course_title: course.title,
        section_id: sectionId(section, course.course_id),
        credits: course.credits,
        instructorRatings: sectionRatings(section, ratings),
        seatCheckedAt: course.seatCheckedAt,
      } as ScheduledSection));
    if (!sections.length) warnings.push({ code: "noEligibleSections", courseId: course.course_id });
    return { courseId: course.course_id, sections };
  }).filter((group) => group.sections.length > 0).sort((a, b) => a.sections.length - b.sections.length);
  if (groups.length !== courses.length) {
    warnings.push({ code: "someCoursesOmitted" });
  }
  if (!groups.length) return { options: [], warnings, truncated: false };

  for (const group of groups) {
    group.sections.sort((a, b) => {
      const localScore = (section: ScheduledSection) => {
        const rated = section.instructorRatings.map((item) => item.averageRating).filter((item): item is number => item !== null);
        const rating = rated.length ? rated.reduce((sum, item) => sum + item, 0) / rated.length : 0;
        const early = (section.meetings ?? []).filter((meeting) => hasKnownTime(meeting) && (minutes(meeting.start_time) as number) < 540).length;
        const unknown = Number(hasUnknownTime(section)) + section.instructorRatings.filter((item) => !item.matched || item.averageRating === null).length;
        return rating - 0.7 * early - 0.35 * unknown - (isFull(section) ? FULL_SECTION_PENALTY : 0);
      };
      return localScore(b) - localScore(a) || a.section_id.localeCompare(b.section_id);
    });
  }

  const pool: ScheduleOption[] = [];
  const chosen: ScheduledSection[] = [];
  const seen = new Set<string>();
  let nodes = 0;
  let truncated = false;
  const walk = (groupIndex: number) => {
    if (groupIndex === groups.length) {
      const key = chosen.map((section) => section.section_id).sort().join("|");
      if (seen.has(key)) return;
      seen.add(key);
      pool.push(summarize([...chosen], parsed));
      pool.sort((a, b) => b.score - a.score || a.selectedSections.map((section) => section.section_id).join("|").localeCompare(b.selectedSections.map((section) => section.section_id).join("|")));
      if (pool.length > CANDIDATE_POOL) pool.pop();
      return;
    }
    for (const candidate of groups[groupIndex].sections) {
      if (nodes >= MAX_NODES) {
        truncated = true;
        return;
      }
      nodes += 1;
      if (chosen.some((section) => conflicts(candidate, section))) continue;
      chosen.push(candidate);
      walk(groupIndex + 1);
      chosen.pop();
      if (truncated) return;
    }
  };
  walk(0);
  // Fill the list in passes: first different instructors, then different lecture times, then anything left.
  // Options with open seats go through every pass before any option containing a full section is considered.
  const options: ScheduleOption[] = [];
  const passes = [false, true].flatMap((allowFull) => [instructorKey, lectureKey, null].map((keyOf) => ({ allowFull, keyOf })));
  for (const { allowFull, keyOf } of passes) {
    const used = new Set(keyOf ? options.map((option) => option.selectedSections.map(keyOf).sort().join("|")) : []);
    for (const option of pool) {
      if (options.length === MAX_OPTIONS) break;
      if (options.includes(option)) continue;
      if (!allowFull && option.fullSectionIds.length) continue;
      if (keyOf) {
        const mix = option.selectedSections.map(keyOf).sort().join("|");
        if (used.has(mix)) continue;
        used.add(mix);
      }
      options.push(option);
    }
  }
  options.sort((a, b) => b.score - a.score);
  if (!options.length) warnings.push({ code: "noConflictFree" });
  if (truncated) warnings.push({ code: "searchLimit" });
  if (options.length && options.every((option) => option.fullSectionIds.length)) {
    warnings.push({ code: "allOptionsFull" });
  }
  if (options.some((option) => option.unknownSectionIds.length)) {
    warnings.push({ code: "tbaTimes" });
  }
  return { options, warnings, truncated };
}
