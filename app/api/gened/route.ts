import { getGenEdCourses, isGenEdCode } from "@/lib/gened";

// Courses in one Gen Ed category for a term, with their sections, for the Gen Ed finder.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const term = url.searchParams.get("term") ?? "";
  const code = (url.searchParams.get("code") ?? "").toUpperCase();
  if (!/^\d{4}(01|05|08|12)$/.test(term)) return Response.json({ error: "Choose a valid term." }, { status: 400 });
  if (!isGenEdCode(code)) return Response.json({ error: "Choose a Gen Ed category." }, { status: 400 });
  try {
    const { courses, seatCheckedAt } = await getGenEdCourses(term, code);
    return Response.json({ term, code, courses, seatCheckedAt });
  } catch (error) {
    console.error("Gen Ed lookup failed", term, code, error);
    return Response.json({ error: "Gen Ed courses could not be loaded. Try again shortly." }, { status: 503 });
  }
}
