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
