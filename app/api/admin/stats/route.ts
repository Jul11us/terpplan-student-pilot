import { adminAccess, adminStats } from "@/lib/admin";
import { authRequired, currentUser } from "@/lib/auth";

// Seat-alert sign-up numbers for the site owner (see lib/admin.ts). Never cached.
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return authRequired();
  const access = await adminAccess(user);
  if (access === "notConfigured") return Response.json({ error: "Admin access is not set up.", code: "notConfigured" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  if (access === "forbidden") return Response.json({ error: "This account cannot view these numbers.", code: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  try {
    return Response.json(await adminStats(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "The numbers could not be loaded. Try again shortly." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
