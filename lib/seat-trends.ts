// Historical seat availability trends and predictions

export type SeatSnapshot = {
  openSeats: number;
  totalSeats: number;
  waitlist: number;
  checkedAt: string;
};

export type SeatTrend = {
  sectionId: string;
  courseId: string;
  term: string;
  snapshots: SeatSnapshot[];
  currentOpen: number;
  currentTotal: number;
  currentWaitlist: number;
  // Computed metrics
  fillRate: number; // % filled over time period
  velocity: number; // seats/day change rate
  daysToFull: number | null; // predicted days until full (null if trend is positive)
  demandIndex: number; // 0-100 popularity score
};

export type OfferingTermStatus = "past" | "current" | "upcoming";

export type OfferingHistory = {
  courseId: string;
  terms: Array<{
    term: string;
    termName: string;
    sectionCount: number;
    totalSeats: number;
    openSeats: number | null;
    fullSections: number | null;
    // "past" (numbers are final), "current" (in progress) or "upcoming" (registration).
    status: OfferingTermStatus;
  }>;
  pattern: "every-fall" | "every-spring" | "every-summer" | "fall-spring" | "all-terms" | "irregular";
};

export type PopularCourse = {
  courseId: string;
  courseTitle: string;
  term: string;
  planCount: number; // unique users who added it
  activeCount: number; // users who still have it
  demandIndex: number; // 0-100 score
  trendDirection: "rising" | "stable" | "falling";
};

const MIN_SNAPSHOTS = 3;

/**
 * Calculate seat fill rate (0-1) from snapshots
 */
export function calculateFillRate(snapshots: SeatSnapshot[]): number {
  if (snapshots.length < 2) return 0;
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  if (!first || !last || !first.totalSeats) return 0;
  const startFilled = first.totalSeats - first.openSeats;
  const endFilled = last.totalSeats - last.openSeats;
  return (endFilled - startFilled) / first.totalSeats;
}

/**
 * Calculate rate of seat change (seats per day)
 */
export function calculateVelocity(snapshots: SeatSnapshot[]): number {
  if (snapshots.length < 2) return 0;
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  if (!first || !last) return 0;
  const seatChange = first.openSeats - last.openSeats;
  const timeMs = new Date(last.checkedAt).getTime() - new Date(first.checkedAt).getTime();
  const days = timeMs / (1000 * 60 * 60 * 24);
  if (days === 0) return 0;
  return seatChange / days;
}

/**
 * Predict days until section is full (null if seats are opening up)
 */
export function predictDaysToFull(currentOpen: number, velocity: number): number | null {
  if (velocity <= 0) return null; // seats opening up or stable
  if (currentOpen === 0) return 0;
  return Math.ceil(currentOpen / velocity);
}

/**
 * Calculate demand index (0-100) based on fill rate, velocity, and waitlist
 */
export function calculateDemandIndex(
  fillRate: number,
  velocity: number,
  waitlist: number,
  totalSeats: number,
): number {
  if (totalSeats === 0) return 0;
  // Higher fill rate = higher demand (0-40 points)
  const fillScore = Math.min(40, Math.max(0, fillRate) * 40);
  // Higher velocity = higher demand (0-30 points)
  const velocityScore = Math.min(30, (Math.max(0, velocity) / totalSeats) * 100 * 30);
  // Waitlist presence = high demand (0-30 points)
  const waitlistScore = Math.min(30, (waitlist / totalSeats) * 100);
  return Math.round(Math.max(0, Math.min(100, fillScore + velocityScore + waitlistScore)));
}

/**
 * Analyze seat trend from snapshots
 */
export function analyzeSeatTrend(
  sectionId: string,
  courseId: string,
  term: string,
  snapshots: SeatSnapshot[],
): SeatTrend | null {
  if (snapshots.length < MIN_SNAPSHOTS) return null;
  const sorted = [...snapshots].sort((a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime());
  const latest = sorted[sorted.length - 1];
  if (!latest) return null;

  const fillRate = calculateFillRate(sorted);
  const observedDays = (Date.parse(latest.checkedAt) - Date.parse(sorted[0].checkedAt)) / 86400000;
  // A few page refreshes are not evidence of a daily filling rate.
  const velocity = observedDays >= 1 ? calculateVelocity(sorted) : 0;
  const daysToFull = observedDays >= 1 ? predictDaysToFull(latest.openSeats, velocity) : null;
  const demandIndex = calculateDemandIndex(latest.totalSeats > 0 ? 1 - latest.openSeats / latest.totalSeats : 0, velocity, latest.waitlist, latest.totalSeats);

  return {
    sectionId,
    courseId,
    term,
    snapshots: sorted,
    currentOpen: latest.openSeats,
    currentTotal: latest.totalSeats,
    currentWaitlist: latest.waitlist,
    fillRate,
    velocity,
    daysToFull,
    demandIndex,
  };
}

/**
 * Detect offering pattern from historical terms
 */
export function detectOfferingPattern(terms: string[]): OfferingHistory["pattern"] {
  if (terms.length < 2) return "irregular";
  const semesters = terms.map((t) => {
    const code = t.slice(4);
    if (code === "01") return "spring";
    if (code === "05") return "summer";
    if (code === "08") return "fall";
    return "other";
  });
  const hasSpring = semesters.includes("spring");
  const hasFall = semesters.includes("fall");
  const hasSummer = semesters.includes("summer");
  const allTerms = hasSpring && hasFall && hasSummer;
  if (allTerms && terms.length >= 6) return "all-terms";
  if (hasSpring && hasFall && !hasSummer) return "fall-spring";
  if (hasFall && !hasSpring && !hasSummer) return "every-fall";
  if (hasSpring && !hasFall && !hasSummer) return "every-spring";
  if (hasSummer && !hasSpring && !hasFall) return "every-summer";
  return "irregular";
}

/**
 * Format offering pattern for display
 */
export function formatOfferingPattern(pattern: OfferingHistory["pattern"], lang: "en" | "zh"): string {
  const patterns = {
    en: {
      "every-fall": "Observed in Fall",
      "every-spring": "Observed in Spring",
      "every-summer": "Observed in Summer",
      "fall-spring": "Observed in Fall & Spring",
      "all-terms": "Observed across semesters",
      irregular: "No consistent pattern yet",
    },
    zh: {
      "every-fall": "已观测到秋季开课",
      "every-spring": "已观测到春季开课",
      "every-summer": "已观测到夏季开课",
      "fall-spring": "已观测到秋季和春季开课",
      "all-terms": "已观测到多个学期开课",
      irregular: "暂未发现稳定规律",
    },
  };
  return patterns[lang][pattern];
}

/**
 * Format term code to readable name
 */
export function formatTermName(term: string, lang: "en" | "zh"): string {
  const year = term.slice(0, 4);
  const semester = term.slice(4);
  const names = {
    en: { "01": "Spring", "05": "Summer", "08": "Fall", "12": "Winter" },
    zh: { "01": "春季", "05": "夏季", "08": "秋季", "12": "冬季" },
  };
  const semesterName = names[lang][semester as "01" | "05" | "08"] ?? semester;
  return lang === "en" ? `${semesterName} ${year}` : `${year} ${semesterName}`;
}

/**
 * Calculate trend direction from recent activity
 */
export function calculateTrendDirection(
  currentCount: number,
  previousCount: number,
): PopularCourse["trendDirection"] {
  if (previousCount === 0) return currentCount > 0 ? "rising" : "stable";
  const change = (currentCount - previousCount) / previousCount;
  if (change > 0.1) return "rising";
  if (change < -0.1) return "falling";
  return "stable";
}
