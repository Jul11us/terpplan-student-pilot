import { GEN_ED_CATEGORIES } from "@/lib/gened-categories";

export type AuditRequirement = {
  id: string;
  title: string;
  need: string;
  courseIds: string[];
  genEdCode: string | null;
};

export type AuditResult = {
  status: "complete" | "in_progress" | "unknown";
  requirements: AuditRequirement[];
  completedCourseIds: string[];
  inProgressCourseIds: string[];
};

const GEN_ED_CODES = new Set<string>(GEN_ED_CATEGORIES.map((item) => item.code));
const COURSE_ID = /^[A-Z]{2,6}\d{3}[A-Z]{0,2}$/;
const COURSE_ROW = /^(?:Fa|Sp|Wi|Su|S1|S2)\d{2}\s+([A-Z]{2,6}\d{3}[A-Z0-9]{0,2})\s+[\d.]+\s+(\S+)/i;
// Unknown, failing, withdrawn, and incomplete grades must never hide a retake.
// D grades can require a retake for some programs, so only clear passes are hidden.
const CLEAR_PASS = /^(?:[ABC][+-]?|P|S|CR)$/;
const SECTION = /^\[[\w/]+\]/;
const NEEDS = /^NEEDS:\s*(.+)$/i;
const SELECT = /^SELECT FROM:\s*(.*)$/i;
const GEN_ED_IN_TITLE = /\(([A-Z]{4})\)/g;

function cleanLine(value: string) {
  return value.replace(/[\uE000-\uF8FF]/g, "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function isLabel(line: string) {
  if (!line || SECTION.test(line) || NEEDS.test(line) || SELECT.test(line) || COURSE_ROW.test(line)) return false;
  if (/^(IN-P|IN-|PROGRESS|EARNED:|Advanced Placement Exam|https?:|\d+\)|\(\s*[\d.]+\s+CREDITS)/i.test(line)) return false;
  if (/^\d{1,4}\/\d{1,2}\/\d{1,4}[,\s]/.test(line) || /^\S.*\s\d+\/\d+$/.test(line)) return false;
  if (/\bCREDITS COMPLETED\b|\bCOURSES TAKEN\b/.test(line)) return false;
  return true;
}

function labelAbove(lines: string[], index: number) {
  const labels: string[] = [];
  for (let cursor = index - 1; cursor >= Math.max(0, index - 15); cursor--) {
    const line = lines[cursor];
    if (SECTION.test(line) || NEEDS.test(line)) break;
    if (isLabel(line)) labels.push(line);
  }
  return labels.find((line) => [...line.matchAll(GEN_ED_IN_TITLE)].some((match) => GEN_ED_CODES.has(match[1]))) ?? labels[0] ?? "Unlabeled requirement";
}

// uAchieve lists a department once and then uses abbreviated numbers, e.g. CMSC 426,460.
export function parseCourseIds(value: string) {
  const found: string[] = [];
  let department = "";
  for (const match of value.toUpperCase().matchAll(/\b([A-Z]{2,6})\s*(\d{3}[A-Z]{0,2})\b|\b(\d{3}[A-Z]{0,2})\b/g)) {
    if (match[1]) department = ["AND", "OR", "FROM", "COURSE", "CREDITS"].includes(match[1]) ? "" : match[1];
    const id = department + (match[2] ?? match[3] ?? "");
    if (COURSE_ID.test(id) && !found.includes(id)) found.push(id);
  }
  return found;
}

export function parseDegreeAudit(text: string): AuditResult {
  const lines = text.replace(/\r/g, "").split("\n").map(cleanLine);
  const status = text.includes("ALL REQUIREMENTS IDENTIFIED BELOW HAVE BEEN MET") ? "complete"
    : text.includes("AT LEAST ONE REQUIREMENT HAS NOT BEEN SATISFIED") ? "in_progress" : "unknown";
  const completed = new Set<string>();
  const inProgress = new Set<string>();
  for (const line of lines) {
    const row = line.match(COURSE_ROW);
    if (!row) continue;
    const courseId = row[1].toUpperCase();
    const grade = row[2].toUpperCase();
    if (grade === "IP") inProgress.add(courseId);
    else if (CLEAR_PASS.test(grade)) completed.add(courseId);
  }

  const requirements: AuditRequirement[] = [];
  for (let index = 0; index < lines.length; index++) {
    const needMatch = lines[index].match(NEEDS);
    if (!needMatch) continue;
    const title = labelAbove(lines, index);
    const genEdCode = [...title.matchAll(GEN_ED_IN_TITLE)].map((match) => match[1]).find((code) => GEN_ED_CODES.has(code)) ?? null;
    const candidateLines: string[] = [];
    let inSelect = false;
    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 12); cursor++) {
      const line = lines[cursor];
      if (NEEDS.test(line) || SECTION.test(line)) break;
      const select = line.match(SELECT);
      if (select) { inSelect = true; candidateLines.push(select[1]); continue; }
      if (inSelect) {
        if (!line || /^[A-Z]{2,6}\s/.test(line) || /^[\d,\s/]+$/.test(line)) candidateLines.push(line);
        else break;
      } else if (line) break;
    }
    requirements.push({
      id: `requirement-${requirements.length + 1}`,
      title,
      need: needMatch[1],
      courseIds: parseCourseIds(candidateLines.join(" ")),
      genEdCode,
    });
  }
  return { status, requirements, completedCourseIds: [...completed], inProgressCourseIds: [...inProgress] };
}
