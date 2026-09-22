import { availableTerms, DEFAULT_TERM } from "@/lib/umd";

export async function GET() {
  try {
    const terms = await availableTerms();
    return Response.json({ terms, defaultTerm: terms[0] ?? DEFAULT_TERM });
  } catch {
    return Response.json({ error: "Could not load the current term list from umd.io." }, { status: 503 });
  }
}
