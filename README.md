# TerpPlan Student Pilot · GPT Sites edition

This is a separate Cloudflare Worker edition for the first student trial. The original Python/FastAPI + Streamlit project and its local databases remain in the parent folder.

## Pilot scope

- Search UMD courses and view term sections, meeting times, instructors, and the seat counts reported by umd.io.
- Add one section per course to a temporary schedule and flag overlapping meetings. A TBA meeting is shown as an incomplete conflict check.
- Save seat watches in the Site's D1 database, scoped to the authenticated ChatGPT user. While the watch page is open, the browser checks at most once per minute and shows newly opened seats in the page.

The pilot does not copy local student profiles or databases, and does not send email, text, or background notifications. UMD seat counts can lag the official Schedule of Classes. Sites access remains owner-private until the owner changes it.
