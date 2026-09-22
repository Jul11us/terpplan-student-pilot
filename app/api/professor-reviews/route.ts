import { getProfessorReviews } from "@/lib/planetterp";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = (url.searchParams.get("name") ?? "").trim();
  const courseId = (url.searchParams.get("course") ?? "").trim().toUpperCase();
  if (!name || name.length > 120) return Response.json({ error: "Choose an instructor first." }, { status: 400 });
  if (courseId && !/^[A-Z]{4}\d{3}[A-Z0-9]*$/.test(courseId)) return Response.json({ error: "Choose a valid course." }, { status: 400 });
  const result = await getProfessorReviews(name, courseId);
  return Response.json(result, { headers: { "cache-control": "private, max-age=60" } });
}
