export type ProfessorStatus = "ok" | "empty" | "unmatched" | "failed" | "tba" | "limited";

export type ProfessorSummary = {
  name: string;
  matched: boolean;
  status: ProfessorStatus;
  averageRating: number | null;
  reviewCount: number | null;
  sourceUrl: string | null;
  // Average GPA this instructor gave, from PlanetTerp's grade data: in this course when there is any,
  // otherwise across all their courses. Only filled when a course is given.
  gpa?: GpaSummary | null;
};

export type GpaSummary = { gpa: number; students: number; scope: "course" | "all" };

export type ReviewHighlight = {
  courseId: string | null;
  rating: number | null;
  created: string | null;
  excerpt: string;
  otherCourse: boolean;
  sourceUrl: string;
};

export type ProfessorReviews = ProfessorSummary & {
  highlights: ReviewHighlight[];
};

const API_BASE = "https://planetterp.com/api/v1";
const CACHE_TTL_MS = 10 * 60_000;
const REVIEW_LIMIT = 3;
const EXCERPT_LIMIT = 280;
const MAX_SUMMARY_LOOKUPS = 40;
const cache = new Map<string, { expiresAt: number; value: Record<string, unknown> | null }>();

export function normalizeProfessorName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function isInstructorTba(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").toUpperCase().replace(/\.$/, "");
  return ["TBA", "T.B.A", "TO BE ANNOUNCED", "TO BE ARRANGED"].includes(normalized);
}

async function fetchProfessor(name: string, includeReviews: boolean) {
  const key = (includeReviews ? "reviews|" : "summary|") + normalizeProfessorName(name);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const params = new URLSearchParams({ name: name.trim() });
  if (includeReviews) params.set("reviews", "true");
  const response = await fetch(API_BASE + "/professor?" + params.toString(), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(7_000),
    cache: "no-store",
  });
  if (response.status === 400 || response.status === 404) {
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: null });
    return null;
  }
  if (!response.ok) throw new Error("PlanetTerp returned " + response.status + ".");
  const payload: unknown = await response.json();
  const records = Array.isArray(payload)
    ? payload.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : payload && typeof payload === "object" ? [payload as Record<string, unknown>] : [];
  const professor = records.find((item) => normalizeProfessorName(String(item.name ?? "")) === normalizeProfessorName(name));
  if (!professor) {
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: null });
    return null;
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: professor });
  return professor;
}

function summary(name: string, professor: Record<string, unknown> | null): ProfessorSummary {
  const rating = Number(professor?.average_rating);
  const averageRating = professor?.average_rating !== null && professor?.average_rating !== undefined && Number.isFinite(rating)
    ? rating
    : null;
  const slug = String(professor?.slug ?? "").trim();
  return {
    name: String(professor?.name ?? name),
    matched: Boolean(professor),
    status: !professor ? "unmatched" : averageRating === null ? "empty" : "ok",
    averageRating,
    reviewCount: professor?.review_count !== null && professor?.review_count !== undefined && Number.isFinite(Number(professor.review_count))
      ? Number(professor.review_count)
      : null,
    sourceUrl: slug ? "https://planetterp.com/professor/" + encodeURIComponent(slug) : null,
  };
}

export async function getProfessorSummary(name: string): Promise<ProfessorSummary> {
  const normalized = name.trim();
  if (!normalized || isInstructorTba(normalized)) {
    return { name: normalized || "TBA", matched: false, status: "tba", averageRating: null, reviewCount: null, sourceUrl: null };
  }
  try {
    return summary(normalized, await fetchProfessor(normalized, false));
  } catch {
    return { name: normalized, matched: false, status: "failed", averageRating: null, reviewCount: null, sourceUrl: null };
  }
}

export async function getProfessorSummaries(names: string[]) {
  const unique = [...new Map(names.map((name) => [normalizeProfessorName(name), name.trim()])).values()]
    .filter((name) => name && !isInstructorTba(name));
  const results: Record<string, ProfessorSummary> = {};
  const toFetch = unique.slice(0, MAX_SUMMARY_LOOKUPS);
  let cursor = 0;
  const worker = async () => {
    while (cursor < toFetch.length) {
      const name = toFetch[cursor++];
      results[normalizeProfessorName(name)] = await getProfessorSummary(name);
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, toFetch.length) }, worker));
  for (const name of unique.slice(MAX_SUMMARY_LOOKUPS)) {
    results[normalizeProfessorName(name)] = {
      name, matched: false, status: "limited", averageRating: null, reviewCount: null, sourceUrl: null,
    };
  }
  return results;
}

function excerptText(value: unknown) {
  const paragraph = String(value ?? "").trim().split(/\n\s*\n/, 1)[0].replace(/\s+/g, " ").trim();
  if (paragraph.length <= EXCERPT_LIMIT) return paragraph;
  const clipped = paragraph.slice(0, EXCERPT_LIMIT).replace(/\s+\S*$/, "").replace(/[.,;:]+$/, "");
  return (clipped || paragraph.slice(0, EXCERPT_LIMIT)) + "…";
}

function createdTime(value: unknown) {
  const stamp = Date.parse(String(value ?? ""));
  return Number.isFinite(stamp) ? stamp : 0;
}

const SPECIFICITY = /\b(homework|assignment|exam|midterm|final|quiz|lecture|workload|project|feedback|office\s*hours?|grading|curve|slides|lab|discussion|teaching|instructor|test|essay|paper|reading|extra\s*credit)\b/gi;

function reviewHighlights(reviews: unknown[], courseId: string, sourceUrl: string): ReviewHighlight[] {
  const wantedCourse = courseId.replace(/\s+/g, "").toUpperCase();
  const seen = new Set<string>();
  const ranked = reviews.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const text = String(item.review ?? "").trim();
    const excerpt = excerptText(text);
    const fingerprint = text.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US").slice(0, 80);
    if (excerpt.length < 24 || (excerpt.match(/[A-Za-z]/g) ?? []).length < 12 || seen.has(fingerprint)) return [];
    seen.add(fingerprint);
    const reviewCourse = String(item.course ?? "").replace(/\s+/g, "").toUpperCase();
    const sameCourse = Boolean(wantedCourse) && reviewCourse === wantedCourse;
    const ratingNumber = Number(item.rating);
    const rating = item.rating === null || item.rating === undefined || !Number.isFinite(ratingNumber) ? null : ratingNumber;
    const createdStamp = createdTime(item.created);
    const ageDays = createdStamp ? Math.max(0, (Date.now() - createdStamp) / 86_400_000) : Infinity;
    const recency = ageDays < 365 ? 10 : ageDays < 1095 ? 5 : createdStamp ? 1 : 0;
    const specificity = (text.match(SPECIFICITY) ?? []).length;
    return [{
      courseId: reviewCourse || null,
      rating,
      created: item.created ? String(item.created) : null,
      excerpt,
      otherCourse: Boolean(reviewCourse) && !sameCourse,
      sourceUrl,
      sameCourse,
      bucket: rating === null ? "unknown" : rating <= 2 ? "low" : rating < 4 ? "mid" : "high",
      score: (sameCourse ? 100 : 0) + 8 * Math.min(specificity, 4) + recency + (text.length >= 40 && text.length <= 800 ? 5 : 0),
      createdStamp,
    }];
  });
  ranked.sort((a, b) => Number(b.sameCourse) - Number(a.sameCourse) || b.score - a.score || b.createdStamp - a.createdStamp || a.excerpt.localeCompare(b.excerpt));
  const chosen: typeof ranked = [];
  const buckets = new Set<string>();
  for (const item of ranked) {
    if (chosen.length >= REVIEW_LIMIT) break;
    if (buckets.has(item.bucket) && item.bucket !== "unknown") continue;
    chosen.push(item);
    buckets.add(item.bucket);
  }
  for (const item of ranked) {
    if (chosen.length >= REVIEW_LIMIT) break;
    if (!chosen.includes(item)) chosen.push(item);
  }
  return chosen.map(({ courseId, rating, created, excerpt, otherCourse, sourceUrl }) => ({
    courseId, rating, created, excerpt, otherCourse, sourceUrl,
  }));
}

export async function getProfessorReviews(name: string, courseId: string): Promise<ProfessorReviews> {
  const normalized = name.trim();
  if (!normalized || isInstructorTba(normalized)) {
    return { name: normalized || "TBA", matched: false, status: "tba", averageRating: null, reviewCount: null, sourceUrl: null, highlights: [] };
  }
  try {
    const professor = await fetchProfessor(normalized, true);
    const base = summary(normalized, professor);
    if (!professor) return { ...base, highlights: [] };
    const sourceUrl = base.sourceUrl ?? "https://planetterp.com/professor";
    const reviews = Array.isArray(professor.reviews) ? professor.reviews : [];
    const highlights = reviewHighlights(reviews, courseId, sourceUrl);
    return {
      ...base,
      status: highlights.length ? "ok" : "empty",
      reviewCount: reviews.length,
      sourceUrl,
      highlights,
    };
  } catch {
    return { name: normalized, matched: false, status: "failed", averageRating: null, reviewCount: null, sourceUrl: null, highlights: [] };
  }
}

// UMD grade points. W and "Other" are not graded and are left out, as on PlanetTerp.
const GRADE_POINTS: Record<string, number> = { "A+": 4, A: 4, "A-": 3.7, "B+": 3.3, B: 3, "B-": 2.7, "C+": 2.3, C: 2, "C-": 1.7, "D+": 1.3, D: 1, "D-": 0.7, F: 0 };

export function averageGpa(rows: unknown[]): { gpa: number; students: number } | null {
  let points = 0, students = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    for (const [grade, value] of Object.entries(GRADE_POINTS)) {
      const n = Number((row as Record<string, unknown>)[grade]);
      if (Number.isFinite(n) && n > 0) { points += value * n; students += n; }
    }
  }
  return students ? { gpa: Math.round((points / students) * 100) / 100, students } : null;
}

const gradeCache = new Map<string, { expiresAt: number; value: unknown[] }>();

async function fetchGrades(params: Record<string, string>) {
  const key = JSON.stringify(params);
  const cached = gradeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const response = await fetch(API_BASE + "/grades?" + new URLSearchParams(params).toString(), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(7_000),
    cache: "no-store",
  });
  // An unknown professor or course is a 4xx with an error message, which means "no grades".
  if (response.status >= 400 && response.status < 500) {
    gradeCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: [] });
    return [];
  }
  if (!response.ok) throw new Error("PlanetTerp returned " + response.status + ".");
  const payload: unknown = await response.json();
  const value = Array.isArray(payload) ? payload : [];
  gradeCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

export async function getProfessorGpa(name: string, courseId: string): Promise<GpaSummary | null> {
  const professor = name.trim();
  if (!professor || isInstructorTba(professor)) return null;
  try {
    const inCourse = averageGpa(await fetchGrades({ course: courseId, professor }));
    if (inCourse) return { ...inCourse, scope: "course" };
    const overall = averageGpa(await fetchGrades({ professor }));
    return overall ? { ...overall, scope: "all" } : null;
  } catch {
    return null;
  }
}
