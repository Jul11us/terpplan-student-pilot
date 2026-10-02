// Open-seat counts for a list of courses, for the search results list. Testudo's sections page takes many
// course IDs at once, so a page of results costs one or two requests instead of one per course.
// Freshman Connection sections are left out: they are only open to students in that program, and the
// planner skips them unless the student opts in.

import { isFreshmanConnection } from "@/lib/planner";
import { isTestudoTerm, parseCount, parseTestudoSections, testudoHtml } from "@/lib/umd";

export type SeatSummary = {
  sections: number; // sections other than Freshman Connection
  openSections: number; // of those, sections with at least one open seat
  openSeats: number; // open seats across sections whose count is known
  unknownSections: number; // sections Testudo gave no seat count for
};

const CACHE_MS = 60_000;
const BATCH = 25;
const cache = new Map<string, { expiresAt: number; summary: SeatSummary }>();

export function summarizeSeats(sections: Array<{ section_id?: string; number?: string; open_seats?: string | number | null }>): SeatSummary {
  const summary: SeatSummary = { sections: 0, openSections: 0, openSeats: 0, unknownSections: 0 };
  for (const section of sections) {
    if (isFreshmanConnection(section)) continue;
    summary.sections += 1;
    const open = parseCount(section.open_seats);
    if (open === null) summary.unknownSections += 1;
    else if (open > 0) { summary.openSections += 1; summary.openSeats += open; }
  }
  return summary;
}

export async function seatSummaries(term: string, courseIds: string[]): Promise<Record<string, SeatSummary>> {
  // Only the Testudo term has live seat counts; older terms come from umd.io, where seats are history.
  if (!isTestudoTerm(term)) return {};
  const now = Date.now();
  const result: Record<string, SeatSummary> = {};
  const missing: string[] = [];
  for (const id of courseIds) {
    const hit = cache.get(`${term}|${id}`);
    if (hit && hit.expiresAt > now) result[id] = hit.summary;
    else missing.push(id);
  }
  for (let start = 0; start < missing.length; start += BATCH) {
    const ids = missing.slice(start, start + BATCH);
    const html = await testudoHtml(`/${encodeURIComponent(term)}/sections?courseIds=${ids.join(",")}`);
    const parts = new Map(html.split(/<div id="(?=[A-Z]{4}\d{3}[A-Z]?" class="course-sections")/).slice(1)
      .map((part) => [part.slice(0, part.indexOf('"')), part] as const));
    for (const id of ids) {
      const part = parts.get(id);
      // A course with no sections block has no sections offered this term.
      const summary = summarizeSeats(part ? parseTestudoSections(part, id) : []);
      result[id] = summary;
      if (cache.size >= 2000) cache.delete(cache.keys().next().value!);
      cache.set(`${term}|${id}`, { expiresAt: now + CACHE_MS, summary });
    }
  }
  return result;
}
