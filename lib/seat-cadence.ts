// How often watched sections are checked, as the site tells students (FAQ, About, the seat-watch step and the
// seat-email switch). It follows the seat-cron worker's schedule in workers/seat-cron/wrangler.jsonc ("*/2":
// every 2 minutes, each watch rechecked once 90 seconds have passed); change the two together
// (tests/seat-cron.test.mjs fails when they differ).
export const SEAT_CHECK_MINUTES = 2;

// After a seat email, a student's next one waits at least this long; the sections that open in between go out
// together in it, if they are still open then (lib/alerts.ts). The site and the emails say so.
export const ALERT_GAP_MINUTES = 10;
