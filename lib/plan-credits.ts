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

// UMD undergraduate credit limits (Academic Catalog, "Registration"): fall and spring allow 20 credits, but
// only 16 before the first day of classes; summer 16 total (8 per six-week session, 4 per three-week session);
// winter 4. More needs the advising college's approval.
export function creditLimits(term: string): { max: number; beforeClasses: number | null } | null {
  const season = term.slice(4);
  if (season === "01" || season === "08") return { max: 20, beforeClasses: 16 };
  if (season === "05") return { max: 16, beforeClasses: null };
  if (season === "12") return { max: 4, beforeClasses: null };
  return null;
}

// Uses the lowest possible total, so a variable-credit course does not raise a warning the student can avoid.
export function creditWarning(total: PlanCreditTotal, term: string, language: "en" | "zh") {
  const limits = creditLimits(term);
  if (!limits) return "";
  if (total.min > limits.max) {
    return language === "zh"
      ? `超过 ${limits.max} 学分上限：多于 ${limits.max} 学分需要所在学院（advising college）事先批准。`
      : `Over the ${limits.max}-credit limit: more than ${limits.max} credits needs approval from your advising college.`;
  }
  // The plan's total spans both summer sessions; without session dates it cannot prove a session overload.
  if (term.slice(4) === "05" && total.min > 4) {
    return language === "zh"
      ? "暑期学分上限：整个暑期共 16 学分，每个六周阶段最多 8 学分、三周阶段最多 4 学分。请核对各课程的阶段日期；当前合计覆盖整个暑期。"
      : "Summer limits: 16 credits total, 8 per six-week session and 4 per three-week session. Check each course's session dates; this total spans the whole summer.";
  }
  if (limits.beforeClasses !== null && total.min > limits.beforeClasses) {
    return language === "zh"
      ? `超过 ${limits.beforeClasses} 学分：开学第一天之前最多只能注册 ${limits.beforeClasses} 学分，开课后才能加到 ${limits.max} 学分。`
      : `Over ${limits.beforeClasses} credits: before the first day of classes you can register for at most ${limits.beforeClasses}. You can go up to ${limits.max} once classes start.`;
  }
  return "";
}
