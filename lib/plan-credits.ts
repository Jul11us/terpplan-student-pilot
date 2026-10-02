// Running credit total for the courses in a plan, shown before any schedule is generated.
// Variable-credit courses (e.g. 1–3) make the total a range; a course whose credits could not be
// read is listed as unknown instead of being counted as 0.

export type CreditRange = { min: number; max: number };

export type PlanCreditTotal = { min: number; max: number; unknown: string[]; pending: string[] };

const positive = (value: unknown) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

// From /api/course `course`: credits is the minimum; max_credits is set only for variable-credit courses.
export function creditRange(course: { credits?: unknown; max_credits?: unknown } | null | undefined): CreditRange | null {
  const min = positive(course?.credits);
  if (min === null) return null;
  const max = positive(course?.max_credits);
  return { min, max: max !== null && max > min ? max : min };
}

// `known` maps course id -> range, or null once a lookup failed; a missing key is still loading.
export function totalPlanCredits(courseIds: string[], known: Record<string, CreditRange | null | undefined>): PlanCreditTotal {
  const total: PlanCreditTotal = { min: 0, max: 0, unknown: [], pending: [] };
  for (const id of courseIds) {
    if (!(id in known) || known[id] === undefined) { total.pending.push(id); continue; }
    const range = known[id];
    if (!range) { total.unknown.push(id); continue; }
    total.min += range.min;
    total.max += range.max;
  }
  return total;
}

const number = (value: number) => String(Math.round(value * 10) / 10);

export function formatCreditTotal(total: PlanCreditTotal, language: "en" | "zh") {
  const amount = total.min === total.max ? number(total.min) : `${number(total.min)}–${number(total.max)}`;
  const parts = [language === "zh" ? `共 ${amount} 学分` : `${amount} credit${amount === "1" ? "" : "s"}`];
  const unknown = total.unknown.join(", ");
  if (total.unknown.length) parts.push(language === "zh" ? `${unknown} 学分未知，未计入` : `${unknown}: credits unknown, not counted`);
  if (total.pending.length) parts.push(language === "zh" ? "正在读取…" : "loading…");
  return parts.join(" · ");
}
