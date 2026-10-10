// "Import from Testudo": the student copies their Testudo schedule page (or its print view) and pastes it.
// Only course codes, section numbers and the term name are read from the text; times and rooms come from
// TerpPlan's own section data. The pasted text also holds the student's name and UID, so it is read in the
// browser only and never stored or sent anywhere.

export type PastedSection = { courseId: string; section: string };

const SEASONS: Record<string, string> = { SPRING: "01", SUMMER: "05", FALL: "08", WINTER: "12" };

// "CMSC 131 (0302)" on the schedule page; "CMSC131 0302" or "CMSC131-0302" typed or from other pages.
const SECTION = /\b([A-Z]{4})\s?(\d{3}[A-Z]?)\s*(?:\(\s*([A-Z0-9]{4})\s*\)|[-\s]\s*([A-Z0-9]{4})\b)/g;

// One section per course, in the order they first appear.
export function parsePastedSchedule(text: string): { sections: PastedSection[]; term: string | null } {
  const upper = text.toUpperCase();
  const sections: PastedSection[] = [];
  for (const match of upper.matchAll(SECTION)) {
    const courseId = match[1] + match[2];
    const section = match[3] ?? match[4];
    // A section number always has a digit (0101, FC01); this skips "MATH141 LECT" and the like.
    if (!/\d/.test(section) || sections.some((item) => item.courseId === courseId)) continue;
    sections.push({ courseId, section });
  }
  return { sections, term: pastedTerm(upper) };
}

// "Fall 2026" -> "202608". Winter belongs to the year before it ends: Winter 2027 is term 202612.
export function pastedTerm(text: string): string | null {
  const match = text.toUpperCase().match(/\b(SPRING|SUMMER|FALL|WINTER)\s+(20\d{2})\b/);
  if (!match) return null;
  const year = Number(match[2]) - (match[1] === "WINTER" ? 1 : 0);
  return `${year}${SEASONS[match[1]]}`;
}
