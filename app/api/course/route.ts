import { courseIdIsValid, DEFAULT_TERM, getCourse } from "@/lib/umd";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const courseId = (url.searchParams.get("id") ?? "").trim().toUpperCase();
  const term = url.searchParams.get("term") ?? DEFAULT_TERM;
  if (!courseIdIsValid(courseId)) return Response.json({ error: "Enter a valid course code." }, { status: 400 });
  if (!/^\d{6}$/.test(term)) return Response.json({ error: "Choose a valid term." }, { status: 400 });
  try {
    const detail = await getCourse(courseId, term);
    if (!detail) return Response.json({ error: `${courseId} was not found in the course catalog.` }, { status: 404 });
    return Response.json({ ...detail, term });
  } catch {
    return Response.json({ error: "Course details could not be loaded. Try again shortly." }, { status: 503 });
  }
}
