declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    EMAIL_AUTH_SECRET?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    WATCH_RUNNER_SECRET?: string;
    // Emergency pause, checked before touching D1.
    WATCH_RUNNER_ENABLED?: string;
    // Comma-separated emails that may open /admin.
    ADMIN_EMAILS?: string;
  }
}
