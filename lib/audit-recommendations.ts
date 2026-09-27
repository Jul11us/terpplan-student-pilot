import { parseCount, type UmdSection } from "@/lib/umd";

export type AuditCandidate = {
  courseId: string;
  title: string;
  credits: string | null;
  sections: number;
  openSections: number;
  openSeats: number;
  knownSeatSections: number;
  averageGpa: number | null;
};

function creditText(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return String(value);
  if (typeof value === "string" && /^\d+(?:\.\d+)?(?:[–-]\d+(?:\.\d+)?)?$/.test(value.trim())) return value.trim();
  return null;
}

export function summarizeAuditCandidate(courseId: string, title: string, credits: unknown, sections: UmdSection[]): AuditCandidate {
  const usable = sections.filter((section) => !/-FC[A-Z0-9]*$/i.test(section.section_id ?? ""));
  const open = usable.map((section) => parseCount(section.open_seats));
  return {
    courseId,
    title,
    credits: creditText(credits),
    sections: usable.length,
    openSections: open.filter((count) => count !== null && count > 0).length,
    openSeats: open.reduce<number>((total, count) => total + (count ?? 0), 0),
    knownSeatSections: open.filter((count) => count !== null).length,
    averageGpa: null,
  };
}

export function compareAuditCandidates(left: AuditCandidate, right: AuditCandidate) {
  return Number(right.openSections > 0) - Number(left.openSections > 0)
    || right.openSeats - left.openSeats
    || left.courseId.localeCompare(right.courseId);
}

export function compareAuditCandidatesByGpa(left: AuditCandidate, right: AuditCandidate) {
  return (right.averageGpa ?? -1) - (left.averageGpa ?? -1)
    || compareAuditCandidates(left, right);
}

const gradeCache = new Map<string, { expiresAt: number; value: number | null }>();

// PlanetTerp's historical course average is context, never a promise about a future grade.
export async function historicalAverageGpa(courseId: string): Promise<number | null> {
  const cached = gradeCache.get(courseId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const response = await fetch(`https://planetterp.com/api/v1/course?name=${encodeURIComponent(courseId)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(7_000),
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    const record = Array.isArray(payload) ? payload[0] : payload;
    const raw = record && typeof record === "object" ? (record as Record<string, unknown>).average_gpa : null;
    const value = typeof raw === "number" && raw >= 0 && raw <= 4 ? raw : null;
    if (gradeCache.size >= 300) gradeCache.delete(gradeCache.keys().next().value!);
    gradeCache.set(courseId, { value, expiresAt: Date.now() + 60 * 60_000 });
    return value;
  } catch {
    return null;
  }
}
