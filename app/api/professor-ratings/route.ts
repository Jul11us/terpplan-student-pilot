import { getProfessorSummaries } from "@/lib/planetterp";

export async function POST(request: Request) {
  let body: { names?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Provide instructor names." }, { status: 400 });
  }
  if (!Array.isArray(body.names) || body.names.length > 200 || body.names.some((name) => typeof name !== "string" || name.length > 120)) {
    return Response.json({ error: "Provide a valid instructor list." }, { status: 400 });
  }
  const ratings = await getProfessorSummaries(body.names as string[]);
  return Response.json({ ratings }, { headers: { "cache-control": "private, max-age=300" } });
}
