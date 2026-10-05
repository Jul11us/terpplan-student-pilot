// Shared by the server and the browser, so it must not import server code.
// UMD General Education categories. Names follow the Schedule of Classes.
export const GEN_ED_CATEGORIES = [
  { code: "FSAW", en: "Academic Writing", zh: "学术写作" },
  { code: "FSAR", en: "Analytic Reasoning", zh: "分析推理" },
  { code: "FSMA", en: "Math", zh: "数学" },
  { code: "FSOC", en: "Oral Communication", zh: "口头表达" },
  { code: "FSPW", en: "Professional Writing", zh: "专业写作" },
  { code: "DSHS", en: "History and Social Sciences", zh: "历史与社会科学" },
  { code: "DSHU", en: "Humanities", zh: "人文" },
  { code: "DSNS", en: "Natural Sciences", zh: "自然科学" },
  { code: "DSNL", en: "Natural Science Lab", zh: "自然科学（含实验）" },
  { code: "DSSP", en: "Scholarship in Practice", zh: "实践学术" },
  { code: "SCIS", en: "I-Series", zh: "I-Series 课程" },
  { code: "DVCC", en: "Cultural Competence", zh: "文化素养" },
  { code: "DVUP", en: "Understanding Plural Societies", zh: "理解多元社会" },
] as const;

// Testudo lists a course's Gen Ed codes as groups: "DSHS, DVUP" counts for both, while "DSHU or DSSP"
// counts for one of the two (the student's choice). "GenEd: DSHU or DSSP, DVUP" -> [["DSHU", "DSSP"], ["DVUP"]].
export function parseGenEdGroups(text: string): string[][] {
  const codes = text.replace(/^[^:]*GenEd\s*:?/i, "");
  return codes.split(",").map((group) => [...new Set(group.split(/\s+or\s+/i).map((code) => code.trim()).filter((code) => /^[A-Z]{4}$/.test(code)))])
    .filter((group) => group.length > 0);
}

// How many of the wanted categories one course can satisfy at once: each group covers at most one, and two
// groups cannot both use the same category. ["DSHU or DSSP"] with DSHU and DSSP wanted -> 1, not 2.
export function genEdCoverage(groups: string[][], wanted: string[]) {
  const used = new Set<string>();
  let covered = 0;
  // Groups with fewer choices first, so a flexible group does not take a code a strict one needs.
  for (const group of [...groups].sort((a, b) => a.length - b.length)) {
    const pick = group.find((code) => wanted.includes(code) && !used.has(code));
    if (pick) { used.add(pick); covered += 1; }
  }
  return covered;
}
