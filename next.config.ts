import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Strict-Transport-Security", value: "max-age=31536000" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      // Keep the supported Sites preview while preventing arbitrary sites
      // from framing the signed-in planner. React currently needs inline scripts.
      { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com https://*.openai.com" },
    ];
    return [
      // Vinext's wildcard matcher does not cover the empty root path.
      ...["/", "/:path*"].map((source) => ({ source, headers })),
      ...["/api/auth/:path*", "/api/watches/:path*", "/api/alerts/:path*", "/api/admin/:path*", "/admin"].map((source) => ({ source, headers: [{ key: "Cache-Control", value: "private, no-store" }] })),
      { source: "/unsubscribe", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
};

export default nextConfig;
