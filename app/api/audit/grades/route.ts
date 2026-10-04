import { historicalAverageGpa } from "@/lib/audit-recommendations";
import { courseIdIsValid } from "@/lib/umd";

import { readJsonObject, sameOriginMutation } from "@/lib/request-security";

export async function POST(request: Request) {
  const denied = sameOriginMutation(request);
  if (denied) return denied;
  const parsed = await readJsonObject(request, 32768);
  if (parsed.error) return parsed.error;
  const body = parsed.value;
  const courseIds = Array.isArray(body.courseIds)
    ? [...new Set(body.courseIds.filter((value): value is string => typeof value === "string").map((value) => value.trim().toUpperCase()))]
    : [];
  if (!courseIds.length || courseIds.length > 30 || courseIds.some((id) => !courseIdIsValid(id))) {
    return Response.json({ error: "Choose up to 30 valid course codes." }, { status: 400 });
  }

  const averages: Record<string, number | null> = {};
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, courseIds.length) }, async () => {
    while (next < courseIds.length) {
      const id = courseIds[next++];
      averages[id] = await historicalAverageGpa(id);
    }
  }));
  return Response.json({ averages });
}
