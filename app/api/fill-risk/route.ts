import { getFillRisks } from "@/lib/history-db";
import { courseIdIsValid } from "@/lib/umd";

// How fast each course filled in earlier terms, for the planner's "register this one first" notes. One
// request covers the whole plan, so opening the planner costs one database read, not one per course.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const term = url.searchParams.get("term") ?? "";
  const courses = [...new Set((url.searchParams.get("courses") ?? "").split(",").map((id) => id.trim().toUpperCase()).filter(Boolean))];

  if (!/^\d{6}$/.test(term)) {
    return Response.json({ error: "Choose a valid term." }, { status: 400 });
  }

  if (!courses.length || courses.length > 12 || courses.some((id) => !courseIdIsValid(id))) {
    return Response.json({ error: "Provide between 1 and 12 valid course codes." }, { status: 400 });
  }

  try {
    const risks = await getFillRisks(term, courses);
    return Response.json({ term, risk: Object.fromEntries([...risks]) });
  } catch (error) {
    console.error("Fill risk error:", error);
    return Response.json({ error: "Fill risk could not be loaded. Try again shortly." }, { status: 503 });
  }
}
