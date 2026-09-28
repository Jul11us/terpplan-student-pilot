<div align="center">

<h1>TerpPlan</h1>

<p><strong>Plan your next semester at UMD.</strong><br>
Find courses, build conflict-free schedules, explore degree options, and watch for open seats.</p>

<p><a href="https://terpplan.com">Open TerpPlan</a> · <a href="https://terpplan.com/audit">Degree audit</a> · <a href="https://terpplan.com/minor">Minor &amp; double-major explorer</a> · <a href="#中文介绍">中文</a></p>

<img src="public/og-image.png" alt="TerpPlan course-planning preview" width="900">

</div>

## What you can do

### Find courses and plan your week

Search UMD courses and compare sections by meeting time, instructor, and reported seat availability. Build up to three conflict-free schedule options, then compare them in a weekly timetable. Instructor ratings and course-aware review excerpts link back to PlanetTerp.

### See how courses fit your degree

Review a uAchieve degree audit, find courses for unmet requirements, or explore how completed, in-progress, and planned courses may count toward a minor or double major. The program explorer estimates remaining courses, prerequisite paths, and possible overlap with your current major. Requirements written only as catalog prose need to be checked by the student, so treat results as planning estimates.

### Keep an eye on open seats

Save section watches and check for openings while the page is open. Students can also opt in to email alerts; background checks run about every 10 minutes. Seat counts may lag behind UMD, and an opening may fill before you see an alert.

### Share a schedule

Create a read-only link to a schedule. It includes the term and section numbers so others can view current meeting and seat information; it does not include your email or seat watches.

## Privacy and data

- Degree-audit PDFs are read in your browser. The PDF and extracted audit text are not uploaded or saved by TerpPlan.
- Only the course codes or Gen Ed category you choose are sent to lookup APIs.
- Your plan and schedule preferences stay in this browser.
- Email is used for sign-in codes. Your address is stored for seat alerts only if you turn that feature on.
- Shared schedule links can be viewed by anyone who has the link.
- Seat availability is informational. Confirm current openings in [UMD's Schedule of Classes](https://app.testudo.umd.edu/soc/).

## 中文介绍

TerpPlan 是面向马里兰大学学生的选课与排课工具。你可以搜索课程、比较不冲突的课表、查看学位审计，也可以估算辅修或双专业还差哪些课程，并关注班级余位。

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
npm run build
```

Publishing the GitHub branch alone does not deploy the live Site; publishing also saves and deploys a Site version.

## Acknowledgment

The degree-audit workflow was informed by [umd-course-recommender](https://github.com/wonder4hth/umd-course-recommender) and developed with permission from its creator.
