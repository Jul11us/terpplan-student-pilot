// A rough read on how heavy a semester's courses are, from each course's historical average GPA on
// PlanetTerp (all past terms and instructors) and its credits. A low average means students have found the
// course hard; it says nothing certain about this term, so the page presents it as a hint.

export type Difficulty = "hard" | "moderate" | "light" | "unknown";
export type WorkloadLevel = "light" | "moderate" | "heavy" | "veryHeavy";

export type WorkloadCourse = { courseId: string; credits: number | null; averageGpa: number | null | undefined };
export type Workload = { level: WorkloadLevel; credits: number; weighted: number; hard: Array<{ courseId: string; averageGpa: number }> };

const WEIGHT: Record<Difficulty, number> = { hard: 1.5, moderate: 1.15, light: 0.85, unknown: 1 };

export function courseDifficulty(averageGpa: number | null | undefined): Difficulty {
  if (typeof averageGpa !== "number") return "unknown";
  return averageGpa < 2.75 ? "hard" : averageGpa < 3.1 ? "moderate" : "light";
}

// Credits weighted by difficulty (a hard 4-credit course counts like 6), then banded. Two or more hard
// courses make a term at least "heavy" whatever the total.
export function semesterWorkload(courses: WorkloadCourse[]): Workload {
  let credits = 0, weighted = 0;
  const hard: Workload["hard"] = [];
  for (const course of courses) {
    const value = course.credits ?? 3;
    const difficulty = courseDifficulty(course.averageGpa);
    credits += value;
    weighted += value * WEIGHT[difficulty];
    if (difficulty === "hard") hard.push({ courseId: course.courseId, averageGpa: course.averageGpa as number });
  }
  let level: WorkloadLevel = weighted >= 20 ? "veryHeavy" : weighted >= 16 ? "heavy" : weighted >= 12 ? "moderate" : "light";
  if (hard.length >= 2 && (level === "light" || level === "moderate")) level = "heavy";
  hard.sort((a, b) => a.averageGpa - b.averageGpa);
  return { level, credits, weighted: Math.round(weighted * 10) / 10, hard };
}
