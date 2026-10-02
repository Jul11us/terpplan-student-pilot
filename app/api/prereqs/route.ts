import spring2027Catalog from "@/data/202701-catalog.json";
import type { CatalogItem } from "@/lib/umd";
import { courseIdIsValid } from "@/lib/umd";

const rules = new Map((spring2027Catalog as CatalogItem[]).map((course) => [course.course_id, course.pr ?? null]));

// Prerequisite rules for the planner. Only the bundled Spring 2027 catalog has them; for other terms the
// answer is empty and the page does not check.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const term = url.searchParams.get("term") ?? "";
  const ids = [...new Set((url.searchParams.get("ids") ?? "").split(",").map((id) => id.trim().toUpperCase()).filter(Boolean))];
  if (!/^\d{6}$/.test(term)) return Response.json({ error: "Choose a valid term." }, { status: 400 });
  if (!ids.length || ids.length > 40 || ids.some((id) => !courseIdIsValid(id))) return Response.json({ error: "Choose between 1 and 40 valid course codes." }, { status: 400 });
  if (term !== "202701") return Response.json({ term, rules: {} }, { headers: { "Cache-Control": "public, max-age=3600" } });
  return Response.json({ term, rules: Object.fromEntries(ids.map((id) => [id, rules.get(id) ?? null])) }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
