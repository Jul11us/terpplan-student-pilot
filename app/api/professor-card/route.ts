import { getProfessorCard } from "@/lib/planetterp";
import { courseIdIsValid } from "@/lib/umd";

// One request per instructor card: the rating, comment excerpts, average GPA and grade spread together,
// so opening a card is a single round trip rather than three.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = (url.searchParams.get("name") ?? "").trim();
  const courseId = (url.searchParams.get("course") ?? "").trim().toUpperCase();
  if (!name || name.length > 120) return Response.json({ error: "Choose an instructor first." }, { status: 400 });
  if (courseId && !courseIdIsValid(courseId)) return Response.json({ error: "Choose a valid course." }, { status: 400 });
  const card = await getProfessorCard(name, courseId);
  return Response.json(card, { headers: { "cache-control": "private, max-age=300" } });
}
