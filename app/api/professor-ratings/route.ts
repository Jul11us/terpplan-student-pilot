import { getProfessorGpa, getProfessorSummaries } from "@/lib/planetterp";
import { courseIdIsValid } from "@/lib/umd";

// Grade lookups take one or two PlanetTerp requests per instructor, so only a course page's worth.
const MAX_GPA_LOOKUPS = 20;

export async function POST(request: Request) {
  let body: { names?: unknown; courseId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Provide instructor names." }, { status: 400 });
  }
  if (!Array.isArray(body.names) || body.names.length > 200 || body.names.some((name) => typeof name !== "string" || name.length > 120)) {
    return Response.json({ error: "Provide a valid instructor list." }, { status: 400 });
  }
  const ratings = await getProfessorSummaries(body.names as string[]);
  // With a course, each matched instructor also gets the average GPA they gave (in that course if possible).
  const courseId = typeof body.courseId === "string" ? body.courseId.trim().toUpperCase() : "";
  if (courseIdIsValid(courseId)) {
    // PlanetTerp's own spelling of the name is what its grade data uses.
    const matched = Object.values(ratings).filter((item) => item.matched).slice(0, MAX_GPA_LOOKUPS);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(6, matched.length) }, async () => {
      while (next < matched.length) { const entry = matched[next++]; entry.gpa = await getProfessorGpa(entry.name, courseId); }
    }));
  }
  return Response.json({ ratings }, { headers: { "cache-control": "private, max-age=300" } });
}
