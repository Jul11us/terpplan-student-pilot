# TerpPlan Student Pilot · GPT Sites edition

This is a separate Cloudflare Worker edition for the first student trial. The original Python/FastAPI + Streamlit project and its local databases remain in the parent folder.

## Pilot scope

- Search UMD courses and view term sections, meeting times, instructors, and the seat counts reported by umd.io. Instructor averages and on-demand, course-aware review excerpts come from PlanetTerp and link back to the source; unverified name matches are not shown as ratings.
- Add courses to a planner that ranks up to three conflict-free section combinations using instructor ratings, early starts, gaps, and optional time/day preferences. Compare options and view the selected option in a weekly timetable. TBA or incomplete meeting data is flagged for confirmation.
- Save seat watches in the Site's D1 database, scoped either to the authenticated ChatGPT user or a verified email address. While the watch page is open, the browser checks at most once per minute and shows newly opened seats in the page.
- Email-code sign-in uses Resend. Before enabling it in production, configure `RESEND_API_KEY`, `EMAIL_FROM` (a verified sender), and a random `EMAIL_AUTH_SECRET` in Sites runtime secrets. The email address is sent to Resend to deliver sign-in codes; the app stores an HMAC hash for account scoping rather than the raw address. Codes expire after 10 minutes and are rate-limited.

The pilot does not copy local student profiles or databases, and does not send seat-alert email, text, or background notifications. Email is used only for sign-in codes. UMD seat counts can lag the official Schedule of Classes. The published Site is public; the original Python/FastAPI + Streamlit project remains in the parent folder.
