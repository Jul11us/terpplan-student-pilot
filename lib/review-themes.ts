// What students keep saying about an instructor, as a few counted themes ("Clear lectures · 14 reviews").
// Each review is matched against a fixed list of phrases, so the result is repeatable and nothing is made
// up: a theme appears only when real reviews use words for it. A phrase right after "not", "never" or
// "n't" counts for the opposite theme when there is one ("not helpful" is not "Helpful").

export type ThemeTone = "good" | "bad" | "neutral";
export type ThemeKey =
  | "clear" | "unclear" | "helpful" | "unhelpful" | "engaging" | "boring" | "fairGrading" | "harshGrading"
  | "hardExams" | "heavyWork" | "lightWork" | "curve" | "recommend" | "avoid" | "readsSlides" | "attendance";

export type ReviewTheme = { key: ThemeKey; tone: ThemeTone; count: number };

type ThemeRule = { key: ThemeKey; tone: ThemeTone; phrases: string[]; opposite?: ThemeKey };

const RULES: ThemeRule[] = [
  { key: "clear", tone: "good", opposite: "unclear", phrases: ["clear", "explains well", "explains things well", "explains everything", "easy to understand", "great lecturer", "good lecturer", "great teacher", "good teacher", "well organized", "well-organized", "organized"] },
  { key: "unclear", tone: "bad", opposite: "clear", phrases: ["confusing", "unclear", "hard to follow", "hard to understand", "disorganized", "unorganized", "all over the place", "rambles"] },
  { key: "helpful", tone: "good", opposite: "unhelpful", phrases: ["helpful", "cares about", "caring", "approachable", "willing to help", "friendly", "nice", "accessible", "supportive", "accommodating"] },
  { key: "unhelpful", tone: "bad", phrases: ["rude", "condescending", "unhelpful", "dismissive", "doesn't care", "does not care", "unapproachable"] },
  { key: "engaging", tone: "good", opposite: "boring", phrases: ["engaging", "interesting", "passionate", "enthusiastic", "funny", "entertaining", "fun"] },
  { key: "boring", tone: "bad", opposite: "engaging", phrases: ["boring", "monotone", "dry", "dull", "fell asleep", "put me to sleep"] },
  { key: "fairGrading", tone: "good", opposite: "harshGrading", phrases: ["fair grader", "grades fairly", "fair grading", "fair exams", "exams are fair", "exams were fair", "lenient", "generous", "partial credit"] },
  { key: "harshGrading", tone: "bad", phrases: ["harsh grader", "tough grader", "harsh grading", "strict grader", "strict grading", "nitpicky", "picky", "grades harshly", "takes off points"] },
  { key: "hardExams", tone: "bad", phrases: ["hard exams", "difficult exams", "tough exams", "exams are hard", "exams were hard", "exams are difficult", "exams were difficult", "tests are hard", "tests were hard", "hard tests", "difficult tests", "tricky exams", "exams are tricky", "exams were tricky"] },
  { key: "heavyWork", tone: "bad", opposite: "lightWork", phrases: ["heavy workload", "lots of work", "a lot of work", "lots of homework", "a lot of homework", "time consuming", "time-consuming", "workload is heavy", "so much work", "busy work", "busywork"] },
  { key: "lightWork", tone: "good", phrases: ["easy a", "easy class", "light workload", "not much work", "little work", "manageable workload", "workload is manageable", "workload was manageable"] },
  { key: "curve", tone: "neutral", phrases: ["curve", "curved", "curves"] },
  { key: "recommend", tone: "good", opposite: "avoid", phrases: ["recommend", "would take again", "take this professor", "take this class", "best professor", "best teacher", "amazing professor", "great professor"] },
  { key: "avoid", tone: "bad", phrases: ["avoid this professor", "avoid this class", "avoid this course", "avoid at all costs", "worst professor", "worst teacher", "do not take", "don't take", "dont take", "stay away"] },
  { key: "readsSlides", tone: "bad", phrases: ["reads off the slides", "reads off slides", "reads from the slides", "reads the slides", "just reads"] },
  { key: "attendance", tone: "neutral", phrases: ["attendance", "mandatory", "participation"] },
];

const NEGATION = /\b(not|never|no|isn't|wasn't|aren't|weren't|doesn't|don't|didn't|hardly|barely)\s+(?:\w+\s+){0,2}$/;

function phraseRegex(phrase: string) {
  return new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "gi");
}

const COMPILED = RULES.map((rule) => ({ ...rule, patterns: rule.phrases.map(phraseRegex) }));
const BY_KEY = new Map(RULES.map((rule) => [rule.key, rule]));

// The themes in one review: each counts once, however many of its phrases the review uses.
export function themesInReview(text: string): Set<ThemeKey> {
  const found = new Set<ThemeKey>();
  const lower = text.toLowerCase().replace(/[’`]/g, "'");
  for (const rule of COMPILED) {
    for (const pattern of rule.patterns) {
      pattern.lastIndex = 0;
      for (let match = pattern.exec(lower); match; match = pattern.exec(lower)) {
        const negated = NEGATION.test(lower.slice(Math.max(0, match.index - 40), match.index));
        if (!negated) found.add(rule.key);
        else if (rule.opposite) found.add(rule.opposite);
      }
    }
  }
  // "Not hard" style flips can leave both sides; a review that says both is left with neither.
  for (const rule of RULES) if (rule.opposite && found.has(rule.key) && found.has(rule.opposite)) { found.delete(rule.key); found.delete(rule.opposite); }
  return found;
}

// The most mentioned themes across reviews, at most `limit`. A theme needs two reviews (one when there are
// fewer than five reviews in all) so one comment does not read as a pattern.
export function reviewThemes(reviews: string[], limit = 6): ReviewTheme[] {
  const counts = new Map<ThemeKey, number>();
  for (const review of reviews) for (const key of themesInReview(review)) counts.set(key, (counts.get(key) ?? 0) + 1);
  const minimum = reviews.length < 5 ? 1 : 2;
  return [...counts].filter(([, count]) => count >= minimum)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, tone: BY_KEY.get(key)!.tone, count }));
}

export const THEME_LABELS: Record<"en" | "zh", Record<ThemeKey, string>> = {
  en: {
    clear: "Clear lectures", unclear: "Hard to follow", helpful: "Helpful", unhelpful: "Not approachable", engaging: "Engaging", boring: "Boring lectures",
    fairGrading: "Fair grading", harshGrading: "Harsh grading", hardExams: "Hard exams", heavyWork: "Heavy workload", lightWork: "Light workload",
    curve: "Curves grades", recommend: "Recommended", avoid: "Students say avoid", readsSlides: "Reads off slides", attendance: "Attendance matters",
  },
  zh: {
    clear: "讲得清楚", unclear: "讲得乱", helpful: "乐于助人", unhelpful: "不好接近", engaging: "上课有意思", boring: "上课无聊",
    fairGrading: "给分公平", harshGrading: "给分严", hardExams: "考试难", heavyWork: "作业多", lightWork: "作业少",
    curve: "会调分", recommend: "推荐", avoid: "有人劝别选", readsSlides: "照着幻灯片念", attendance: "看重出勤",
  },
};
