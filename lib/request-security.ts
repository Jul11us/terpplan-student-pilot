// Browser mutations must come from this origin. Mail-client one-click unsubscribe
// uses its own bearer token and deliberately does not use this guard.
export function sameOriginMutation(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  const expected = new URL(request.url).origin;
  if (site === "cross-site" || (origin !== null && origin !== expected)) {
    return Response.json({ error: "Use TerpPlan to make this request." }, { status: 403 });
  }
  // Older browser requests may provide Referer instead of Origin. Non-browser
  // clients without either header still need authentication on private routes.
  const referer = request.headers.get("referer");
  if (!origin && referer) {
    try { if (new URL(referer).origin === expected) return null; } catch { /* Reject malformed references. */ }
    return Response.json({ error: "Use TerpPlan to make this request." }, { status: 403 });
  }
  if (!origin && site === "same-site") return Response.json({ error: "Use TerpPlan to make this request." }, { status: 403 });
  return null;
}

export type JsonObjectResult = { value: Record<string, unknown>; error?: never } | { value?: never; error: Response };

export async function readJsonObject(request: Request, maxBytes = 4096): Promise<JsonObjectResult> {
  const failure = (error: string, status: number): JsonObjectResult => ({ error: Response.json({ error }, { status }) });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return failure("Send an application/json request.", 415);
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    return failure("Request is too large.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) return failure("Send a JSON object.", 400);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return failure("Request is too large.", 413);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return failure("Send a JSON object.", 400);
    return { value: value as Record<string, unknown> };
  } catch {
    await reader.cancel().catch(() => undefined);
    return failure("Send a JSON object.", 400);
  } finally {
    reader.releaseLock();
  }
}
