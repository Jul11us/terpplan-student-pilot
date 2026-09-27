import { historicalAverageGpa } from "@/lib/audit-recommendations";
import { courseIdIsValid } from "@/lib/umd";

type RequestBody = { courseIds?: unknown };

export async function POST(request: Request) {
  let body: RequestBody;
  try { body = await request.json() as RequestBody; }
  catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
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
