<div align="center">

<h1>TerpPlan</h1>

<p><strong>Plan your semester. Make room for your life.</strong><br>
A free course planner for University of Maryland students.<br>
Find courses, build a schedule that fits, and get ready for registration.</p>

<p><a href="https://terpplan.com">Open TerpPlan</a> · <a href="https://terpplan.com/plan?demo=1">Try a sample plan</a> · <a href="#中文介绍">中文介绍</a></p>

<img src="public/og-image.png" alt="TerpPlan course-planning preview" width="900">

<p>English &amp; 中文 · No account needed to plan · Optional email sign-in</p>

</div>

## From course search to registration day

TerpPlan brings course search, schedule planning, degree requirements, and seat alerts into one place. Compare your options around the week you actually want: work shifts, clubs, later mornings, fewer campus days, or less walking between buildings.

It is an independent student tool, not an official UMD service. Final registration takes place in Testudo.

| Start here | What it helps with |
| --- | --- |
| [Course planner](https://terpplan.com/plan) | Find courses, compare sections, and build your weekly schedule. |
| [Degree audit](https://terpplan.com/audit) | Read a uAchieve PDF and find courses for unmet requirements. |
| [Minor & double-major explorer](https://terpplan.com/minor) | Estimate remaining requirements, prerequisites, and overlap. |
| [Hardest courses to get](https://terpplan.com/hard-courses) | See courses that remained nearly full in recent semesters and plan backups. |
| [My week](https://terpplan.com/week) | Keep a saved daily class list and building map links on your phone. |
| [Registration-day view](https://terpplan.com/register) | Open the course numbers, section numbers, and backups saved from your schedule. |

## What you can do

### Build a week that fits

- Search courses and Gen Ed categories; compare meeting times, reported seats, prerequisites, instructor ratings, and course-aware review excerpts from PlanetTerp.
- Generate up to three schedule options that avoid known time conflicts. Compare campus days, gaps, first classes, instructor ratings, and estimated walking time.
- Set preferred hours, avoid days, require or exclude sections, filter instructors, and optionally use only sections with open seats.
- Add weekly commitments such as work, lunch, or club meetings, and choose a minimum gap between classes. Lectures, discussions, and labs are checked together.
- Keep **Plan A and Plan B for each term**, with separate course lists and shared preferences.

Walking estimates use building locations and are approximate. They flag potentially rushed transitions and help rank options; the class buffer is a separate amount of time you choose. Missing courses and unknown meeting times are flagged for review.

### Fix conflicts and change sections

When a complete schedule cannot be found, see which course combinations, fixed sections, days, time limits, or commitments are blocking it. Suggested adjustments are backed by a schedule covering every course that would remain after the change. You decide which adjustment to apply.

Click a class in the timetable to compare compatible replacement sections, including their times, rooms, instructor ratings, seats, and effect on your week. Applying a replacement preserves the other selected section numbers and saves the new section as required in your plan.

### Connect your courses to your degree

Read a **uAchieve degree-audit PDF in your browser**. TerpPlan distinguishes completed courses, transfer-pass credits, and courses still in progress, then suggests courses for unmet requirements. Suggestions prioritize availability; historical average GPA is an optional comparison. The Gen Ed finder can identify courses covering multiple selected categories.

Explore a minor or double major using completed, in-progress, and planned courses. Compare remaining requirements, prerequisite paths, and possible overlap with your current major. Catalog requirements that cannot be represented as course rules are marked for your review.

### Prepare for demand and workload

Check recent offering history and courses that stayed nearly full to decide where you need backups or seat alerts. Historical seat counts describe observed availability; they do not predict whether you will get a place next term.

Review your credit total, daily class hours, and a rough semester workload estimate based on credits and historical course GPA. These are planning hints, not predictions of your grades or how much time you will need to study.

### Watch seats and act on an opening

Sign in to watch individual sections or a group of sections in a course. Seat changes appear while the planner is open; optional email alerts let you hear about openings when you are away. Opening links return to the planner, where available sections can be checked against your current saved schedule before you change it.

Background checks are triggered **every 10 minutes by Cloudflare Cron**, independently of GitHub Actions and whether your browser is open. A run checks up to 40 watched course groups; larger backlogs take additional rounds. Source data and email delivery can lag, and a seat may fill before you act. See the [scheduler deployment guide](workers/seat-cron/README.md) for configuration and verification details.

### Be ready when registration opens

Save a registration checklist with course and section numbers, backup choices, and boxes to tick as you register. Enter your registration date and time to see a countdown and export a calendar reminder. Keep the registration-day page beside Testudo; after it has loaded online, its saved list can be reopened offline.

Use **My week** for a daily class list with building map links. Save your chosen schedule, open it online once, and add it to your phone's home screen for offline access. Fresh seats, course searches, and online maps still need a connection.

### Share, export, or continue on another device

- Share a read-only schedule link; meeting times and seats are refreshed when someone opens it. Shared schedules flag courses that could not be placed.
- Export class meetings to Apple Calendar, Google Calendar, or Outlook as an `.ics` file, or print your timetable. Calendar exports use UMD's academic calendar and Eastern time; final exams and meetings without usable times are excluded.
- Sign in with email to sync plans, preferences, courses taken, and registration times across devices. If both copies changed, choose which to keep.
- Use a device-transfer link to move your plans without signing in. It includes plan preferences and courses taken, so share it only with someone you want to see that information.

## Privacy and data

| Information | How TerpPlan handles it |
| --- | --- |
| Degree-audit PDF and extracted text | Read in your browser; neither is uploaded or saved by TerpPlan. Selected course codes or Gen Ed categories may be sent for course lookups. |
| Minor / double-major progress | Calculated in your browser from the catalog snapshot. Optional planner account sync is separate. |
| Plans and preferences | Saved in this browser. Email sign-in enables account sync, including personal commitments **and their names**, course codes taken, and registration times. Synced data is stored under a hashed account ID; you can delete the account copy while signed in. |
| Scheduling requests | Send course codes, section/instructor filters, preferences, and unnamed commitment identifiers and time intervals to the server. Personal event names are excluded from these requests. |
| Email address | Used for sign-in codes; saved for seat emails only when you turn them on. Alerts can be disabled in the planner or through an alert email. |
| Schedule sharing and calendar export | Personal commitments, email, and seat watches are excluded. Anyone with a shared schedule link can view it. |
| Device-transfer links | Include plans, preferences, and courses taken, with personal event names removed. Anyone with the link can read the included information. |

The sample plan does not sync to your account. Clearing this browser and deleting a synced account copy are separate actions; another signed-in device can upload its copy again.

Course and seat information comes from UMD/Testudo and UMD.io; instructor ratings, reviews, and historical grades come from PlanetTerp. Confirm current availability, prerequisites, permissions, meeting times, and degree requirements with [UMD's Schedule of Classes](https://app.testudo.umd.edu/soc/) and your advisor. Planning estimates do not guarantee registration or degree completion.

## 中文介绍

**TerpPlan 是面向马里兰大学学生的免费选课与学期规划工具。** 从找课、排课、核对毕业要求，到准备班号和备选清单，帮你把课程安排进真实的一周。支持中英文；排课无需账号，邮箱登录后可跨设备同步。

- **找课与排课**：搜索课程和 Gen Ed 类别，比较班次、教师评价与余位，生成最多三个避开已知时间冲突的方案。支持指定／排除班次、筛选教师、避开某些日期和设置时间偏好。
- **个人日程与校园步行**：为打工、社团、午饭等固定日程留时间，设置课间最小间隔；查看楼宇间的粗略步行估算和赶课提示，也可优先选择少跑校园的方案。步行估算与自定缓冲是两项不同功能。
- **冲突解法与直接换班**：解释哪些限制挡住了完整课表，为建议调整找到覆盖剩余课程的方案；在课表中比较兼容班次，只替换所选课程，保留其他已选班号。
- **Plan A／B**：每个学期保留两套课程计划，随时切换或复制，提前准备备选方案。
- **学位、辅修与双专业**：在浏览器中读取 uAchieve 审计，区分已修、转学分和在修课程；按余位优先推荐课程，估算辅修／双专业的剩余要求、先修路径与可能重叠。未能自动判断的目录要求需自行核对。
- **选课难度与学期负担**：参考近期仍接近满员的课程、开课历史、学分和每日上课时长；历史 GPA 只用于粗略负担提示，不代表你的成绩或学习时长。
- **余位与邮件提醒**：登录后关注单个班次或一组班次，选择是否开启邮件。后台由 Cloudflare Cron 每 10 分钟触发一次，每轮最多检查 40 个关注课程组；积压、源数据和邮件延迟都可能使实际提醒更晚。收到开位链接后，可在排课器里核对是否适合当前课表。
- **选课当天与离线查看**：保存课程号、班号、备选和勾选清单，设置选课倒计时与日历提醒。“My week”和已加载的选课清单可离线打开；新余位与在线地图仍需联网。
- **分享、导出与同步**：分享只读课表，导出 `.ics` 或打印；邮箱登录后同步计划，也可用迁移链接继续在另一台设备上规划。

**隐私边界：** 学位审计 PDF 和提取文本不会上传或保存。计划默认保存在浏览器；登录同步时，个人日程及其名称、已修课程代码和选课时间也会保存到账号。排课请求不发送日程名称，课表分享与课程日历不包含个人日程。设备迁移链接包含计划、偏好及已修课程，请谨慎分享；迁移时会去掉个人日程名称。

TerpPlan 是独立学生工具。正式选课在 Testudo 完成；余位、先修、许可和毕业要求请以 UMD 官方信息及 advisor 确认为准。

[开始规划](https://terpplan.com/plan) · [试用示例](https://terpplan.com/plan?demo=1) · [学位审计](https://terpplan.com/audit) · [辅修与双专业](https://terpplan.com/minor) · [最难抢的课](https://terpplan.com/hard-courses)

## Development

The web app uses TypeScript, React, Vinext, Tailwind CSS, Cloudflare Workers, and D1 with Drizzle ORM. Degree-audit PDFs are parsed on the client with PDF.js. A separate Worker in [`workers/seat-cron`](workers/seat-cron) provides the background seat-check schedule.

Requires **Node.js 22.13 or newer**.

```bash
npm install
npm run dev
```

Run the checks locally:

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

The live app is published through GPT Sites. Pushing this repository does not deploy a Site version or the Cron Worker. This repository has no GitHub Actions workflows; local validation commands remain available, and background seat checks run on Cloudflare Cron.

## Feedback

Found a wrong time, room, map link, or requirement? Use the report links in the app, [open a GitHub issue](https://github.com/Jul11us/terpplan-student-pilot/issues), or email [terpplan@proton.me](mailto:terpplan@proton.me).

## Acknowledgment

Thanks to the creator of [umd-course-recommender](https://github.com/wonder4hth/umd-course-recommender) for permission to use its degree-audit workflow as an early reference.
