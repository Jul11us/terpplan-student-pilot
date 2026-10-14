// How often watched sections are checked, as the site tells students (FAQ, About, the seat-watch step and the
// seat-email switch). It follows the seat-cron worker's schedule in workers/seat-cron/wrangler.jsonc ("*/2":
// every 2 minutes, each watch rechecked once 90 seconds have passed); change the two together
// (tests/seat-cron.test.mjs fails when they differ).
export const SEAT_CHECK_MINUTES = 2;
