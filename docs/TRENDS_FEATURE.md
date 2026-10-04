# Historical trends and credit standing

This update adds local credit-standing checks, observed seat history, observed offerings, and voluntary shared-plan popularity.

- `/api/course` stores real UMD observations in D1. Unknown seats are omitted; repeated reads produce at most one seat snapshot per section per half hour.
- `/api/trends/seats?term=202701&sections=CMSC131-0101` reads the last 14 days. A chart needs three observations. Filling estimates also need at least one day between first and last observations.
- `/api/trends/offerings?id=CMSC131&lang=en` lists only semesters actually observed. It cannot guarantee future offerings or reconstruct earlier years without observing their course data.
- `/api/trends/popular?term=202701&limit=20` aggregates voluntary shared plans. Sharing is off initially. The checkbox sends course codes, term and a random browser ID; turning it off withdraws this browser's counts across semesters. Counts represent browsers, not verified students or enrollment. The shared-plan index is relative to the largest active count in the returned list.
- `/api/trends/activity` accepts bounded, validated shared-plan updates. No email, event names, grades or degree-audit text are included.
- Credits completed by next term can be entered manually or imported from parsed audit course rows. Passing and in-progress rows are deduplicated; already-earned retakes do not add another set of credits.

The tables are `seat_history`, `course_offerings`, and `plan_activity` in `db/schema.ts`. Production migration files live in `drizzle/`; Sites applies the packaged migrations at publication. `db/migrations/001_add_trend_tables.sql` is an optional reference, not the production migration source.

Historical data begins with observations after this feature is enabled. An empty history is expected initially. No automatic whole-campus collector or cron job is installed by this change.

For a real collection run while a site is running:

```powershell
node scripts/collect-seat-data.mjs 202701 https://terpplan.com CMSC131 MATH140
```

For isolated local migration and runtime testing, see `docs/QUICK_START.md`. Tests execute real route handlers and SQL against SQLite through the D1 interface, as well as the trend calculations.
