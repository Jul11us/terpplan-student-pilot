export function currentUserId(request: Request): string | null {
  const value = request.headers.get("oai-authenticated-user-id")?.trim();
  return value ? value.slice(0, 200) : null;
}

export function authRequired() {
  return Response.json(
    { error: "Sign in with your ChatGPT account to save a seat watch." },
    { status: 401 },
  );
}
