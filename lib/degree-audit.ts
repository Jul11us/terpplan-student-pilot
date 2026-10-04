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
  // Credits from the course rows: earned (any passing grade, D included, and transfer credit) and in progress.
  completedCredits: number;
  inProgressCredits: number;
};

const GEN_ED_CODES = new Set<string>(GEN_ED_CATEGORIES.map((item) => item.code));
const COURSE_ID = /^[A-Z]{2,6}\d{3}[A-Z]{0,2}$/;
const COURSE_ROW = /^(?:Fa|Sp|Wi|Su|S1|S2)\d{2}\s+([A-Z]{2,6}\d{3}[A-Z0-9]{0,2})\s+([\d.]+)\s+(\S+)/i;
// Unknown, failing, withdrawn, and incomplete grades must never hide a retake.
// D grades can require a retake for some programs, so only clear passes are hidden.
// TP is a transfer pass: AP, IB, and transfer credit that uAchieve applies like a completed course.
const CLEAR_PASS = /^(?:[ABC][+-]?|P|S|CR|TP)$/;
// Grades that earn credit, for the credit count (a D still counts toward credits earned).
const EARNS_CREDIT = /^(?:[ABCD][+-]?|P|S|CR|TP)$/;
const SECTION = /^\[[\w/]+\]/;
const NEEDS = /^NEEDS:\s*(.+)$/i;
const SELECT = /^SELECT FROM:\s*(.*)$/i;
// Gen Ed codes named in parentheses: "(DSHU)", and "(DSNS or DSNL)" where the first one is used.
const genEdCodesIn = (title: string) => [...title.matchAll(/\(([^()]*)\)/g)]
  .flatMap((group) => group[1].match(/\b[A-Z]{4}\b/g) ?? [])
  .filter((code) => GEN_ED_CODES.has(code));

function cleanLine(value: string) {
  return value.replace(/[\uE000-\uF8FF]/g, "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

const NUMBERED = /^\d+\)\s*(.*)$/;

// Lines that are never part of a requirement's name: course rows, AP placeholders ("XHIST US4"),
// credit tallies, course lists, and the browser's page header and footer.
function isNoise(line: string) {
  if (!line || SECTION.test(line) || NEEDS.test(line) || SELECT.test(line) || COURSE_ROW.test(line)) return true;
  if (/^(IN-P|IN-|PROGRESS|EARNED:|Advanced Placement Exam|https?:|\(\s*[\d.]+\s+CREDITS|OR EQUIVALENTS)/i.test(line)) return true;
  if (/^X[A-Z]{2,5}\b/.test(line) || /^My Audit\b/i.test(line) || /第\s*\d+\s*\/\s*\d+/.test(line)) return true;
  if (/^[A-Z]{2,6}\s+\d{3}\b/.test(line) || /^[\d,\s/]+$/.test(line)) return true;
  if (/^\d{1,4}\/\d{1,2}\/\d{1,4}[,\s]/.test(line) || /^\S.*\s\d+\/\d+$/.test(line)) return true;
  return /\bCREDITS COMPLETED\b|\bCOURSES TAKEN\b|\bCREDITS TAKEN\b/.test(line);
}

// The name of the requirement a NEEDS line belongs to. uAchieve numbers sub-requirements
// ("1) Humanities (DSHU)"), sometimes wraps the name onto the next line ("2) Cultural Competence (DVCC)
// or 2nd" / "Understanding Plural Society (DVUP) course"), and for an empty number puts the name on
// the line above it. Without a number, the nearest heading above is used ("The Big Question (SCIS)").
function labelAbove(lines: string[], index: number) {
  const labels: string[] = [];
  for (let cursor = index - 1; cursor >= Math.max(0, index - 60); cursor--) {
    const line = lines[cursor];
    if (SECTION.test(line) || NEEDS.test(line)) break;
    const numbered = NUMBERED.exec(line);
    if (numbered) {
      const parts = [numbered[1]];
      // A wrapped name continues on the lines right below the number.
      for (let next = cursor + 1; next < index && !isNoise(lines[next]) && parts.length < 3; next++) parts.push(lines[next]);
      // "Principles of Accounting I & II" above an empty " 3)".
      if (!parts.join(" ").trim()) {
        const above = lines.slice(Math.max(0, cursor - 3), cursor).reverse().find((candidate) => !isNoise(candidate) && !NUMBERED.test(candidate));
        if (above) parts.unshift(above);
      }
      const title = parts.join(" ").trim();
      if (title) return title;
      continue;
    }
    if (!isNoise(line)) labels.push(line);
  }
  return labels.find((line) => genEdCodesIn(line).length) ?? labels[0] ?? "Unlabeled requirement";
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
  // A course is listed under every requirement it counts for, so credits are kept once per course.
  const earned = new Map<string, number>();
  const taking = new Map<string, number>();
  for (const line of lines) {
    const row = line.match(COURSE_ROW);
    if (!row) continue;
    const courseId = row[1].toUpperCase();
    const credits = Number(row[2]) || 0;
    const grade = row[3].toUpperCase();
    if (grade === "IP") { inProgress.add(courseId); taking.set(courseId, Math.max(taking.get(courseId) ?? 0, credits)); }
    else {
      if (CLEAR_PASS.test(grade)) completed.add(courseId);
      if (EARNS_CREDIT.test(grade)) earned.set(courseId, Math.max(earned.get(courseId) ?? 0, credits));
    }
  }
  // A repeated course does not earn a second set of credits just because its retake is in progress.
  for (const courseId of earned.keys()) taking.delete(courseId);
  const sum = (values: Map<string, number>) => Math.round([...values.values()].reduce((total, value) => total + value, 0) * 10) / 10;

  const requirements: AuditRequirement[] = [];
  for (let index = 0; index < lines.length; index++) {
    const needMatch = lines[index].match(NEEDS);
    if (!needMatch) continue;
    const title = labelAbove(lines, index);
    const genEdCode = genEdCodesIn(title)[0] ?? null;
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
  return { status, requirements, completedCourseIds: [...completed], inProgressCourseIds: [...inProgress], completedCredits: sum(earned), inProgressCredits: sum(taking) };
}
