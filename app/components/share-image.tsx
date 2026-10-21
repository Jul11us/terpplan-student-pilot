"use client";

// A picture of the chosen schedule to post (Instagram post or Story), drawn on a canvas in this browser: the week,
// the TerpPlan mark and a QR code of the share link. Nothing is uploaded; personal commitments stay out unless
// turned on, and then show only as "busy".

import { useEffect, useState } from "react";
import qrcode from "qrcode-generator";
import { IMAGE_SIZES, imageModel, type ImageFormat, type ImageModel } from "@/lib/share-image";
import type { MeetingTime } from "@/lib/meeting-time";
import type { BusyBlock } from "@/lib/personal-schedule";
import { formatTermName } from "@/lib/seat-trends";
import { countUse } from "@/lib/usage";

type Language = "en" | "zh";

const copy = {
  en: {
    button: "Share as image", post: "Post (4:5)", story: "Story (9:16)", busy: "Show my personal commitments (as “Busy”, without names)",
    download: "Download image", share: "Share…", making: "Drawing…", failed: "The image could not be drawn in this browser.",
    note: "Drawn in this browser; nothing is uploaded. The QR code opens the same link as “Copy share link”.",
    title: "My {term} schedule", courses: "{n} courses", course: "1 course", credits: "{n} credits",
    online: "Online or time to be announced: {list}", busyBlock: "Busy",
    scan: "Scan to see this schedule", scanMore: "Friends who saved their own week on TerpPlan can compare the gaps in both timetables.",
    days: { Mon: "Mon", Tue: "Tue", Wed: "Wed", Thu: "Thu", Fri: "Fri", Sat: "Sat", Sun: "Sun" } as Record<string, string>,
  },
  zh: {
    button: "生成分享图片", post: "普通（4:5）", story: "Story 竖版（9:16）", busy: "显示我的个人日程（只显示“忙”，不显示名称）",
    download: "下载图片", share: "分享…", making: "正在生成…", failed: "这个浏览器无法生成图片。",
    note: "图片在你的浏览器里生成，不会上传。二维码和“复制分享链接”是同一个链接。",
    title: "我的{term}课表", courses: "{n} 门课", course: "1 门课", credits: "{n} 学分",
    online: "线上或时间待定：{list}", busyBlock: "忙",
    scan: "扫码查看这份课表", scanMore: "在 TerpPlan 存了自己课表的同学，打开后还能对比两份课表的空档。",
    days: { Mon: "周一", Tue: "周二", Wed: "周三", Thu: "周四", Fri: "周五", Sat: "周六", Sun: "周日" } as Record<string, string>,
  },
} as const;

const SANS = `"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", Arial, Helvetica, sans-serif`;
const SERIF = `Georgia, "Songti SC", "Noto Serif CJK SC", "SimSun", serif`;
const INK = "#202728", MUTED = "#646c68", LINE = "#e3e0d8", BG = "#f5f3ef", BRAND = "#bd302f";
// A light fill and a strong edge per course, in the site's muted palette.
const FILLS = ["#dbe8e0", "#f3dfd6", "#e2e2f2", "#f4ead0", "#d9e9ee", "#ece0ec", "#e6ecd6", "#f0e2d0", "#dde4ea", "#efe6dd"];
const EDGES = ["#2f6b52", "#a34a39", "#4d4f9c", "#9a7420", "#2c6f86", "#86507f", "#5f7a2c", "#a2622c", "#486178", "#7d6450"];

const clock = (value: number, short = false) => {
  const hour = Math.floor(value / 60), minute = value % 60;
  return `${hour % 12 || 12}${short && !minute ? "" : ":" + String(minute).padStart(2, "0")}${short ? (hour < 12 ? "am" : "pm") : ""}`;
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// Lines of `text` no wider than `width` (by words, or by characters for Chinese).
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const parts = /[\u3000-\u9fff]/.test(text) ? [...text] : text.split(/(?<= )/);
  const lines: string[] = [];
  let line = "";
  for (const part of parts) {
    // Chinese punctuation stays at the end of its line rather than starting the next one.
    const fits = ctx.measureText(line + part).width <= width || /^[，。、；：！？）」]$/.test(part);
    if (line && !fits) { lines.push(line.trimEnd()); line = part.trimStart(); } else line += part;
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}

type Texts = { title: string; summary: string; online: string; busy: string; scan: string; scanMore: string; days: Record<string, string> };

export function drawScheduleImage(canvas: HTMLCanvasElement, model: ImageModel, format: ImageFormat, texts: Texts, link: string) {
  const { width: W, height: H } = IMAGE_SIZES[format];
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  // Instagram covers the top and bottom of a Story with its own buttons.
  const top = format === "story" ? 210 : 70, bottom = format === "story" ? 230 : 64, P = 64;
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";

  // The mark, as in the site header: a red square with a serif "T", then the name.
  ctx.fillStyle = BRAND; roundRect(ctx, P, top, 56, 56, 14); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = `600 34px ${SERIF}`; ctx.textAlign = "center"; ctx.fillText("T", P + 28, top + 40);
  ctx.textAlign = "left"; ctx.fillStyle = INK; ctx.font = `700 32px ${SANS}`; ctx.fillText("TerpPlan", P + 74, top + 39);
  ctx.textAlign = "right"; ctx.fillStyle = MUTED; ctx.font = `400 26px ${SANS}`; ctx.fillText("terpplan.com", W - P, top + 38);
  ctx.textAlign = "left";

  // Georgia's old-style figures look odd beside Chinese, so a Chinese title is set in the sans face.
  ctx.fillStyle = INK; ctx.font = /[\u3000-\u9fff]/.test(texts.title) ? `700 56px ${SANS}` : `400 60px ${SERIF}`; ctx.fillText(texts.title, P, top + 140);
  ctx.fillStyle = MUTED; ctx.font = `400 28px ${SANS}`; ctx.fillText(texts.summary, P, top + 188);

  // Footer: the QR code and what it opens.
  // Big enough to scan from another phone showing the post or Story.
  const qrSize = format === "story" ? 320 : 260, footerTop = H - bottom - qrSize - 28;
  const onlineHeight = model.unscheduled.length ? 46 : 0;
  const gridTop = top + 236, gridBottom = footerTop - onlineHeight - 36;
  const axis = 78, headerHeight = 44, gridLeft = P + axis, gridWidth = W - P - gridLeft;
  const columnWidth = gridWidth / model.days.length;
  const bodyTop = gridTop + headerHeight, bodyHeight = gridBottom - bodyTop - 14;
  const y = (minutes: number) => bodyTop + (minutes - model.from) / (model.to - model.from) * bodyHeight;

  ctx.fillStyle = "#fff"; roundRect(ctx, P, gridTop, W - 2 * P, gridBottom - gridTop, 22); ctx.fill();
  ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = `600 24px ${SANS}`; ctx.fillStyle = "#48534f"; ctx.textAlign = "center";
  model.days.forEach((day, index) => ctx.fillText(texts.days[day] ?? day, gridLeft + columnWidth * (index + 0.5), gridTop + 32));
  ctx.textAlign = "right"; ctx.font = `400 19px ${SANS}`;
  const step = (model.to - model.from) / 60 > 12 ? 120 : 60;
  for (let minutes = model.from; minutes <= model.to; minutes += 60) {
    ctx.strokeStyle = minutes === model.from ? LINE : "#efede8"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(gridLeft, y(minutes)); ctx.lineTo(W - P - 14, y(minutes)); ctx.stroke();
    if ((minutes - model.from) % step === 0 && minutes < model.to) { ctx.fillStyle = MUTED; ctx.fillText(clock(minutes, true), gridLeft - 12, y(minutes) + 20); }
  }

  for (const block of model.blocks) {
    const column = model.days.indexOf(block.day);
    if (column < 0) continue;
    const x = gridLeft + column * columnWidth + 5, w = columnWidth - 10, top1 = y(block.start) + 2, h = Math.max(22, y(block.end) - y(block.start) - 4);
    const busy = block.courseId === null;
    ctx.fillStyle = busy ? "#ebe9e4" : FILLS[block.color % FILLS.length]; roundRect(ctx, x, top1, w, h, 10); ctx.fill();
    if (!busy) { ctx.fillStyle = EDGES[block.color % EDGES.length]; roundRect(ctx, x, top1, 7, h, 3.5); ctx.fill(); }
    ctx.save(); roundRect(ctx, x, top1, w, h, 10); ctx.clip();
    ctx.textAlign = "left"; ctx.fillStyle = busy ? MUTED : INK;
    // The course number, then its time underneath when the block is tall enough for both lines.
    const size = h < 46 ? 19 : h < 72 || columnWidth < 150 ? 22 : 25, timeSize = size > 22 ? 19 : 17;
    const firstLine = top1 + Math.min(h - 8, size + 8), secondLine = firstLine + timeSize + 9;
    ctx.font = `700 ${size}px ${SANS}`;
    ctx.fillText(busy ? texts.busy : block.courseId!, x + 16, firstLine);
    if (secondLine <= top1 + h - 6) { ctx.font = `400 ${timeSize}px ${SANS}`; ctx.fillStyle = MUTED; ctx.fillText(`${clock(block.start)}–${clock(block.end)}`, x + 16, secondLine); }
    ctx.restore();
  }

  ctx.textAlign = "left";
  if (model.unscheduled.length) { ctx.fillStyle = MUTED; ctx.font = `400 24px ${SANS}`; ctx.fillText(texts.online, P, gridBottom + 42); }

  // Low error correction keeps the code coarse (fewer, bigger squares); it is shown on screens, not printed.
  const qr = qrcode(0, "L");
  qr.addData(link);
  qr.make();
  const count = qr.getModuleCount(), quiet = 14, cell = (qrSize - 2 * quiet) / count;
  ctx.fillStyle = "#fff"; roundRect(ctx, P, footerTop, qrSize, qrSize, 18); ctx.fill();
  ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = INK;
  for (let row = 0; row < count; row += 1) for (let column = 0; column < count; column += 1) {
    if (qr.isDark(row, column)) ctx.fillRect(Math.floor(P + quiet + column * cell), Math.floor(footerTop + quiet + row * cell), Math.ceil(cell), Math.ceil(cell));
  }
  const textLeft = P + qrSize + 36, textWidth = W - P - textLeft;
  ctx.fillStyle = INK; ctx.font = `700 32px ${SANS}`; ctx.fillText(texts.scan, textLeft, footerTop + 56);
  ctx.fillStyle = MUTED; ctx.font = `400 24px ${SANS}`;
  wrap(ctx, texts.scanMore, textWidth).slice(0, 3).forEach((line, index) => ctx.fillText(line, textLeft, footerTop + 100 + index * 34));
  ctx.fillStyle = "#a34a39"; ctx.font = `700 26px ${SANS}`; ctx.fillText("terpplan.com", textLeft, footerTop + qrSize - 14);
  return true;
}

type Section = { course_id: string; section_id: string; credits: number | null; meetings?: MeetingTime[] | null };

// `path`: the share link's path (lib/shared-schedule.ts), which the QR code opens on this site.
export function ShareImage({ sections, busyBlocks, term, language, path, buttonClass }: { sections: Section[]; busyBlocks: BusyBlock[]; term: string; language: Language; path: string; buttonClass: string }) {
  const t = copy[language];
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ImageFormat>("post");
  const [showBusy, setShowBusy] = useState(false);
  const [image, setImage] = useState<{ key: string; url: string; blob: Blob } | null>(null);
  const [failed, setFailed] = useState(false);
  const credits = sections.reduce((sum, section) => sum + (section.credits ?? 0), 0);
  const key = [format, showBusy, path, language].join("|");

  useEffect(() => {
    if (!open) return;
    let active = true, url = "";
    const model = imageModel(sections, showBusy ? busyBlocks : []);
    const texts: Texts = {
      title: t.title.replace("{term}", formatTermName(term, language)),
      summary: [model.courses.length === 1 ? t.course : t.courses.replace("{n}", String(model.courses.length)), credits ? t.credits.replace("{n}", String(credits)) : ""].filter(Boolean).join(" · "),
      online: t.online.replace("{list}", model.unscheduled.join(language === "zh" ? "、" : ", ")),
      busy: t.busyBlock, scan: t.scan, scanMore: t.scanMore, days: t.days,
    };
    // Wait for web fonts, then draw off screen and keep the picture as a file.
    void document.fonts.ready.then(() => {
      if (!active) return;
      const canvas = document.createElement("canvas");
      if (!drawScheduleImage(canvas, model, format, texts, window.location.origin + path)) { setFailed(true); return; }
      canvas.toBlob((blob) => {
        if (!active || !blob) { if (active) setFailed(true); return; }
        url = URL.createObjectURL(blob);
        setFailed(false);
        setImage({ key, url, blob });
      }, "image/png");
    });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [open, key, sections, busyBlocks, showBusy, format, path, language, term, credits, t]);

  const current = image?.key === key ? image : null;
  const fileName = `terpplan-${term}-${format}.png`;
  const file = current ? new File([current.blob], fileName, { type: "image/png" }) : null;
  const canShare = Boolean(file && typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] }));
  const share = async () => {
    if (!file) return;
    countUse("shareImage");
    try { await navigator.share({ files: [file] }); } catch { /* closed the share sheet */ }
  };
  const choice = (active: boolean) => `rounded-md px-2.5 py-1 text-xs font-semibold ${active ? "bg-[#273c38] text-white" : "text-[#48534f] hover:bg-[#f1efe9]"}`;

  return <>
    <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={buttonClass}>{t.button}</button>
    {open && <div className="order-last basis-full rounded-xl border border-[#e3e0d8] bg-[#fbfaf8] p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="group" className="inline-flex rounded-lg border border-[#d9d6ce] bg-white p-0.5">
          {(["post", "story"] as const).map((value) => <button key={value} type="button" aria-pressed={format === value} onClick={() => setFormat(value)} className={choice(format === value)}>{t[value]}</button>)}
        </div>
        {busyBlocks.length > 0 && <label className="inline-flex items-center gap-1.5 text-xs text-[#48534f]"><input type="checkbox" checked={showBusy} onChange={(event) => setShowBusy(event.target.checked)} />{t.busy}</label>}
      </div>
      <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:gap-4">
        {/* A picture drawn in this browser (a blob: URL), which next/image cannot optimize. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {current ? <img src={current.url} alt={t.button} className={`rounded-lg border border-[#e3e0d8] shadow-sm ${format === "story" ? "w-44 sm:w-52" : "w-56 sm:w-64"}`} />
          : <p className="text-xs text-[#646c68]">{failed ? t.failed : t.making}</p>}
        {current && <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-1 sm:flex-col sm:items-start">
          <a href={current.url} download={fileName} onClick={() => countUse("shareImage")} className="rounded-lg bg-[#273c38] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d302c]">{t.download}</a>
          {canShare && <button type="button" onClick={() => void share()} className={buttonClass}>{t.share}</button>}
          <p className="basis-full text-[11px] leading-5 text-[#646c68] sm:basis-auto">{t.note}</p>
        </div>}
      </div>
    </div>}
  </>;
}
