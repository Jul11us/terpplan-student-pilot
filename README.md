<div align="center">

<h1>TerpPlan</h1>

<p><strong>A free course planner for UMD students.</strong><br>
Find courses, build your weekly schedule, resolve conflicts, and compare replacement sections.<br>
Make room for your commitments, explore degree options, and watch for open seats.</p>

<p><a href="https://terpplan.com">Open TerpPlan</a> · <a href="https://terpplan.com/audit">Degree audit</a> · <a href="https://terpplan.com/minor">Minor &amp; double-major explorer</a> · <a href="#中文介绍">中文</a></p>

<img src="public/og-image.png" alt="TerpPlan course-planning preview" width="900">

</div>

## What you can do

### Find courses and build schedule options

Search UMD courses and compare sections by meeting time, instructor, and reported seat availability. Build up to three schedule options that avoid known time conflicts, then compare them in a weekly timetable. Missing courses and unknown meeting times are flagged for review. Instructor ratings and course-aware review excerpts link back to PlanetTerp.

### Resolve conflicts with verified changes

When a complete schedule cannot be found, see which preferences or course combinations are blocking it, including overlapping sections and insufficient class buffers. TerpPlan can suggest allowing a day, relaxing a time limit, removing a commitment, changing a required section, or removing a course from the plan. Each suggested change has a schedule covering every course that would remain after the adjustment. Your plan changes only when you apply it; sections with unknown meeting times still need confirmation.

### Change one section while keeping the others

Click a class in the timetable or use **Change section** to compare compatible alternatives. Review meeting times and rooms before and after the change, instructor ratings, reported seats, weekly gaps, and campus days. Alternatives respect your section and instructor filters, personal commitments, and class buffer.

Apply a replacement to update that course while preserving the other selected section numbers. The new section is saved as a required section in your TerpPlan plan. Registration takes place separately in Testudo.

### Reserve personal time and leave room between classes

Add weekly commitments such as work, a club meeting, or lunch; edit their days and times and see them beside classes in the timetable. Choose a minimum buffer between class meetings. Schedule generation and section changes both check these constraints, including lecture, discussion, and lab meetings.

Commitments and the buffer are remembered in this browser (and in the account of a signed-in student, see below). Scheduling uses their unnamed time intervals. Personal commitments are excluded from shared schedules and calendar exports. The buffer reserves the amount of time you choose; it does not estimate walking time between buildings.

### See how courses fit your degree

Review a uAchieve degree audit, find courses for unmet requirements, or explore how completed, in-progress, and planned courses may count toward a minor or double major. The program explorer estimates remaining courses, prerequisite paths, and possible overlap with your current major. Requirements written only as catalog prose need to be checked by the student, so treat results as planning estimates.

The audit reader distinguishes completed courses, transfer-pass credits, and courses still in progress. Course suggestions prioritize available sections and open seats; historical average GPA is an optional comparison. A Gen Ed finder also helps identify courses that cover multiple selected categories.

### Keep an eye on open seats

Save section watches and check for openings while the page is open. Students can also opt in to email alerts; background checks are scheduled every 10 minutes by a separate Cloudflare Cron Worker. Each run checks up to 40 course groups, so larger backlogs take additional runs. Seat counts may lag behind UMD, and an opening may fill before you see an alert. Scheduler deployment and verification are documented in [workers/seat-cron/README.md](workers/seat-cron/README.md).

### Share a schedule or export your calendar

Create a read-only link to a schedule. It includes the term, section numbers, language, and any planned courses that could not be placed, so others can see whether the schedule is complete and view current meeting and seat information. It does not include your email or seat watches. Export class meetings as an iCalendar (`.ics`) file using UMD's academic calendar and Eastern time.

## Privacy and data

- Degree-audit PDFs are read in your browser. The PDF and extracted audit text are not uploaded or saved by TerpPlan.
- Course lookups send selected course codes or Gen Ed categories, not your PDF, extracted audit text, or complete course history.
- Minor and double-major progress is calculated in your browser from the catalog snapshot; your completed, in-progress, and planned course lists are not uploaded.
- Your plan and preferences are saved in this browser. When you sign in with your email, they are also kept in your account (`plan_sync`, under a hashed account ID): plans, preferences including personal commitments and their names, courses taken and registration times, so they open on any device you sign in on. The newer copy wins; when this device and the account both changed, you choose which to keep. You can delete the account copy while signed in. The sample plan (`?demo=1`) never syncs.
- Scheduling requests send selected course codes, section/instructor filters, preferences, and commitment identifiers and time intervals to TerpPlan's server. Personal event names are not sent with scheduling requests.
- Personal commitments are excluded from shared schedules and calendar exports.
- Email is used for sign-in codes. Your address is stored for seat alerts only if you turn that feature on.
- Shared schedule links can be viewed by anyone who has the link.
- Seat availability is informational. Confirm current openings in [UMD's Schedule of Classes](https://app.testudo.umd.edu/soc/).

## 中文介绍

TerpPlan 是面向马里兰大学学生的免费选课与排课工具。你可以搜索课程、比较课表、查看排课冲突的解法、直接替换兼容班次，也可以为个人日程预留时间，查看学位审计、探索辅修或双专业，并关注班级余位。

- **选课与排课**：比较班次、教师评价和余位，生成最多三个避开已知时间冲突的方案；缺课与未知上课时间会单独提示。
- **排课冲突与解法**：查看被哪些日期、时间限制、固定日程或课程冲突挡住；每个建议调整都先找到覆盖调整后全部剩余课程的方案，点击后才会修改计划。时间待定的班次仍需自行确认。
- **在课表里直接换班**：比较兼容班次的上课时间、教室、教师评分、余位和整周空档，只替换所选课程，保留其他已选班号；新班次会保存为指定班次，正式注册仍在 Testudo 中完成。
- **个人日程与课间缓冲**：添加、编辑每周重复的打工、社团、午饭等日程，在课表中查看，并设置上课之间的最少间隔。排课和换班都会检查这些限制，刷新后仍会保留。缓冲是自定预留时间，不是步行时间估算。
- **学位与专业规划**：读取 uAchieve 审计，区分已修、转学分和在修课程，按余位优先推荐课程；估算辅修／双专业的剩余要求、先修路径与可能重叠。
- **Gen Ed 与余位提醒**：查找能同时满足多个通识类别的课程，关注班次，并选择是否开启邮件提醒。
- **分享与日历**：分享只读课表链接，或导出 `.ics` 文件到日历应用。

学位审计 PDF 只在浏览器里读取，不会上传或保存。个人日程名称只存于浏览器；排课请求会发送所选课程、班次／教师筛选、偏好，以及不含日程名称的标识和时段。个人日程不包含在分享链接或日历导出中。余位数据可能有延迟，选课前请以 [UMD 官方课表](https://app.testudo.umd.edu/soc/) 为准。

[打开 TerpPlan](https://terpplan.com) · [学位审计](https://terpplan.com/audit) · [辅修与双专业评估](https://terpplan.com/minor)

## Development

This repository contains the public GPT Sites edition, built with Vinext and deployed as a Cloudflare Worker. The local Python/FastAPI + Streamlit app and its databases remain in the parent folder.

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Useful checks:

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Publishing the GitHub branch alone does not deploy the live Site; publishing also saves and deploys a Site version.

## Acknowledgment

Thanks to the creator of [umd-course-recommender](https://github.com/wonder4hth/umd-course-recommender) for permission to use its degree-audit workflow as an early reference.
