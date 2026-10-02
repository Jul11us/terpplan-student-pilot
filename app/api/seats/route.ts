import { seatSummaries } from "@/lib/seat-summary";
import { courseIdIsValid } from "@/lib/umd";

// Open-seat summaries for the courses on one page of search results.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const term = url.searchParams.get("term") ?? "";
  const ids = [...new Set((url.searchParams.get("ids") ?? "").split(",").map((id) => id.trim().toUpperCase()).filter(Boolean))];
  if (!/^\d{6}$/.test(term)) return Response.json({ error: "Choose a valid term." }, { status: 400 });
  if (!ids.length || ids.length > 40 || ids.some((id) => !courseIdIsValid(id))) return Response.json({ error: "Choose between 1 and 40 valid course codes." }, { status: 400 });
  try {
    return Response.json({ term, seats: await seatSummaries(term, ids), checkedAt: new Date().toISOString() });
  } catch {
    return Response.json({ error: "Seat counts could not be loaded. Try again shortly." }, { status: 503 });
  }
}
