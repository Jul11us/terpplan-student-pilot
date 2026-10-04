import { clearEmailSessionCookie } from "@/lib/auth";
import { sameOriginMutation } from "@/lib/request-security";

export async function POST(request: Request) {
  const denied = sameOriginMutation(request);
  if (denied) return denied;
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearEmailSessionCookie() } });
}
