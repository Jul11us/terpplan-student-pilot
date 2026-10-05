import { areaFor, buildingFor, longWalkMinutes, sectionAreas, tightWalks, weeklyWalkMinutes, type CampusArea, CAMPUS_AREA_KEYS } from "@/lib/campus-walk";
import { isAsyncOnline } from "@/lib/meeting-time";
import { isInstructorTba, normalizeProfessorName, type ProfessorSummary } from "@/lib/planetterp";
import { normalizeBusyBlocks, validBuffer, type BusyBlock } from "@/lib/personal-schedule";

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
  holdfile?: string | number | null;
  instructors?: string[];
  meetings?: PlanMeeting[];
};

export type PlanCourse = {
  course_id: string;
  title: string;
  credits: number | null;
  sections: PlanSection[];
  seatCheckedAt?: string;
  pinnedSectionId?: string;
  instructors?: string[];
  excludedSectionIds?: string[];
  // Average GPA each instructor gave (PlanetTerp), by normalized name; only looked up when preferGpa is on.
  instructorGpa?: Record<string, number>;
};

export type PlanPreferences = {
  earliestStart?: string | null;
  // Classes starting before this time ("HH:MM") lose points; "off" turns that off. Default 9:00.
  earlyBefore?: string | null;
  excludedDays?: string[];
  windowStart?: string | null;
  windowEnd?: string | null;
  strictTime?: boolean;
  openSeatsOnly?: boolean;
  includeFreshmanConnection?: boolean;
  busyBlocks?: BusyBlock[];
  bufferMinutes?: number;
  // Rank sections whose instructors gave higher grades first.
  preferGpa?: boolean;
  // Rank schedules that fit into fewer days on campus first.
  preferFewerDays?: boolean;
  // Only use sections that meet in these parts of campus (see CAMPUS_AREAS). Empty means anywhere.
  campusAreas?: string[];
  // Rank schedules with less walking between buildings first.
  preferNearbyClasses?: boolean;
};

export type ScheduledSection = PlanSection & {
  course_id: string;
  course_title: string;
  section_id: string;
  credits: number | null;
  instructorRatings: ProfessorSummary[];
  seatCheckedAt?: string;
  // Average GPA of this section's instructors in this course, when it was looked up and known.
  instructorGpa?: number | null;
};

export type ScorePart = {
  key: "base" | "rating" | "gpa" | "longWalks" | "early" | "unknown" | "window" | "full" | "walks" | "days" | "walkTime";
  points: number;
  // How many of the thing were counted (minutes for gaps, meetings for early classes, ...), when it helps explain.
  count?: number;
  // The time it is measured against, when the student chose it ("9am" for early classes).
  at?: string;
};

export type ScheduleOption = {
  selectedSections: ScheduledSection[];
  totalCredits: number;
  score: number;
  // What the score is made of, so the page can explain it. points add up to score.
  scoreParts: ScorePart[];
  professorRating: number | null;
  // Mean of the sections' instructor GPAs, when the GPA preference is on and any is known.
  averageGpa: number | null;
  gapMinutes: number;
  // Times a week the estimated walk to the next class is longer than the gap before it.
  tightWalkCount: number;
  // Estimated minutes a week spent walking between classes, and the parts of campus they meet in.
  walkMinutes: number;
  campusAreas: CampusArea[];
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
  | { code: "pinnedSectionPreferenceConflict"; courseId: string; sectionId: string }
  | { code: "sectionsSkipped"; courseId: string; count: number }
  | { code: "ratingsLimited"; count: number }
  | { code: "someCoursesOmitted" | "noConflictFree" | "searchLimit" | "allOptionsFull" | "tbaTimes" };

export type PlannerResult = {
  options: ScheduleOption[];
  warnings: PlanWarning[];
  truncated: boolean;
  diagnostics?: PlanDiagnosis[];
  repairs?: PlanRepair[];
};

export type PlanDiagnosis = {
  code: "excludedDay" | "earliestStart" | "timeWindow" | "busyBlock" | "fullSections" | "fcSections" | "sectionFilters" | "courseConflict" | "bufferConflict" | "combinationConflict" | "campusAreas";
  courseIds: string[];
  day?: string;
  blockId?: string;
  sectionIds?: string[];
  time?: string;
  sample?: { days: string[]; leftStart: string; leftEnd: string; rightStart: string; rightEnd: string };
};
export type PlanRepair = {
  kind: "allowDay" | "clearEarliest" | "relaxWindow" | "clearBuffer" | "removeBlock" | "allowFull" | "unpin" | "resetFilters" | "removeCourse" | "clearCampusAreas";
  day?: string;
  blockId?: string;
  courseId?: string;
  sectionIds: string[];
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MAX_NODES = 160_000;
const MAX_OPTIONS = 3;
// Keep a wider pool while searching so the final picks can differ in more than a discussion slot.
const CANDIDATE_POOL = 60;
// A full section cannot be registered for, so it should only win when nothing open fits.
const FULL_SECTION_PENALTY = 2.5;
// Back-to-back classes whose buildings are further apart than the gap allows (estimated walk, see campus-walk).
// Each day it happens costs a base amount plus more for every minute short, so a 2-minute shortfall
// weighs less than a 10-minute one, and three days a week weighs three times one day. Being late is
// treated as worse than waiting: 4 minutes short costs about as much as 100 extra minutes of gaps.
const TIGHT_WALK_PENALTY = 0.4;
const TIGHT_WALK_PER_MINUTE = 0.1;
// With the GPA preference on, each 0.1 of average GPA above (or below) 3.0 adds (or takes) 0.2 points, so
// a full grade point is worth about as much as a 2-point difference in instructor rating.
const GPA_BASELINE = 3;
const GPA_WEIGHT = 2;
// Per day on campus, applied only when the student asked for fewer days. Worth about 150 minutes of
// between-class gaps, so a compact week wins even when it means waiting around; without that weight the
// gap penalty alone decides and the preference looks like it did nothing.
const DAY_PENALTY = 1.2;
// Per estimated minute a week spent walking between buildings, applied only when the student asked to keep
// classes close together. A minute of walking weighs about three times a minute of sitting in a gap, since
// walking across campus between every pair of classes is the part of a spread-out week that is felt.
const WALK_MINUTE_PENALTY = 0.025;
// Free time between classes is not penalised (a break is often wanted). What costs points is a walk longer
// than 10 minutes between back-to-back classes: each minute past 10, on each day it happens.
const LONG_WALK_ALLOWANCE = 10;
const LONG_WALK_PER_MINUTE = 0.1;
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
  // Asynchronous online work has no time on purpose; it is not an unconfirmed meeting.
  return !section.meetings?.length || section.meetings.some((meeting) => !hasKnownTime(meeting) && !isAsyncOnline(meeting));
}

function overlaps(a: PlanMeeting, b: PlanMeeting, buffer = 0) {
  if (!hasKnownTime(a) || !hasKnownTime(b)) return false;
  const aStart = minutes(a.start_time) as number;
  const aEnd = minutes(a.end_time) as number;
  const bStart = minutes(b.start_time) as number;
  const bEnd = minutes(b.end_time) as number;
  return dayNames(a.days).some((day) => dayNames(b.days).includes(day)) && aStart < bEnd + buffer && bStart < aEnd + buffer;
}

function conflicts(left: PlanSection, right: PlanSection, buffer = 0) {
  return (left.meetings ?? []).some((a) => (right.meetings ?? []).some((b) => overlaps(a, b, buffer)));
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

export const DEFAULT_EARLY_BEFORE = 9 * 60;

// When early classes start counting against a schedule: the student's choice, or 9am; null when turned off.
export function earlyBeforeMinutes(value: string | null | undefined) {
  if (value === "off") return null;
  const parsed = minutes(value);
  return parsed === null ? DEFAULT_EARLY_BEFORE : parsed;
}

function parsePrefs(preferences: PlanPreferences) {
  const earliest = minutes(preferences.earliestStart);
  const start = minutes(preferences.windowStart);
  const end = minutes(preferences.windowEnd);
  const interval = start !== null && end !== null && end > start ? [start, end] as const : null;
  return {
    earliest,
    earlyBefore: earlyBeforeMinutes(preferences.earlyBefore),
    excludedDays: new Set((preferences.excludedDays ?? []).flatMap((day) => dayNames(day))),
    interval,
    strictTime: Boolean(preferences.strictTime && interval),
    openSeatsOnly: Boolean(preferences.openSeatsOnly),
    includeFreshmanConnection: Boolean(preferences.includeFreshmanConnection),
    busyBlocks: normalizeBusyBlocks(preferences.busyBlocks ?? []),
    bufferMinutes: validBuffer(preferences.bufferMinutes) ? preferences.bufferMinutes : 0,
    preferGpa: Boolean(preferences.preferGpa),
    preferFewerDays: Boolean(preferences.preferFewerDays),
    // Unknown names are dropped rather than treated as "nowhere", so a stale saved preference cannot
    // quietly rule out every section.
    campusAreas: new Set((preferences.campusAreas ?? []).filter((area): area is CampusArea => (CAMPUS_AREA_KEYS as string[]).includes(area))),
    preferNearbyClasses: Boolean(preferences.preferNearbyClasses),
  };
}

function sectionGpa(section: PlanSection, course: PlanCourse) {
  const values = (section.instructors ?? []).map((name) => course.instructorGpa?.[normalizeProfessorName(name)]).filter((value): value is number => typeof value === "number");
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

const gpaPoints = (gpa: number | null | undefined, preferGpa: boolean) => preferGpa && typeof gpa === "number" ? GPA_WEIGHT * (gpa - GPA_BASELINE) : 0;

function conflictsWithTimePreferences(section: PlanSection, preference: ReturnType<typeof parsePrefs>) {
  const meetings = section.meetings ?? [];
  for (const meeting of meetings) {
    if (isAsyncOnline(meeting)) continue;
    if (preference.busyBlocks.some((block) => overlaps(meeting, { days: block.days.join(" "), start_time: block.start, end_time: block.end }))) return true;
    const days = dayNames(meeting.days);
    if (days.some((day) => preference.excludedDays.has(day))) return true;
    const start = minutes(meeting.start_time);
    const end = minutes(meeting.end_time);
    if (preference.earliest !== null && start !== null && start < preference.earliest) return true;
    if (preference.strictTime) {
      if (!hasKnownTime(meeting) || !preference.interval) return true;
      if (start! < preference.interval[0] || end! > preference.interval[1]) return true;
    }
  }
  return preference.strictTime && meetings.length === 0;
}

function selectedByCourse(section: PlanSection, course: PlanCourse, ignorePin = false) {
  const id = sectionId(section, course.course_id);
  if (course.pinnedSectionId && !ignorePin) return id === course.pinnedSectionId;
  if (course.excludedSectionIds?.includes(id)) return false;
  return !course.instructors?.length || (section.instructors ?? []).some((name) => course.instructors!.some((kept) => normalizeProfessorName(kept) === normalizeProfessorName(name)));
}

function eligibleSections(course: PlanCourse, preference: ReturnType<typeof parsePrefs>, ignorePin = false) {
  return course.sections.filter((section) => selectedByCourse(section, course, ignorePin)
    && allowedByPreferences(section, preference, !ignorePin && sectionId(section, course.course_id) === course.pinnedSectionId));
}

// A section is outside the chosen parts of campus when any of its meetings is somewhere else. Online and
// TBA meetings are nowhere on campus, so they never rule a section out; a building the data has no position
// for is left in too, since excluding it would be a guess.
function outsideCampusAreas(section: PlanSection, areas: Set<CampusArea>) {
  if (!areas.size) return false;
  return (section.meetings ?? []).some((meeting) => {
    if (isAsyncOnline(meeting) || !buildingFor(meeting.building)) return false;
    const area = areaFor(meeting.building);
    return area !== null && !areas.has(area);
  });
}

function allowedByPreferences(section: PlanSection, preference: ReturnType<typeof parsePrefs>, pinned: boolean) {
  if (conflictsWithTimePreferences(section, preference)) return false;
  const meetings = section.meetings ?? [];
  if (meetings.some((meeting, index) => meetings.slice(index + 1).some((other) => overlaps(meeting, other, preference.bufferMinutes)))) return false;
  if (!pinned && preference.openSeatsOnly && isFull(section)) return false;
  if (!pinned && !preference.includeFreshmanConnection && isFreshmanConnection(section)) return false;
  if (!pinned && outsideCampusAreas(section, preference.campusAreas)) return false;
  return true;
}

function summarize(sections: ScheduledSection[], preferences: ReturnType<typeof parsePrefs>): ScheduleOption {
  const courseRatings = sections.flatMap((section) => {
    const values = section.instructorRatings.map((rating) => rating.averageRating).filter((rating): rating is number => rating !== null);
    return values.length ? [values.reduce((sum, rating) => sum + rating, 0) / values.length] : [];
  });
  const professorRating = courseRatings.length ? courseRatings.reduce((sum, value) => sum + value, 0) / courseRatings.length : null;
  const gpas = sections.map((section) => section.instructorGpa).filter((value): value is number => typeof value === "number");
  const averageGpa = preferences.preferGpa && gpas.length ? gpas.reduce((sum, value) => sum + value, 0) / gpas.length : null;
  const unknownSectionIds = sections.filter(hasUnknownTime).map((section) => section.section_id);
  const fullSectionIds = sections.filter(isFull).map((section) => section.section_id);
  let unknownCount = sections.reduce((sum, section) => {
    const meetingCount = section.meetings?.length ? section.meetings.filter((meeting) => !hasKnownTime(meeting) && !isAsyncOnline(meeting)).length : 1;
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
      if (preferences.earlyBefore !== null && start < preferences.earlyBefore) earlyCount += 1;
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
  const walks = tightWalks(sections);
  const walkPenalty = walks.reduce((sum, walk) => sum + TIGHT_WALK_PENALTY + TIGHT_WALK_PER_MINUTE * (walk.walkMinutes - walk.gapMinutes), 0);
  const campusDays = DAYS.filter((day) => sections.some((section) => (section.meetings ?? []).some((meeting) => dayNames(meeting.days).includes(day))));
  const walkMinutes = weeklyWalkMinutes(sections);
  const extraWalkMinutes = longWalkMinutes(sections, LONG_WALK_ALLOWANCE);
  const campusAreas = sectionAreas(sections);
  const scoreParts: ScorePart[] = [
    { key: "base", points: 0.4 },
    { key: "rating", points: professorRating ?? 0 },
    ...(preferences.preferGpa ? [{ key: "gpa" as const, points: gpaPoints(averageGpa, true) }] : []),
    ...(preferences.preferFewerDays ? [{ key: "days" as const, points: -DAY_PENALTY * campusDays.length, count: campusDays.length }] : []),
    ...(preferences.preferNearbyClasses ? [{ key: "walkTime" as const, points: -WALK_MINUTE_PENALTY * walkMinutes, count: walkMinutes }] : []),
    { key: "longWalks", points: -LONG_WALK_PER_MINUTE * extraWalkMinutes, count: extraWalkMinutes },
    ...(preferences.earlyBefore !== null ? [{ key: "early" as const, points: -0.7 * earlyCount, count: earlyCount, at: formatHour(preferences.earlyBefore) }] : []),
    { key: "unknown", points: -0.35 * unknownCount, count: unknownCount },
    { key: "window", points: preferences.interval ? -0.05 * (outsideMinutes + 90 * unknownSectionIds.length) : 0, count: Math.round(outsideMinutes) },
    { key: "full", points: -FULL_SECTION_PENALTY * fullSectionIds.length, count: fullSectionIds.length },
    { key: "walks", points: -walkPenalty, count: walks.length },
  ];
  const score = scoreParts.reduce((sum, part) => sum + part.points, 0);
  const totalCredits = sections.reduce((sum, section) => sum + (section.credits ?? 0), 0);
  return {
    selectedSections: sections,
    totalCredits,
    score,
    scoreParts,
    professorRating,
    averageGpa,
    gapMinutes,
    tightWalkCount: walks.length,
    walkMinutes,
    campusAreas,
    earliestStart: earliestStart === null ? null : formatClock(earliestStart),
    latestEnd: latestEnd === null ? null : formatClock(latestEnd),
    campusDays,
    timeFitPercent: preferences.interval && knownMinutes > 0 ? (insideMinutes / knownMinutes) * 100 : null,
    unknownSectionIds,
    fullSectionIds,
  };
}

// "9am", "8:30am" for the early-class line of the score.
function formatHour(value: number) {
  const hour = Math.floor(value / 60), minute = value % 60;
  return `${hour % 12 || 12}${minute ? ":" + String(minute).padStart(2, "0") : ""}${hour < 12 ? "am" : "pm"}`;
}

function formatClock(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  const suffix = hour < 12 ? "am" : "pm";
  return (hour % 12 || 12) + ":" + String(minute).padStart(2, "0") + suffix;
}

function searchOptions(
  courses: PlanCourse[],
  ratings: Record<string, ProfessorSummary>,
  preferences: PlanPreferences,
): PlannerResult {
  const warnings: PlanWarning[] = [];
  const parsed = parsePrefs(preferences);
  const groups = courses.map((course) => {
    const pinnedSection = course.pinnedSectionId
      ? (course.sections ?? []).find((section) => sectionId(section, course.course_id) === course.pinnedSectionId)
      : undefined;
    const pinnedConflict = Boolean(pinnedSection && conflictsWithTimePreferences(pinnedSection, parsed));
    if (pinnedConflict) warnings.push({ code: "pinnedSectionPreferenceConflict", courseId: course.course_id, sectionId: course.pinnedSectionId! });
    const sections = (course.sections ?? [])
      .filter((section) => selectedByCourse(section, course) && allowedByPreferences(section, parsed, sectionId(section, course.course_id) === course.pinnedSectionId))
      .map((section) => ({
        ...section,
        course_id: course.course_id,
        course_title: course.title,
        section_id: sectionId(section, course.course_id),
        credits: course.credits,
        instructorRatings: sectionRatings(section, ratings),
        seatCheckedAt: course.seatCheckedAt,
        instructorGpa: sectionGpa(section, course),
      } as ScheduledSection));
    if (!sections.length && !pinnedConflict) warnings.push({ code: "noEligibleSections", courseId: course.course_id });
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
        const early = parsed.earlyBefore === null ? 0 : (section.meetings ?? []).filter((meeting) => hasKnownTime(meeting) && (minutes(meeting.start_time) as number) < parsed.earlyBefore!).length;
        const unknown = Number(hasUnknownTime(section)) + section.instructorRatings.filter((item) => !item.matched || item.averageRating === null).length;
        return rating + gpaPoints(section.instructorGpa, parsed.preferGpa) - 0.7 * early - 0.35 * unknown - (isFull(section) ? FULL_SECTION_PENALTY : 0);
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
      pool.sort((a, b) => a.fullSectionIds.length - b.fullSectionIds.length || b.score - a.score || a.selectedSections.map((section) => section.section_id).join("|").localeCompare(b.selectedSections.map((section) => section.section_id).join("|")));
      if (pool.length > CANDIDATE_POOL) pool.pop();
      return;
    }
    for (const candidate of groups[groupIndex].sections) {
      if (nodes >= MAX_NODES) {
        truncated = true;
        return;
      }
      nodes += 1;
      if (chosen.some((section) => conflicts(candidate, section, parsed.bufferMinutes))) continue;
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
  options.sort((a, b) => a.fullSectionIds.length - b.fullSectionIds.length || b.score - a.score);
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

function scheduled(section: PlanSection, course: PlanCourse, ratings: Record<string, ProfessorSummary>): ScheduledSection {
  return { ...section, course_id: course.course_id, course_title: course.title, section_id: sectionId(section, course.course_id),
    credits: course.credits, instructorRatings: sectionRatings(section, ratings), seatCheckedAt: course.seatCheckedAt, instructorGpa: sectionGpa(section, course) };
}

function diagnose(courses: PlanCourse[], preferences: PlanPreferences): PlanDiagnosis[] {
  const parsed = parsePrefs(preferences);
  const diagnoses: PlanDiagnosis[] = [];
  const groups = courses.map((course) => ({ course, sections: eligibleSections(course, parsed) }));
  for (const { course, sections } of groups) {
    if (sections.length) continue;
    const selected = course.sections.filter((section) => selectedByCourse(section, course));
    if (!selected.length) diagnoses.push({ code: "sectionFilters", courseIds: [course.course_id] });
    const meets = selected.flatMap((section) => section.meetings ?? []).filter((meeting) => !isAsyncOnline(meeting));
    for (const day of parsed.excludedDays) if (meets.some((meeting) => dayNames(meeting.days).includes(day))) diagnoses.push({ code: "excludedDay", courseIds: [course.course_id], day });
    if (parsed.earliest !== null && meets.some((meeting) => minutes(meeting.start_time) !== null && minutes(meeting.start_time)! < parsed.earliest!)) diagnoses.push({ code: "earliestStart", courseIds: [course.course_id], time: preferences.earliestStart ?? undefined });
    if (parsed.strictTime && selected.some((section) => conflictsWithTimePreferences(section, { ...parsed, excludedDays: new Set(), earliest: null, busyBlocks: [] }))) diagnoses.push({ code: "timeWindow", courseIds: [course.course_id] });
    for (const block of parsed.busyBlocks) if (meets.some((meeting) => overlaps(meeting, { days: block.days.join(" "), start_time: block.start, end_time: block.end }))) diagnoses.push({ code: "busyBlock", courseIds: [course.course_id], blockId: block.id });
    if (parsed.openSeatsOnly && selected.some(isFull)) diagnoses.push({ code: "fullSections", courseIds: [course.course_id] });
    if (!parsed.includeFreshmanConnection && selected.some(isFreshmanConnection)) diagnoses.push({ code: "fcSections", courseIds: [course.course_id] });
    if (parsed.campusAreas.size && selected.some((section) => outsideCampusAreas(section, parsed.campusAreas))) diagnoses.push({ code: "campusAreas", courseIds: [course.course_id] });
    if (parsed.bufferMinutes && selected.some((section) => (section.meetings ?? []).some((meeting, index) => (section.meetings ?? []).slice(index + 1).some((other) => overlaps(meeting, other, parsed.bufferMinutes))))) diagnoses.push({ code: "bufferConflict", courseIds: [course.course_id] });
  }
  // A pair is reported as blocking only when every eligible combination conflicts.
  let comparisons = 0;
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
    const a = groups[i], b = groups[j];
    if (!a.sections.length || !b.sections.length) continue;
    let allConflict = true, allDirect = true;
    outer: for (const left of a.sections) for (const right of b.sections) {
      if (++comparisons > 40_000 || !conflicts(left, right, parsed.bufferMinutes)) { allConflict = false; break outer; }
      if (!conflicts(left, right)) allDirect = false;
    }
    if (!allConflict) continue;
    const left = a.sections[0], right = b.sections[0];
    const meeting = (left.meetings ?? []).flatMap((x) => (right.meetings ?? []).filter((y) => overlaps(x, y, parsed.bufferMinutes)).map((y) => ({ days: dayNames(x.days).filter((day) => dayNames(y.days).includes(day)), leftStart: x.start_time!, leftEnd: x.end_time!, rightStart: y.start_time!, rightEnd: y.end_time! })))[0];
    diagnoses.push({ code: allDirect ? "courseConflict" : "bufferConflict", courseIds: [a.course.course_id, b.course.course_id], sectionIds: [sectionId(left, a.course.course_id), sectionId(right, b.course.course_id)], sample: meeting });
  }
  if (!diagnoses.length) diagnoses.push({ code: "combinationConflict", courseIds: courses.map((course) => course.course_id) });
  return diagnoses;
}

// Stop at the first complete schedule. A shared budget bounds all proposed repairs together.
function completeWitness(courses: PlanCourse[], preferences: PlanPreferences, budget: { remaining: number }) {
  if (!courses.length) return null;
  const parsed = parsePrefs(preferences);
  const groups = courses.map((course) => ({ course, sections: eligibleSections(course, parsed) })).sort((a, b) => a.sections.length - b.sections.length);
  if (groups.some((group) => !group.sections.length)) return null;
  const picked: Array<{ course: PlanCourse; section: PlanSection }> = [];
  const visit = (index: number): string[] | null => {
    if (index === groups.length) return picked.map(({ course, section }) => sectionId(section, course.course_id));
    for (const section of groups[index].sections) {
      if (--budget.remaining < 0) return null;
      if (picked.some((item) => conflicts(item.section, section, parsed.bufferMinutes))) continue;
      picked.push({ course: groups[index].course, section });
      const result = visit(index + 1);
      picked.pop();
      if (result) return result;
    }
    return null;
  };
  return visit(0);
}

export function applyRepair(courses: PlanCourse[], preferences: PlanPreferences, repair: Pick<PlanRepair, "kind" | "day" | "blockId" | "courseId">) {
  const nextPreferences = { ...preferences };
  let nextCourses = courses;
  switch (repair.kind) {
    case "allowDay": nextPreferences.excludedDays = (preferences.excludedDays ?? []).filter((day) => day !== repair.day); break;
    case "clearEarliest": nextPreferences.earliestStart = null; break;
    case "relaxWindow": nextPreferences.strictTime = false; break;
    case "clearBuffer": nextPreferences.bufferMinutes = 0; break;
    case "removeBlock": nextPreferences.busyBlocks = (preferences.busyBlocks ?? []).filter((block) => block.id !== repair.blockId); break;
    case "allowFull": nextPreferences.openSeatsOnly = false; break;
    case "clearCampusAreas": nextPreferences.campusAreas = []; break;
    case "unpin": nextCourses = courses.map((course) => course.course_id === repair.courseId ? { ...course, pinnedSectionId: undefined } : course); break;
    case "resetFilters": nextCourses = courses.map((course) => course.course_id === repair.courseId ? { ...course, pinnedSectionId: undefined, excludedSectionIds: [], instructors: undefined } : course); break;
    case "removeCourse": nextCourses = courses.filter((course) => course.course_id !== repair.courseId); break;
  }
  return { courses: nextCourses, preferences: nextPreferences };
}

export function generateOptions(courses: PlanCourse[], ratings: Record<string, ProfessorSummary>, preferences: PlanPreferences): PlannerResult {
  const result = searchOptions(courses, ratings, preferences);
  if (result.options.some((option) => option.selectedSections.length === courses.length)) return { ...result, diagnostics: [], repairs: [] };
  const diagnostics = diagnose(courses, preferences);
  const candidates: Array<Omit<PlanRepair, "sectionIds">> = [];
  for (const day of preferences.excludedDays ?? []) candidates.push({ kind: "allowDay", day });
  if (preferences.earliestStart) candidates.push({ kind: "clearEarliest" });
  if (preferences.strictTime) candidates.push({ kind: "relaxWindow" });
  if (preferences.bufferMinutes) candidates.push({ kind: "clearBuffer" });
  for (const block of preferences.busyBlocks ?? []) candidates.push({ kind: "removeBlock", blockId: block.id });
  if (preferences.openSeatsOnly) candidates.push({ kind: "allowFull" });
  if (preferences.campusAreas?.length) candidates.push({ kind: "clearCampusAreas" });
  for (const course of courses) {
    if (course.pinnedSectionId) candidates.push({ kind: "unpin", courseId: course.course_id });
    if (course.instructors?.length || course.excludedSectionIds?.length) candidates.push({ kind: "resetFilters", courseId: course.course_id });
  }
  for (const course of courses) candidates.push({ kind: "removeCourse", courseId: course.course_id });
  const budget = { remaining: 80_000 };
  const repairs: PlanRepair[] = [];
  for (const candidate of candidates) {
    const changed = applyRepair(courses, preferences, candidate);
    // A difficult first trial must not starve every other possible repair.
    const trialBudget = { remaining: Math.min(8_000, budget.remaining) };
    const before = trialBudget.remaining;
    const sectionIds = completeWitness(changed.courses, changed.preferences, trialBudget);
    budget.remaining -= before - Math.max(0, trialBudget.remaining);
    if (sectionIds) repairs.push({ ...candidate, sectionIds });
    if (repairs.length >= 6 || budget.remaining <= 0) break;
  }
  return { ...result, diagnostics, repairs };
}

export function replacementOptions(courses: PlanCourse[], ratings: Record<string, ProfessorSummary>, preferences: PlanPreferences, currentIds: string[], courseId: string) {
  const parsed = parsePrefs(preferences);
  const target = courses.find((course) => course.course_id === courseId);
  if (!target || currentIds.length !== courses.length || new Set(currentIds).size !== currentIds.length) throw new Error("invalidSchedule");
  const current = courses.map((course) => {
    const matching = course.sections.filter((section) => currentIds.includes(sectionId(section, course.course_id)));
    if (matching.length !== 1) throw new Error("sectionUnavailable");
    return scheduled(matching[0], course, ratings);
  });
  const others = current.filter((section) => section.course_id !== courseId);
  for (const section of others) {
    const course = courses.find((course) => course.course_id === section.course_id)!;
    if (!selectedByCourse(section, course) || !allowedByPreferences(section, parsed, section.section_id === course.pinnedSectionId)
      || others.some((other) => other !== section && conflicts(section, other, parsed.bufferMinutes))) throw new Error("scheduleChanged");
  }
  const currentTarget = current.find((section) => section.course_id === courseId)!;
  const alternatives = eligibleSections(target, parsed, true)
    .filter((section) => sectionId(section, courseId) !== currentTarget.section_id && !others.some((other) => conflicts(section, other, parsed.bufferMinutes)))
    .map((section) => summarize(current.map((item) => item.course_id === courseId ? scheduled(section, target, ratings) : item), parsed))
    .sort((a, b) => a.fullSectionIds.length - b.fullSectionIds.length || b.score - a.score);
  return { current: summarize(current, parsed), options: alternatives.slice(0, 20), total: alternatives.length };
}
