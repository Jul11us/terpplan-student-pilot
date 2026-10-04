"use client";

import { usePathname } from "next/navigation";
import { CLOUDFLARE_ANALYTICS_TOKEN, analyticsEnabled } from "@/lib/site-config";

export default function Analytics() {
  const path = usePathname();
  // An unsubscribe URL contains a bearer token. Never load third-party analytics
  // on that page, including its initial server render.
  if (!analyticsEnabled || path === "/unsubscribe") return null;
  return <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon={JSON.stringify({ token: CLOUDFLARE_ANALYTICS_TOKEN })} />;
}
