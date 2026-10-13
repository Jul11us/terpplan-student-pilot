// Instructor names for the planner's search box ("@Kauffman", or a name typed like a course search), from
// PlanetTerp's search. PlanetTerp matches one piece of a name ("chris kauf" finds nobody) and stops at 100
// names ("chris" alone has more), so each typed word is looked up and a name must contain every word.

const SEARCH_URL = "https://planetterp.com/api/v1/search";
export const MAX_INSTRUCTORS = 6;

export type InstructorMatch = { name: string };
export type InstructorSearch = { results: InstructorMatch[]; more: boolean };

// The words of a name query, or null when the text is not one (a course code, digits, too short).
export function instructorWords(text: string): string[] | null {
  const plain = text.trim().replace(/^@\s*/, "");
  if (plain.length < 3 || plain.length > 60 || /\d/.test(plain) || !/^[\p{L} .'-]+$/u.test(plain)) return null;
  // "O'Brien" and "Wyss-Gallifent" are looked up by their pieces, as PlanetTerp names are split below.
  const words = plain.toLocaleLowerCase("en-US").split(/[\s.'-]+/).filter(Boolean);
  return words.length && words.length <= 4 ? words : null;
}

export function nameMatches(name: string, words: string[]) {
  const parts = name.toLocaleLowerCase("en-US").split(/[\s.'-]+/).filter(Boolean);
  return words.every((word) => parts.some((part) => part.startsWith(word)));
}

async function lookUp(word: string, fetcher: typeof fetch) {
  const response = await fetcher(`${SEARCH_URL}?${new URLSearchParams({ query: word, limit: "100" })}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(7_000) });
  if (!response.ok) throw new Error(`PlanetTerp search returned ${response.status}.`);
  const rows = await response.json() as unknown;
  if (!Array.isArray(rows)) throw new Error("PlanetTerp search returned an unexpected body.");
  return rows
    .filter((row): row is { type: string; name: string } => Boolean(row) && typeof row === "object" && typeof (row as { name?: unknown }).name === "string" && ["professor", "ta"].includes((row as { type?: unknown }).type as string))
    .map((row) => row.name.trim());
}

// Up to MAX_INSTRUCTORS names, in PlanetTerp's order; `more` when others match too (type more of the name).
export async function searchInstructors(text: string, fetcher: typeof fetch = fetch): Promise<InstructorSearch> {
  const words = instructorWords(text);
  const probes = [...new Set(words ?? [])].filter((word) => word.length >= 2).slice(0, 3);
  if (!words || !probes.length) return { results: [], more: false };
  const found = (await Promise.all(probes.map((word) => lookUp(word, fetcher)))).flat();
  const names = [...new Set(found.filter((name) => name && nameMatches(name, words)))];
  return { results: names.slice(0, MAX_INSTRUCTORS).map((name) => ({ name })), more: names.length > MAX_INSTRUCTORS };
}

// Whether to offer instructors for what was typed: always after "@"; otherwise not for a department code that
// the course search already answers ("math" lists MATH courses, not Mathew and Mathis).
export function offerInstructors(text: string, courseIds: string[]) {
  const plain = text.trim();
  if (plain.startsWith("@")) return instructorWords(plain) !== null;
  if (!instructorWords(plain)) return false;
  const department = plain.toUpperCase();
  return !(/^[A-Z]{4}$/.test(department) && courseIds.some((id) => id.startsWith(department)));
}
