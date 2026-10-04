# Trend components

- `CourseTrends` loads seat observations and offering history for the chosen course, term and section list. Loading and error states are tied to the request key; previous-course data is hidden immediately.
- `SeatTrendChart` plots observations by their timestamps. Unknown counts are omitted by the collector. The chart labels the latest observation and does not extrapolate daily filling from a short group of page refreshes.
- `OfferingHistory` lists observed semesters, section counts and known capacity. Pattern labels describe observed data, not future guarantees.
- `PopularCourses` shows shared-plan aggregates and an optional sharing checkbox. It starts off; opting out withdraws the browser's counts for all terms. The list remounts for a new term or completed sharing update.
- `TakenCoursesEditor` accepts course codes and an optional credit count, stores them in this browser, and exposes a clear action. Credits also travel with the user's device-transfer link.

English and Chinese labels are supported. Component props and source paths are in `app/components/`; algorithms and validation are in `lib/`. Data scope and local verification commands are documented in `TRENDS_FEATURE.md` and `QUICK_START.md`.
