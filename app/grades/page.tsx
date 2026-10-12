"use client";

// Grade calculator: pull UMD Canvas courses and scores, read each syllabus for its real grading
// weights, and see the standing and GPA that follow under UMD's own rules.
//
// Everything stays in this browser. The Canvas token (when the student can create one) is sent only
// to Canvas; syllabus files are parsed on the device and never uploaded; nothing here reaches
// TerpPlan's servers, so this page has no API route behind it.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDocumentLanguage } from "@/lib/document-language";
import { readSavedState, writeSavedState } from "@/lib/saved-state";
import {
  CanvasClient,
  DEFAULT_BASE_URL,
  EXPORT_SOURCE,
  bookmarkletHref,
  mergeCanvasData,
  readCanvasExport,
  type CanvasPayload,
  type StoredCourse,
} from "@/lib/grades/canvas";
import {
  canonicalCategory,
  computeCourseGrade,
  requiredOnRemaining,
  type CanvasAssignment,
  type CanvasGroup,
  type ManualItem,
  type Scheme,
} from "@/lib/grades/grading";
import {
  ALL_LETTERS,
  computeGpa,
  computeGpaTerms,
  letterFromPercent,
  type GpaCourse,
  type Level,
} from "@/lib/grades/gpa";
import { extractGradingScheme, schemeFromParsed, type ParsedScheme } from "@/lib/grades/syllabus";
import { sampleTerm } from "@/lib/grades/sample";
import { ReadError, readSyllabusFile } from "@/lib/grades/syllabus-file";

type Language = "en" | "zh";

type Course = {
  id: string;
  canvasId?: number;
  code: string;
  title?: string;
  credits?: number | null;
  term?: string | null;
  source?: string;
  canvasCurrentScore?: number | null;
  canvasCurrentGrade?: string | null;
  canvasUrl?: string | null;
  syllabusBody?: string | null;
  syllabus?: { fileName: string; uploadedAt: string } | null;
  canvas?: { groups?: CanvasGroup[]; items?: CanvasAssignment[] };
  scheme?: Scheme | null;
  manualItems?: ManualItem[];
  overrides?: { letter?: string | null; excludedFromGpa?: boolean; dropLower?: boolean };
};

type Stored = { courses: Course[]; level: Level; fill: number; basis: "current" | "projected" };
const STORAGE = "terpplan:grades:v1";

const copy = {
  en: {
    pilot: "UMD · Student pilot",
    title: "Where you actually stand, in every course.",
    intro: "Pull your Canvas courses and scores, drop in each syllabus so the real weighting is used, and see the percentage you are carrying now — plus the GPA it adds up to.",
    home: "Back to planner",
    privacy: "Courses, scores, syllabi and the Canvas token stay in this browser. Syllabus files are read on your device and never uploaded. Nothing here is sent to TerpPlan's servers.",
    connect: "Connect Canvas", hide: "Hide connection", connectBody: "TerpPlan reads your courses and scores from Canvas with an access token you create and can revoke at any time. Your Directory ID and password are never requested and never stored.",
    tokenLabel: "Canvas access token", tokenHint: "Stored in this browser's local storage. Clear it any time with Disconnect.",
    sync: "Connect and sync", syncing: "Working…", disconnect: "Disconnect", connectedAs: (n: string) => `Connected as ${n}`,
    demo: "Reload the sample term", demoNote: "Sample data, nothing is synced.",
    sampleBanner: "This is a sample term.",
    sampleBannerNote: "None of it is your data. Connect Canvas, or import an export from your browser, and your own courses replace it.",
    sampleClear: "Clear the sample", sampleBadge: "sample",
    noToken: "No token? Export from your browser instead",
    noTokenWhy: "Many universities — UMD included — stop students creating their own Canvas API tokens, so the “+ New Access Token” button is greyed out with an ⓘ that you cannot dismiss. That block is on creating a token, not on using the Canvas API: the same endpoints Canvas's own pages call will answer a request from your signed-in Canvas tab. So you can export the data yourself, with no token and no password leaving your browser.",
    noTokenPolicy: "This is a policy, not a fault on your side — no browser setting, extension, or retry will change it.",
    step1: "Drag this button to your bookmarks bar.", dragHint: "If the bar is hidden, press ⌥⌘B (Chrome) or ⇧⌘B (Safari). On a phone or tablet, use the console method below.",
    step2: "Open umd.instructure.com and sign in. Stay on that page.", step3: "Click the bookmark. It reads your courses and scores, then downloads terpplan-canvas-export.json.",
    step4: "Come back here and import that file.",
    bookmarklet: "⬇ Export Canvas data", console: "Bookmark didn't work? Use the console instead",
    consoleWhy: "Some pages set a Content-Security-Policy that blocks bookmarklets. The DevTools console is not affected, so this method always works.",
    consoleHow: "On umd.instructure.com press ⌥⌘I (Chrome) or ⌥⌘C (Safari), open the Console tab, paste the code below and press Enter. Chrome may first ask you to type “allow pasting”. Read the code before running it.",
    showCode: "Show the code", copy: "Copy", copied: "Copied.",
    importLabel: "Import the export", importHint: "Choose the terpplan-canvas-export.json your browser downloaded.", choose: "Choose file",
    badFormat: "That is not a TerpPlan Canvas export. Use the button above to create one.",
    badJson: "That file is not valid JSON.", noCourses: "That export contains no courses.",
    syncFailed: "Canvas sync failed", unchanged: "Your existing courses and grades have not been changed.",
    pasteTokenFirst: "Paste a token first.",
    manualFallback: "Nothing works? Everything still functions by hand: add a course, upload its syllabus, and type the scores you can see in Canvas. The grading maths and the GPA are identical.",
    ask: "Worth one attempt: search UMD's IT knowledge base for “Canvas API token” and open a ticket. Some institutions grant tokens on request for coursework — do not count on it for a personal project.",

    thisTerm: "This term", credits: "credits", course: "courses", noCoursesYet: "No courses yet. Connect Canvas, load the sample term, or add a course.",
    current: "Current", best: "Best case", nothingGraded: "Nothing graded yet", letter: "Letter",
    semesterGpa: "Semester GPA", cumulative: "Cumulative", counted: "Counted", leftOut: "Left out",
    projection: "Projection, not a real GPA",
    projectionBody: (n: number) => `UMD computes GPA from final letter grades. ${n === 1 ? "1 course here has" : `${n} courses here have`} no final grade yet, so the letter was estimated from the running percentage against the grading scale. It will move as the term goes on.`,
    qualityPoints: (c: number, p: number) => `${c} credits · ${p} quality points`, truncated: (e: string, g: string) => `Exact value ${e} — truncated to ${g}, not rounded.`,

    grading: "Grading structure", fromSyllabus: "From your syllabus", fromCanvas: "From Canvas assignment groups", noStructure: "No grading structure yet — upload the syllabus and the weighting is read out of it.",
    category: "Category", weight: "Weight", drop: "Drop", group: "Canvas group", score: "Score", total: "Total", notMapped: "Not mapped",
    addCategory: "+ Add category", removeCategory: "Remove", confirm: "Use this structure", discard: "Discard",
    review: "Check what was read", reviewNote: "Nothing is calculated until you confirm.", from: (t: string) => `from: “${t}”`,
    scaleRead: "Letter-grade scale read", noScale: "No letter-grade scale stated, so a typical one is used. Every course sets its own.",

    syllabus: "Syllabus", upload: "Upload the syllabus", replace: "Replace the syllabus", reading: (p: number, t: number) => `Reading page ${p} of ${t}…`, readingDoc: "Reading the document…",
    uploadHint: "PDF, .docx or .txt — read in your browser, never uploaded.", paste: "Or paste the grading section", pasteHint: "For a scanned PDF or a paper syllabus — paste just the grading table.", read: "Read this text",
    foundCats: (n: number) => `Found ${n} weighted categories. Check them below.`, noBreakdown: "No grading breakdown could be found. Add the categories by hand, or paste the section as text.",
    readFailed: "Could not read that file", fromCanvasSyllabus: "Read it from the Canvas syllabus", canvasSyllabusNone: "Canvas's syllabus text has no grading breakdown either. Upload the file.",

    scores: "Scores", addScore: "+ Add a score", nothingHere: "Nothing in Canvas for this category yet.", dropped: "dropped", addedByYou: "yours",
    addScoreTitle: "Add a score Canvas does not have", what: "What is it?", earned: "Points earned", outOf: "Out of", countsToward: "Counts toward", note: "Note (optional)", add: "Add", cancel: "Cancel",
    addScoreWhy: "For anything graded outside Canvas — a paper midterm, a participation sheet, an exam handed back in class.", needName: "Give it a name.", needPossible: "Points possible must be greater than zero.", needEarned: "Enter the points earned (0 is fine).",
    whatIf: "What do I need for", overall: "% overall?", need: (n: string, w: string) => `You need ${n} on the ${w}% of the grade still ungraded.`, secured: (w: string, t: string) => `Already secured — even 0 on the remaining ${w}% holds ${t}.`, impossible: (w: string, t: string) => `Not reachable. Even 100% on the remaining ${w}% finishes below ${t}.`, allGraded: (p: string) => `Everything is graded. You finished at ${p}.`,
    warnings: "Things to check", unmapped: (n: string) => `Not in the grading structure yet: ${n}`,
    settings: "Course settings", creditsLabel: "Credit hours", creditsHint: "Canvas does not expose credit hours, so this has to be confirmed for the GPA to be right.",
    finalLetter: "Final letter grade", derive: "Derive from the percentage", letterHint: "Set this once a real grade is posted; until then the letter is a projection.",
    excludeGpa: "Leave out of the GPA", excludeHint: "Pass/Fail, audit, or a course you are repeating.",
    repeatHigher: "Repeated course — keep only the higher grade", repeatHint: "Applies when the first attempt was in your first semester at UMD, or within your first 24 attempted credits.",
    removeCourse: "Remove", remove: "Remove this course", removeBody: "Removes it from this term here. Nothing in Canvas is touched.",
    level: "Student level", undergraduate: "Undergraduate", graduate: "Graduate", basis: "Which score feeds the GPA", basisCurrent: "Current — graded work only", basisProjected: "Projected — full marks on what is left",
    fill: "Assumption for ungraded work", fillSuffix: "% on everything ungraded",
    official: "Your official GPA is whatever Testudo says. This is an independent student project, not affiliated with the University of Maryland.",
  },
  zh: {
    pilot: "UMD · 学生试点",
    title: "每门课，你现在到底处在什么位置。",
    intro: "从 UMD Canvas 同步你的课程和分数，上传每门课的课程大纲以套用真实权重，看清当前折算出的百分制成绩，以及它对应的 GPA。",
    home: "返回排课",
    privacy: "课程、分数、大纲和 Canvas 令牌都保存在本浏览器中。大纲文件在你的设备上解析，绝不上传。这里的内容不会发送到 TerpPlan 的服务器。",
    connect: "连接 Canvas", hide: "收起连接设置", connectBody: "TerpPlan 通过你自己创建的访问令牌读取 Canvas 上的课程与分数，你可以随时撤销它。我们不会索取也不会保存你的 Directory ID 和密码。",
    tokenLabel: "Canvas 访问令牌", tokenHint: "保存在本浏览器的本地存储中。随时可以点「断开连接」清除。",
    sync: "连接并同步", syncing: "处理中…", disconnect: "断开连接", connectedAs: (n: string) => `已连接：${n}`,
    demo: "重新载入示例学期", demoNote: "示例数据，未同步任何内容。",
    sampleBanner: "这是示例学期。",
    sampleBannerNote: "里面没有你的任何真实数据。连接 Canvas，或从浏览器导出后导入，它就会被替换成你自己的课程。",
    sampleClear: "清除示例", sampleBadge: "示例",
    noToken: "拿不到令牌？改为从你自己的浏览器导出",
    noTokenWhy: "很多高校（包括 UMD）禁止学生自行创建 Canvas API 令牌，「+ 创建新访问许可证」按钮因此是灰的，并挂着一个关不掉的 ⓘ 说明。但被禁的是「创建令牌」，不是「使用 Canvas API」—— Canvas 自己页面调用的那些接口，从你已登录的 Canvas 标签页发请求同样会正常响应。所以你可以自己导出数据，全程不需要令牌，密码也不会离开你的浏览器。",
    noTokenPolicy: "这是学校策略，不是你这边的问题 —— 换浏览器、关扩展、反复重试都不会有变化。",
    step1: "把这个按钮拖到你的书签栏。", dragHint: "书签栏没显示就按 ⌥⌘B（Chrome）或 ⇧⌘B（Safari）。手机或平板请改用下面的控制台方式。",
    step2: "打开 umd.instructure.com 并登录，停在这个页面上。", step3: "点击书签栏上的那个按钮。它会读取你的课程和分数，然后下载 terpplan-canvas-export.json。",
    step4: "回到这里导入该文件。",
    bookmarklet: "⬇ 导出 Canvas 数据", console: "书签没反应？改用控制台",
    consoleWhy: "部分页面会设置 Content-Security-Policy，这会拦掉书签小工具；而开发者工具的控制台不受它限制。这个方式一定可用。",
    consoleHow: "在 umd.instructure.com 页面按 ⌥⌘I（Chrome）或 ⌥⌘C（Safari），切到 Console 标签，粘贴下面的代码并回车。Chrome 首次可能要求你先输入「allow pasting」。运行前请先读一遍代码。",
    showCode: "显示代码", copy: "复制", copied: "已复制。",
    importLabel: "导入导出文件", importHint: "选择浏览器刚下载的 terpplan-canvas-export.json。", choose: "选择文件",
    badFormat: "这不是 TerpPlan 的 Canvas 导出文件。请用上面的按钮先生成一份。",
    badJson: "该文件不是有效的 JSON。", noCourses: "该导出文件里没有任何课程。",
    syncFailed: "Canvas 同步失败", unchanged: "你已有的课程和成绩没有被改动。",
    pasteTokenFirst: "请先粘贴令牌。",
    manualFallback: "都不行？功能依然完整：添加课程、上传课程大纲、把 Canvas 上能看到的分数据填进去。评分计算和 GPA 结果完全一样。",
    ask: "值得试一次：在 UMD 的 IT 知识库里搜 “Canvas API token”，然后开一张工单。有些学校会为教学用途按需发放令牌 —— 但个人项目不要指望这条路。",

    thisTerm: "本学期", credits: "学分", course: "门课", noCoursesYet: "还没有课程。连接 Canvas、载入示例学期，或手动添加一门课。",
    current: "当前", best: "最好情况", nothingGraded: "还没有已评分作业", letter: "字母等级",
    semesterGpa: "本学期 GPA", cumulative: "累计", counted: "已计入", leftOut: "未计入",
    projection: "这是预测值，不是真实 GPA",
    projectionBody: (n: number) => `UMD 只依据最终字母等级计算 GPA。此处有 ${n} 门课还没有最终成绩，字母等级是按当前百分制对照大纲里的等级表推算的。随着学期推进会不断变化。`,
    qualityPoints: (c: number, p: number) => `${c} 学分 · ${p} 质量分`, truncated: (e: string, g: string) => `精确值 ${e} —— 截断为 ${g}，未四舍五入。`,

    grading: "评分结构", fromSyllabus: "来自你的课程大纲", fromCanvas: "来自 Canvas 作业分组", noStructure: "还没有评分结构 —— 上传课程大纲即可自动读出权重。",
    category: "类别", weight: "权重", drop: "去最低", group: "Canvas 分组", score: "得分", total: "合计", notMapped: "未映射",
    addCategory: "+ 添加类别", removeCategory: "删除", confirm: "采用这个结构", discard: "放弃",
    review: "核对读取结果", reviewNote: "在你确认之前，不会进行任何计算。", from: (t: string) => `原文：“${t}”`,
    scaleRead: "读到的字母等级表", noScale: "大纲没有给出等级表，将使用通用等级表。每门课的划分线都是自己定的。",

    syllabus: "课程大纲", upload: "上传课程大纲", replace: "更换课程大纲", reading: (p: number, t: number) => `正在读取第 ${p} 页，共 ${t} 页…`, readingDoc: "正在读取文档…",
    uploadHint: "支持 PDF、.docx、.txt —— 在你的浏览器中解析，绝不上传。", paste: "或粘贴评分部分文本", pasteHint: "扫描版 PDF 或纸质大纲用这个 —— 只需粘贴评分表那一段。", read: "读取这段文本",
    foundCats: (n: number) => `找到 ${n} 个加权类别，请在下方核对。`, noBreakdown: "没有找到评分结构。可以手动添加类别，或粘贴评分段落文本。",
    readFailed: "无法读取该文件", fromCanvasSyllabus: "改为从 Canvas 大纲读取", canvasSyllabusNone: "Canvas 上的大纲文本里也没有评分结构，请上传文件。",

    scores: "分数明细", addScore: "+ 补充分数", nothingHere: "该类别在 Canvas 上还没有任何内容。", dropped: "已剔除", addedByYou: "你补充的",
    addScoreTitle: "补充一项 Canvas 上没有的分数", what: "这是什么？", earned: "得分", outOf: "满分", countsToward: "计入类别", note: "备注（可选）", add: "添加", cancel: "取消",
    addScoreWhy: "凡是 Canvas 之外评分的内容都可以用这里补录 —— 纸质期中考、课堂参与表、当堂发回的试卷。", needName: "请填写名称。", needPossible: "满分必须大于 0。", needEarned: "请填写得分（0 也可以）。",
    whatIf: "如果我想拿到", overall: "% 的总评？", need: (n: string, w: string) => `剩下未评分、占总评 ${w}% 的部分，你需要拿到 ${n}。`, secured: (w: string, t: string) => `已经稳了 —— 剩下占权重 ${w}% 的部分即使全拿 0 分，也能保住 ${t}。`, impossible: (w: string, t: string) => `达不到。剩下占权重 ${w}% 的部分即使全拿满分，最终也低于 ${t}。`, allGraded: (p: string) => `所有作业都已评分，你的最终成绩是 ${p}。`,
    warnings: "待确认事项", unmapped: (n: string) => `尚未纳入评分结构：${n}`,
    settings: "课程设置", creditsLabel: "学分", creditsHint: "Canvas 不提供学分数据，必须确认后才能算对 GPA。",
    finalLetter: "最终字母等级", derive: "按百分制自动推算", letterHint: "真实成绩公布后在这里填写；在此之前字母等级只是预测值。",
    excludeGpa: "不计入 GPA", excludeHint: "适用于通过/不通过、旁听，或你正在重修的课程。",
    repeatHigher: "重修课程 —— 只保留较高的一次成绩", repeatHint: "仅当首次修读发生在你在 UMD 的第一个学期，或前 24 个已修学分之内时适用。",
    removeCourse: "删除", remove: "删除这门课", removeBody: "只会从这里移除，不会改动 Canvas 上的任何内容。",
    level: "学生身份", undergraduate: "本科生", graduate: "研究生", basis: "用哪个分数计算 GPA", basisCurrent: "当前分 —— 仅含已评分作业", basisProjected: "预测分 —— 未评分部分按满分计",
    fill: "未评分作业的假设值", fillSuffix: "% 计入所有未评分项",
    official: "你的官方 GPA 以 Testudo 显示为准。这是学生独立项目，与马里兰大学无隶属关系。",
  },
};

// Both branches widen to the same shape, so one type covers whichever language is showing.
type Copy = (typeof copy)["en"];

const TERM_ZH: Record<string, string> = { Spring: "春季", Summer: "夏季", Fall: "秋季", Winter: "冬季" };

function formatTerm(term: string | null | undefined, language: Language): string {
  if (!term) return "";
  if (language === "en") return term;
  const m = /^(Spring|Summer|Fall|Winter)\s+(\d{4})$/.exec(term.trim());
  return m ? `${m[2]}年${TERM_ZH[m[1]!]}` : term;
}

const pct = (x: number | null | undefined, digits = 1) => (x === null || x === undefined ? "—" : `${x.toFixed(digits)}%`);
const gpaText = (x: number | null) => (x === null ? "—" : x.toFixed(3));

export default function GradesPage() {
  const [language, setLanguage] = useState<Language>("en");
  useDocumentLanguage(language);
  const t = copy[language];

  const [courses, setCourses] = useState<Course[]>([]);
  const [level, setLevel] = useState<Level>("undergraduate");
  const [fill, setFill] = useState(100);
  const [basis, setBasis] = useState<"current" | "projected">("current");
  const hydrated = useRef(false);

  const [token, setToken] = useState("");
  const [userName, setUserName] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, ParsedScheme>>({});
  const fileRef = useRef<HTMLInputElement | null>(null);

  // ---------------------------------------------------------------- storage
  useEffect(() => {
    const saved = readSavedState() as { language?: Language };
    /* eslint-disable react-hooks/set-state-in-effect */
    if (saved.language === "en" || saved.language === "zh") setLanguage(saved.language);
    let restored = false;
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        const data = JSON.parse(raw) as Stored;
        if (Array.isArray(data.courses)) setCourses(data.courses);
        if (data.level) setLevel(data.level);
        if (typeof data.fill === "number") setFill(data.fill);
        if (data.basis) setBasis(data.basis);
        restored = true;
      }
    } catch { /* storage can be blocked; the page still works */ }
    // First visit, or storage is unavailable: show the sample term so the tool explains itself
    // before anything is connected. It is labelled, and any real data clears it (see applyPayload).
    if (!restored) setCourses(sampleTerm());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // The first pass of this effect is the read above; skip it so a fresh visit does not immediately
  // write back what it just read.
  useEffect(() => {
    if (!hydrated.current) { hydrated.current = true; return; }
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ courses, level, fill, basis } satisfies Stored));
    } catch { /* ignore */ }
  }, [courses, level, fill, basis]);

  const note = (kind: "ok" | "bad", text: string) => setMessage({ kind, text });

  const hasSample = courses.some((c) => c.source === "sample");
  const clearSample = () => setCourses((list) => list.filter((c) => c.source !== "sample"));

  // -------------------------------------------------------------- canvas in
  async function applyPayload(payload: CanvasPayload) {
    // Real courses replace the sample rather than piling up beside it. mergeCanvasData works on the
    // loose stored shape; Course is that shape plus its own fields.
    const real = courses.filter((c) => c.source !== "sample");
    const merged = mergeCanvasData(real as StoredCourse[], payload, () => `c${Math.random().toString(36).slice(2, 10)}`);
    setCourses(merged.courses as Course[]);
    if (merged.userName) setUserName(merged.userName);
    return merged;
  }

  async function connect() {
    if (!token.trim()) { note("bad", t.pasteTokenFirst); return; }
    setBusy(t.syncing);
    try {
      const client = new CanvasClient(token.trim(), DEFAULT_BASE_URL);
      const payload = await client.syncAll((m) => setBusy(m));
      const merged = await applyPayload(payload);
      setShowConnect(false);
      note("ok", `${merged.added + merged.updated} ${t.course}`);
    } catch (err) {
      note("bad", `${t.syncFailed} ${(err as Error).message} ${t.unchanged}`);
    } finally {
      setBusy(null);
    }
  }

  async function importFile(file: File) {
    const result = readCanvasExport(await file.text());
    if (!result.ok) {
      note("bad", result.reason === "not-json" ? t.badJson : result.reason === "no-courses" ? t.noCourses : t.badFormat);
      return;
    }
    setBusy(t.syncing);
    try {
      const merged = await applyPayload(result.payload);
      setShowConnect(false);
      note("ok", `${merged.added + merged.updated} ${t.course}`);
    } finally {
      setBusy(null);
    }
  }

  // ---------------------------------------------------------------- courses
  const patch = (id: string, change: Partial<Course>) =>
    setCourses((list) => list.map((c) => (c.id === id ? { ...c, ...change } : c)));

  async function uploadSyllabus(course: Course, file: File) {
    setBusy(t.readingDoc);
    try {
      const { text } = await readSyllabusFile(file, ({ page, total }) => setBusy(t.reading(page, total)));
      const parsed = extractGradingScheme(text, { canonicalOf: canonicalCategory });
      setPending((p) => ({ ...p, [course.id]: parsed }));
      patch(course.id, { syllabus: { fileName: file.name, uploadedAt: new Date().toISOString() } });
      setOpenId(course.id);
      note(parsed.ok ? "ok" : "bad", parsed.ok ? t.foundCats(parsed.categories.length) : t.noBreakdown);
    } catch (err) {
      const e = err as ReadError;
      note("bad", `${t.readFailed}: ${e.message} ${e.hint ?? ""}`);
    } finally {
      setBusy(null);
    }
  }

  // ------------------------------------------------------------------ grades
  const rollup = useMemo(() => {
    const rows = courses.map((c, i) => {
      const grade = computeCourseGrade(c as never, { ungradedFillPercent: fill });
      const scale = c.scheme?.letterScale?.length ? c.scheme.letterScale : undefined;
      const chosen = basis === "projected" ? grade.projected.pct : (grade.current.pct ?? grade.projected.pct);
      const override = c.overrides?.letter ?? "";
      const letter = override || letterFromPercent(chosen, scale);
      const provisional = !override;
      const gpaRow: GpaCourse = {
        code: c.code, credits: c.credits ?? null, letter, term: c.term ?? null, termIndex: i,
        repeatKey: c.code, excluded: !!c.overrides?.excludedFromGpa, dropLower: !!c.overrides?.dropLower,
        id: c.id, provisional,
      };
      return { course: c, grade, letter, provisional, gpaRow, chosen, basisUsed: basis };
    });
    const gpaRows = rows.map((r) => r.gpaRow);
    return { rows, semester: computeGpa(gpaRows, { level }), terms: computeGpaTerms(gpaRows, { level }) };
  }, [courses, fill, basis, level]);

  const provisionalCount = rollup.rows.filter((r) => r.provisional).length;

  return (
    <div className="min-h-screen bg-[#f5f3ef] text-[#24312d]">
      <header className="border-b border-[#dedbd3] bg-[#fbfaf8]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3 font-semibold">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#bd302f] font-serif text-lg text-white">T</span>
            TerpPlan
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/plan" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#d9d6ce] bg-white px-3 py-1.5 text-xs font-semibold text-[#273c38] shadow-sm hover:border-[#536d64] hover:bg-[#edf3ef]">
              <span aria-hidden="true">←</span>
              <span className="sm:hidden">{language === "en" ? "Planner" : "排课"}</span>
              <span className="hidden sm:inline">{t.home}</span>
            </Link>
            <button
              type="button"
              onClick={() => { const next: Language = language === "en" ? "zh" : "en"; setLanguage(next); writeSavedState({ language: next }); }}
              className="whitespace-nowrap rounded-lg border border-[#dcd9d0] px-3 py-2 text-xs"
            >
              {language === "en" ? "中文" : "English"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[.17em] text-[#a34a39]">{t.pilot}</p>
        <h1 className="mt-3 max-w-3xl font-serif text-3xl leading-tight tracking-[-.02em] text-[#273c38] sm:text-5xl">{t.title}</h1>
        <p className="mt-4 max-w-3xl text-[#48534f]">{t.intro}</p>

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowConnect((v) => !v)} className="rounded-lg bg-[#273c38] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1d302c]">
            {showConnect ? t.hide : t.connect}
          </button>
          <button type="button" onClick={() => { setCourses(sampleTerm()); setUserName(null); note("ok", t.demoNote); }} className="rounded-lg border border-[#dcd9d0] bg-white px-4 py-2 text-xs font-semibold text-[#273c38] hover:bg-[#f6f4ef]">
            {t.demo}
          </button>
        </div>

        {hasSample && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ead8b5] bg-[#fffaf0] px-4 py-3">
            <p className="text-sm text-[#48534f]">
              <strong className="text-[#273c38]">{t.sampleBanner}</strong> {t.sampleBannerNote}
            </p>
            <button
              type="button"
              onClick={clearSample}
              className="shrink-0 rounded-lg border border-[#e0ddd5] bg-white px-3 py-1.5 text-xs font-semibold text-[#273c38] hover:bg-[#f6f4ef]"
            >
              {t.sampleClear}
            </button>
          </div>
        )}

        {message && (
          <p className={`mt-4 rounded-lg border px-4 py-3 text-sm ${message.kind === "bad" ? "border-[#e3c4bb] bg-[#fff5f1] text-[#8f3f30]" : "border-[#cddbd1] bg-[#edf3ef] text-[#315c43]"}`}>
            {message.text}
          </p>
        )}
        {busy && <p className="mt-3 text-sm text-[#7a817d]">{busy}</p>}

        {showConnect && (
          <section className="mt-6 grid gap-4 rounded-2xl border border-[#e0ddd5] bg-white p-5">
            <div>
              <h2 className="font-serif text-xl text-[#273c38]">{t.connect}</h2>
              <p className="mt-2 text-sm text-[#48534f]">{t.connectBody}</p>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[.1em] text-[#5d6561]">{t.tokenLabel}</span>
              <input
                type="password" value={token} autoComplete="off" spellCheck={false}
                onChange={(e) => setToken(e.target.value)}
                className="w-full rounded-lg border border-[#dcd9d0] px-3 py-2 font-mono text-xs"
              />
              <span className="mt-1 block text-xs text-[#7a817d]">{t.tokenHint}</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={connect} disabled={!!busy} className="rounded-lg bg-[#273c38] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1d302c] disabled:opacity-50">
                {busy ? t.syncing : t.sync}
              </button>
              {userName && (
                <button type="button" onClick={() => { setToken(""); setUserName(null); }} className="rounded-lg border border-[#dcd9d0] px-4 py-2 text-xs font-semibold text-[#273c38]">
                  {t.disconnect}
                </button>
              )}
              {userName && <span className="self-center text-xs text-[#7a817d]">{t.connectedAs(userName)}</span>}
            </div>

            <div className="rounded-xl border border-[#ead8b5] bg-[#fffaf0] p-4">
              <h3 className="font-semibold text-[#273c38]">{t.noToken}</h3>
              <p className="mt-1 text-xs text-[#48534f]">{t.noTokenPolicy}</p>
              <p className="mt-3 text-sm text-[#48534f]">{t.noTokenWhy}</p>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[#48534f]">
                <li>
                  {t.step1}{" "}
                  <a
                    href={bookmarkletHref()}
                    draggable
                    onClick={(e) => { e.preventDefault(); note("bad", t.step2); }}
                    className="ml-1 inline-block rounded-lg bg-[#a34a39] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    {t.bookmarklet}
                  </a>
                  <span className="mt-1 block text-xs text-[#7a817d]">{t.dragHint}</span>
                </li>
                <li>{t.step2}</li>
                <li>{t.step3}</li>
                <li>
                  {t.step4}
                  <span className="mt-2 block">
                    <label className="inline-flex cursor-pointer items-center rounded-lg border border-[#dcd9d0] bg-white px-3 py-1.5 text-xs font-semibold text-[#273c38]">
                      {t.choose}
                      <input
                        ref={fileRef} type="file" accept=".json,application/json" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }}
                      />
                    </label>
                    <span className="ml-2 text-xs text-[#7a817d]">{t.importHint}</span>
                  </span>
                </li>
              </ol>

              <details className="mt-4 rounded-lg border border-[#e0ddd5] bg-white">
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-[#273c38]">{t.console}</summary>
                <div className="px-3 pb-3">
                  <p className="text-xs text-[#48534f]">{t.consoleWhy}</p>
                  <p className="mt-2 text-xs text-[#48534f]">{t.consoleHow}</p>
                  <button
                    type="button"
                    onClick={() => { void navigator.clipboard?.writeText(EXPORT_SOURCE).then(() => note("ok", t.copied)); }}
                    className="mt-2 rounded-lg border border-[#dcd9d0] px-3 py-1.5 text-xs font-semibold text-[#273c38]"
                  >
                    {t.copy}
                  </button>
                  <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-[#f6f4ef] p-3 text-[11px] leading-relaxed text-[#48534f]">{EXPORT_SOURCE}</pre>
                </div>
              </details>

              <p className="mt-3 text-xs text-[#7a817d]">{t.manualFallback}</p>
              <p className="mt-2 text-xs text-[#7a817d]">{t.ask}</p>
            </div>
          </section>
        )}

        {/* ------------------------------------------------------------ GPA */}
        <section className="mt-8 rounded-2xl border border-[#e0ddd5] bg-white p-5">
          <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.17em] text-[#a34a39]">{t.semesterGpa}</p>
              <p className="font-serif text-6xl leading-none tracking-[-.03em] text-[#273c38]">{gpaText(rollup.semester.gpa)}</p>
              <p className="mt-2 text-xs text-[#7a817d]">{t.qualityPoints(rollup.semester.totalCredits, rollup.semester.totalQualityPoints)}</p>
              {rollup.semester.exact !== null && rollup.semester.gpa !== null && Math.abs(rollup.semester.exact - rollup.semester.gpa) > 1e-9 && (
                <p className="mt-1 text-xs text-[#7a817d]">{t.truncated(rollup.semester.exact.toFixed(6), gpaText(rollup.semester.gpa))}</p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.1em] text-[#5d6561]">{t.counted}</p>
                <p className="font-serif text-2xl text-[#273c38]">{rollup.semester.counted.length}</p>
                <p className="text-xs text-[#7a817d]">{t.cumulative}: {gpaText(rollup.terms.cumulative.gpa)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.1em] text-[#5d6561]">{t.leftOut}</p>
                <p className="font-serif text-2xl text-[#273c38]">{rollup.semester.skipped.length + rollup.semester.dropped.length}</p>
                <p className="text-xs text-[#7a817d]">P/S/W, {language === "en" ? "ungraded, or excluded" : "未评分，或已排除"}</p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-[#48534f]">
                  {t.level}
                  <select value={level} onChange={(e) => setLevel(e.target.value as Level)} className="mt-1 w-full rounded-lg border border-[#dcd9d0] px-2 py-1.5 text-xs">
                    <option value="undergraduate">{t.undergraduate}</option>
                    <option value="graduate">{t.graduate}</option>
                  </select>
                </label>
                <label className="mt-2 block text-xs text-[#48534f]">
                  {t.basis}
                  <select value={basis} onChange={(e) => setBasis(e.target.value as "current" | "projected")} className="mt-1 w-full rounded-lg border border-[#dcd9d0] px-2 py-1.5 text-xs">
                    <option value="current">{t.basisCurrent}</option>
                    <option value="projected">{t.basisProjected}</option>
                  </select>
                </label>
                <label className="mt-2 block text-xs text-[#48534f]">
                  {t.fill}
                  <span className="mt-1 flex items-center gap-2">
                    <input type="number" min={0} max={100} value={fill} onChange={(e) => setFill(Number(e.target.value))} className="w-20 rounded-lg border border-[#dcd9d0] px-2 py-1.5 text-xs" />
                    <span className="text-xs text-[#7a817d]">{t.fillSuffix}</span>
                  </span>
                </label>
              </div>
            </div>
          </div>
          {provisionalCount > 0 && (
            <p className="mt-4 rounded-lg border border-[#ead8b5] bg-[#fffaf0] px-4 py-3 text-sm text-[#48534f]">
              <strong className="text-[#273c38]">{t.projection}.</strong> {t.projectionBody(provisionalCount)}
            </p>
          )}
        </section>

        {/* --------------------------------------------------------- courses */}
        <h2 className="mt-10 font-serif text-2xl text-[#273c38]">{t.thisTerm}</h2>
        {rollup.rows.length === 0 && <p className="mt-3 text-sm text-[#7a817d]">{t.noCoursesYet}</p>}

        <div className="mt-4 space-y-3">
          {rollup.rows.map(({ course, grade, letter, chosen }) => {
            const open = openId === course.id;
            const warnings = grade.warnings;
            return (
              <section key={course.id} className="rounded-2xl border border-[#e0ddd5] bg-white">
                <button type="button" onClick={() => setOpenId(open ? null : course.id)} className="flex w-full items-start justify-between gap-4 p-5 text-left">
                  <div className="min-w-0">
                    <p className="font-serif text-lg text-[#273c38]">
                      {course.code}
                      {course.source === "sample" && (
                        <span className="ml-2 rounded-full border border-[#ead8b5] bg-[#fffaf0] px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-[.1em] text-[#8a5a17]">
                          {t.sampleBadge}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-[#646c68]">{course.title}</p>
                    <p className="mt-2 text-xs text-[#7a817d]">
                      {course.term ? `${formatTerm(course.term, language)} · ` : ""}
                      {course.credits ? `${course.credits} ${t.credits}` : t.creditsLabel}
                      {course.canvasCurrentScore != null && ` · Canvas ${pct(course.canvasCurrentScore)}`}
                      {course.scheme?.categories?.length ? ` · ${course.scheme.categories.length} ${t.category}` : ` · ${t.noStructure}`}
                      {warnings.length ? ` · ${warnings.length} ${t.warnings}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[#7a817d]">{t.current}</p>
                    <p className="font-serif text-2xl text-[#273c38]">{pct(chosen)}</p>
                    <p className="mt-1 inline-grid h-9 min-w-[46px] place-items-center rounded-lg border border-[#b9c5be] bg-[#edf3ef] px-2 font-serif text-base font-semibold text-[#315c43]">{letter || "—"}</p>
                  </div>
                </button>

                {open && (
                  <CourseDetail
                    course={course}
                    t={t}
                    grade={grade}
                    parsed={pending[course.id]}
                    onPatch={(change) => patch(course.id, change)}
                    onParsed={(p) => setPending((prev) => {
                      const next = { ...prev };
                      if (p) next[course.id] = p; else delete next[course.id];
                      return next;
                    })}
                    onUpload={(file) => void uploadSyllabus(course, file)}
                    onRemove={() => setCourses((list) => list.filter((c) => c.id !== course.id))}
                    fill={fill}
                  />
                )}
              </section>
            );
          })}
        </div>

        <p className="mt-10 text-xs text-[#7a817d]">{t.privacy}</p>
        <p className="mt-2 text-xs text-[#7a817d]">{t.official}</p>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------- detail view */

function CourseDetail({
  course, t, grade, parsed, onPatch, onParsed, onUpload, onRemove, fill,
}: {
  course: Course;
  t: Copy;
  grade: ReturnType<typeof computeCourseGrade>;
  parsed?: ParsedScheme;
  onPatch: (change: Partial<Course>) => void;
  onParsed: (p: ParsedScheme | undefined) => void;
  onUpload: (file: File) => void;
  onRemove: () => void;
  fill: number;
}) {
  const [target, setTarget] = useState(93);
  const [manual, setManual] = useState({ name: "", earned: "", possible: "", categoryId: "" });
  const [text, setText] = useState("");

  const groups = course.canvas?.groups ?? [];
  const categories = course.scheme?.categories ?? [];
  const need = requiredOnRemaining(course as never, target, { ungradedFillPercent: fill });

  const setScheme = (change: Partial<Scheme>) => onPatch({ scheme: { ...(course.scheme as Scheme), ...change } });

  return (
    <div className="space-y-5 border-t border-[#e0ddd5] p-5">
      {grade.warnings.length > 0 && (
        <ul className="space-y-2">
          {grade.warnings.map((w, i) => (
            <li key={i} className={`rounded-lg border px-3 py-2 text-xs ${w.level === "warn" ? "border-[#ead8b5] bg-[#fffaf0] text-[#48534f]" : "border-[#e0ddd5] bg-[#f6f4ef] text-[#48534f]"}`}>
              {w.text}
            </li>
          ))}
        </ul>
      )}

      {/* confirm a freshly parsed syllabus before it is used */}
      {parsed && (
        <div className="rounded-xl border-l-[3px] border-[#a34a39] bg-[#fff5f1] p-4">
          <p className="font-semibold text-[#273c38]">{t.review}</p>
          <p className="text-xs text-[#48534f]">{t.reviewNote}</p>
          <ul className="mt-3 space-y-2">
            {parsed.categories.map((c) => (
              <li key={c.id} className="rounded-lg bg-white p-2 text-xs">
                <span className="font-semibold text-[#273c38]">{c.name}</span> · {c.weight}%
                <span className="block text-[11px] text-[#7a817d]">{t.from(c.evidence.text.slice(0, 80))}</span>
              </li>
            ))}
          </ul>
          {parsed.letterScale.length > 0 ? (
            <p className="mt-2 text-xs text-[#48534f]">{t.scaleRead}: {parsed.letterScale.map((s) => `${s.letter}≥${s.min}`).join(", ")}</p>
          ) : (
            <p className="mt-2 text-xs text-[#7a817d]">{t.noScale}</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-[#273c38] px-3 py-1.5 text-xs font-semibold text-white"
              onClick={() => {
                onPatch({ scheme: schemeFromParsed(parsed, groups.map((g) => ({ id: g.id, name: g.name }))) });
                onParsed(undefined);
              }}
            >
              {t.confirm}
            </button>
            <button type="button" className="rounded-lg border border-[#dcd9d0] px-3 py-1.5 text-xs" onClick={() => onParsed(undefined)}>{t.discard}</button>
          </div>
        </div>
      )}

      {/* grading structure */}
      <div>
        <h3 className="font-semibold text-[#273c38]">{t.grading}</h3>
        <p className="text-xs text-[#7a817d]">{course.scheme?.source === "canvas" ? t.fromCanvas : t.fromSyllabus}</p>
        {categories.length === 0 ? (
          <p className="mt-2 text-xs text-[#7a817d]">{t.noStructure}</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#e0ddd5] text-left text-[11px] uppercase tracking-[.08em] text-[#5d6561]">
                  <th className="py-2 pr-2">{t.category}</th>
                  <th className="py-2 pr-2 text-right">{t.weight}</th>
                  <th className="py-2 pr-2 text-right">{t.drop}</th>
                  <th className="py-2 pr-2">{t.group}</th>
                  <th className="py-2 text-right">{t.score}</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => {
                  const computed = grade.categories.find((x) => x.id === c.id);
                  return (
                    <tr key={c.id} className="border-b border-[#f1efe9]">
                      <td className="py-1.5 pr-2">{c.name}</td>
                      <td className="py-1.5 pr-2 text-right">{c.weight}%</td>
                      <td className="py-1.5 pr-2 text-right">{c.dropLowest || 0}</td>
                      <td className="py-1.5 pr-2">
                        <select
                          value={c.canvasGroupId ?? ""}
                          onChange={(e) => setScheme({
                            categories: categories.map((x) => x.id === c.id ? { ...x, canvasGroupId: e.target.value === "" ? null : Number(e.target.value) } : x),
                          })}
                          className="rounded border border-[#dcd9d0] px-1 py-0.5 text-xs"
                        >
                          <option value="">{t.notMapped}</option>
                          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5 text-right">
                        {computed ? `${pct(computed.currentPct)} (${computed.gradedCount}/${computed.totalCount})` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-2 font-semibold">{t.total}</td>
                  <td className="pt-2 text-right font-semibold">{grade.weightTotal}%</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* syllabus */}
      <div>
        <h3 className="font-semibold text-[#273c38]">{t.syllabus}</h3>
        <p className="text-xs text-[#7a817d]">{course.syllabus ? course.syllabus.fileName : t.uploadHint}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-[#dcd9d0] bg-white px-3 py-1.5 text-xs font-semibold text-[#273c38]">
            {course.syllabus ? t.replace : t.upload}
            <input type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />
          </label>
          {course.syllabusBody && (
            <button
              type="button"
              className="rounded-lg border border-[#dcd9d0] px-3 py-1.5 text-xs"
              onClick={() => {
                const p = extractGradingScheme(htmlToText(course.syllabusBody ?? ""), { canonicalOf: canonicalCategory });
                if (!p.ok) { onParsed(undefined); return; }
                onParsed(p);
              }}
            >
              {t.fromCanvasSyllabus}
            </button>
          )}
        </div>
        <details className="mt-2 rounded-lg border border-[#e0ddd5]">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-[#273c38]">{t.paste}</summary>
          <div className="px-3 pb-3">
            <p className="text-xs text-[#7a817d]">{t.pasteHint}</p>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="mt-2 w-full rounded-lg border border-[#dcd9d0] p-2 font-mono text-xs" />
            <button
              type="button"
              className="mt-2 rounded-lg border border-[#dcd9d0] px-3 py-1.5 text-xs font-semibold text-[#273c38]"
              onClick={() => onParsed(extractGradingScheme(text, { canonicalOf: canonicalCategory }))}
            >
              {t.read}
            </button>
          </div>
        </details>
      </div>

      {/* scores */}
      <div>
        <h3 className="font-semibold text-[#273c38]">{t.scores}</h3>
        <div className="mt-2 space-y-3">
          {grade.categories.map((c) => (
            <div key={c.id}>
              <p className="text-xs font-semibold text-[#48534f]">{c.name} · {c.weight}%</p>
              {c.items.length === 0 && c.droppedItems.length === 0 && <p className="text-xs text-[#7a817d]">{t.nothingHere}</p>}
              <ul className="mt-1 space-y-0.5 text-xs">
                {c.items.map((it) => (
                  <li key={it.id} className={`flex items-center justify-between gap-2 rounded px-2 py-1 ${it.earned === null ? "bg-[#f6f4ef]" : ""}`}>
                    <span className="truncate">{it.name}{it.source === "manual" && <em className="ml-1 text-[#315c43]">({t.addedByYou})</em>}</span>
                    <span className="shrink-0 tabular-nums text-[#48534f]">
                      {it.earned === null ? "—" : it.earned.toFixed(1)} / {it.possible ?? "—"}
                    </span>
                  </li>
                ))}
                {c.droppedItems.map((it, i) => (
                  <li key={`d${i}`} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-[#9aa8a1] line-through">
                    <span className="truncate">{it.name} ({t.dropped})</span>
                    <span className="shrink-0 tabular-nums">{it.earned?.toFixed(1)} / {it.possible}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* add a score by hand */}
        <div className="mt-3 rounded-lg border border-[#e0ddd5] bg-[#f6f4ef] p-3">
          <p className="text-xs font-semibold text-[#273c38]">{t.addScoreTitle}</p>
          <p className="mt-1 text-xs text-[#7a817d]">{t.addScoreWhy}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-4">
            <input placeholder={t.what} value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} className="rounded border border-[#dcd9d0] px-2 py-1 text-xs" />
            <input placeholder={t.earned} inputMode="decimal" value={manual.earned} onChange={(e) => setManual({ ...manual, earned: e.target.value })} className="rounded border border-[#dcd9d0] px-2 py-1 text-xs" />
            <input placeholder={t.outOf} inputMode="decimal" value={manual.possible} onChange={(e) => setManual({ ...manual, possible: e.target.value })} className="rounded border border-[#dcd9d0] px-2 py-1 text-xs" />
            <select value={manual.categoryId || categories[0]?.id || ""} onChange={(e) => setManual({ ...manual, categoryId: e.target.value })} className="rounded border border-[#dcd9d0] px-2 py-1 text-xs">
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.weight}%)</option>)}
            </select>
          </div>
          <button
            type="button"
            className="mt-2 rounded-lg bg-[#273c38] px-3 py-1.5 text-xs font-semibold text-white"
            onClick={() => {
              const id = manual.categoryId || categories[0]?.id;
              const earned = Number(manual.earned);
              const possible = Number(manual.possible);
              if (!id) return;
              if (!manual.name.trim()) return;
              if (!Number.isFinite(possible) || possible <= 0) return;
              if (!Number.isFinite(earned)) return;
              onPatch({
                manualItems: [
                  ...(course.manualItems ?? []),
                  { id: `m${Date.now()}`, name: manual.name.trim(), categoryId: id, earned, possible },
                ],
              });
              setManual({ name: "", earned: "", possible: "", categoryId: id });
            }}
          >
            {t.addScore}
          </button>
        </div>
      </div>

      {/* what-if */}
      <div className="rounded-lg border border-[#e0ddd5] p-3">
        <label className="flex flex-wrap items-center gap-2 text-xs text-[#48534f]">
          {t.whatIf}
          <input type="number" min={0} max={100} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="w-16 rounded border border-[#dcd9d0] px-2 py-1 text-xs" />
          {t.overall}
        </label>
        <p className="mt-2 text-xs text-[#48534f]">
          {need.remainingWeight <= 0
            ? t.allGraded(pct(need.final))
            : need.alreadySecured
              ? t.secured(String(need.remainingWeight), `${target}%`)
              : need.possible
                ? t.need(pct(need.needed ?? 0, 2), String(need.remainingWeight))
                : t.impossible(String(need.remainingWeight), `${target}%`)}
        </p>
      </div>

      {/* settings */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-[#48534f]">
          {t.creditsLabel}
          <input
            type="number" min={0} max={12} value={course.credits ?? ""}
            onChange={(e) => onPatch({ credits: e.target.value === "" ? null : Number(e.target.value) })}
            className="mt-1 w-24 rounded-lg border border-[#dcd9d0] px-2 py-1.5 text-xs"
          />
          <span className="mt-1 block text-[11px] text-[#7a817d]">{t.creditsHint}</span>
        </label>
        <label className="text-xs text-[#48534f]">
          {t.finalLetter}
          <select
            value={course.overrides?.letter ?? ""}
            onChange={(e) => onPatch({ overrides: { ...(course.overrides ?? {}), letter: e.target.value || null } })}
            className="mt-1 w-full rounded-lg border border-[#dcd9d0] px-2 py-1.5 text-xs"
          >
            <option value="">{t.derive}</option>
            {ALL_LETTERS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <span className="mt-1 block text-[11px] text-[#7a817d]">{t.letterHint}</span>
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-[#48534f]">
        <label className="flex items-start gap-2">
          <input
            type="checkbox" checked={!!course.overrides?.excludedFromGpa}
            onChange={(e) => onPatch({ overrides: { ...(course.overrides ?? {}), excludedFromGpa: e.target.checked } })}
          />
          <span>{t.excludeGpa}<span className="block text-[11px] text-[#7a817d]">{t.excludeHint}</span></span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="checkbox" checked={!!course.overrides?.dropLower}
            onChange={(e) => onPatch({ overrides: { ...(course.overrides ?? {}), dropLower: e.target.checked } })}
          />
          <span>{t.repeatHigher}<span className="block text-[11px] text-[#7a817d]">{t.repeatHint}</span></span>
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#f1efe9] pt-3">
        <button type="button" onClick={onRemove} className="rounded-lg border border-[#e3c4bb] px-3 py-1.5 text-xs font-semibold text-[#8f3f30] hover:bg-[#fff5f1]">
          {t.remove}
        </button>
        <p className="text-[11px] text-[#7a817d]">{t.removeBody}</p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- helpers */

/** Canvas returns the syllabus as HTML; keep table rows so the parser sees tab-separated cells. */
export function htmlToText(html: string): string {
  if (typeof document === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style").forEach((n) => n.remove());
  doc.querySelectorAll("td, th").forEach((cell) => cell.appendChild(doc.createTextNode("\t")));
  doc.querySelectorAll("tr, p, div, li, h1, h2, h3, h4, h5, h6, br, table").forEach((n) => n.appendChild(doc.createTextNode("\n")));
  return (doc.body?.textContent ?? "")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l !== "")
    .join("\n")
    .trim();
}
