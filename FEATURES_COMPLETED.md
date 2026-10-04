# New feature implementation

- Credit-standing entry and checks, with browser-local credit totals and device-transfer support.
- Timetable layout improvements for short classes and enlarged text.
- Seat-history chart from recorded UMD observations, with guarded filling estimates.
- Course offerings observed by TerpPlan, with explicit limits on future inference.
- Popularity from optional anonymous shared plans, including withdrawal of counts.
- Production D1 migrations in `drizzle/`, and isolated local migration/collection helpers.
- Real route/SQL tests for invalid requests, seat recording, deduplication, offerings and shared-plan changes.

Historical data accumulates after deployment; initial empty results do not imply that a course has no earlier offerings. This change does not install a scheduled campus-wide collector. Details: `docs/TRENDS_FEATURE.md` and `docs/QUICK_START.md`.
