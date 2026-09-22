import { availableTerms, DEFAULT_TERM } from "@/lib/umd";

export async function GET() {
  try {
    // Students only plan for current and recent terms; the full umd.io history goes back years.
    const terms = (await availableTerms()).slice(0, 6);
    return Response.json({ terms, defaultTerm: terms[0] ?? DEFAULT_TERM });
  } catch {
    return Response.json({ error: "Could not load the current term list from umd.io." }, { status: 503 });
  }
}
