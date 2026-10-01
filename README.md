<div align="center">

<h1>TerpPlan</h1>

<p><strong>Plan your next semester at UMD.</strong><br>
Find courses, build conflict-free schedules, explore degree options, and watch for open seats.</p>

<p><a href="https://terpplan.com">Open TerpPlan</a> · <a href="https://terpplan.com/audit">Degree audit</a> · <a href="https://terpplan.com/minor">Minor &amp; double-major explorer</a> · <a href="#中文介绍">中文</a></p>

<img src="public/og-image.png" alt="TerpPlan course-planning preview" width="900">

</div>

## What you can do

### Find courses and plan your week

Search UMD courses and compare sections by meeting time, instructor, and reported seat availability. Build up to three schedule options that avoid known time conflicts, then compare them in a weekly timetable. Missing courses and unknown meeting times are flagged for review. Instructor ratings and course-aware review excerpts link back to PlanetTerp.

Reserve weekly commitments such as work or lunch, and choose a minimum buffer between class meetings. Both schedule generation and section changes check those constraints. The buffer is a time allowance you choose, not an estimate of walking time.

If a complete schedule cannot be found, TerpPlan identifies blocking preferences or course combinations and offers changes only after finding a schedule for every remaining course. You can also click a class to compare compatible replacement sections, review changes in meeting time, instructor, seats and weekly gaps, then replace that course while keeping the other section numbers. The replacement is saved as a required section. Unknown meeting times still need confirmation.

### See how courses fit your degree

Review a uAchieve degree audit, find courses for unmet requirements, or explore how completed, in-progress, and planned courses may count toward a minor or double major. The program explorer estimates remaining courses, prerequisite paths, and possible overlap with your current major. Requirements written only as catalog prose need to be checked by the student, so treat results as planning estimates.

The audit reader distinguishes completed courses, transfer-pass credits, and courses still in progress. Course suggestions prioritize available sections and open seats; historical average GPA is an optional comparison. A Gen Ed finder also helps identify courses that cover multiple selected categories.

### Keep an eye on open seats

Save section watches and check for openings while the page is open. Students can also opt in to email alerts; background checks are scheduled every 10 minutes and may run later. Seat counts may lag behind UMD, and an opening may fill before you see an alert.

### Share a schedule or export your calendar

Create a read-only link to a schedule. It includes the term, section numbers, language, and any planned courses that could not be placed, so others can see whether the schedule is complete and view current meeting and seat information. It does not include your email or seat watches. Export class meetings as an iCalendar (`.ics`) file using UMD's academic calendar and Eastern time.

## Privacy and data

- Degree-audit PDFs are read in your browser. The PDF and extracted audit text are not uploaded or saved by TerpPlan.
- Course lookups send selected course codes or Gen Ed categories, not your PDF, extracted audit text, or complete course history.
- Minor and double-major progress is calculated in your browser from the catalog snapshot; your completed, in-progress, and planned course lists are not uploaded.
- Your plan and schedule preferences stay in this browser.
- Personal event names stay in this browser. Scheduling requests send selected courses, section/instructor filters, preferences and anonymous commitment times to TerpPlan's server. Personal commitments are excluded from shared schedules and calendar exports.
- Email is used for sign-in codes. Your address is stored for seat alerts only if you turn that feature on.
- Shared schedule links can be viewed by anyone who has the link.
- Seat availability is informational. Confirm current openings in [UMD's Schedule of Classes](https://app.testudo.umd.edu/soc/).

## 中文介绍

TerpPlan 是面向马里兰大学学生的选课与排课工具。你可以搜索课程、比较不冲突的课表、查看学位审计，也可以估算辅修或双专业还差哪些课程，并关注班级余位。

- **选课与排课**：比较班次、教师评价和余位，生成最多三个避开已知时间冲突的方案；缺课与未知上课时间会单独提示。
- **排课解法与直接换班**：查看阻碍完整排课的限制，应用经过排课验证的调整；在课表中比较兼容的备选班次，只替换所选课程，并保存为指定班次。
- **个人日程与课间缓冲**：为打工、社团、午饭等预留每周时段，并设置课间最少间隔。日程名称只存于浏览器，排课请求仅发送匿名时段；个人日程不包含在分享链接和日历导出中。缓冲是自定预留时间，不是步行时间估算。
- **学位与专业规划**：读取 uAchieve 审计，区分已修、转学分和在修课程，按余位优先推荐课程；估算辅修／双专业的剩余要求、先修路径与可能重叠。
- **Gen Ed 与余位提醒**：查找能同时满足多个通识类别的课程，关注班次，并选择是否开启邮件提醒。
- **分享与日历**：分享只读课表链接，或导出 `.ics` 文件到日历应用。

学位审计 PDF 只在浏览器里读取，不会上传或保存。余位数据可能有延迟，选课前请以 [UMD 官方课表](https://app.testudo.umd.edu/soc/) 为准。

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
