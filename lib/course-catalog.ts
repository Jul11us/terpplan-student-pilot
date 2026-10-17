// Every course listed in Fall 2026 or Spring 2027, from the two bundled term catalogs
// (scripts/add-catalog-details.mjs), for planning further ahead than one term. A course takes the newer
// term's title, credits, Gen Ed codes and prerequisite when that term lists it; `terms` says which terms do.
// A course the Spring catalog keeps without credits is no longer listed there, so it only counts for Fall.

import fall2026 from "@/data/202608-catalog.json";
import spring2027 from "@/data/202701-catalog.json";
import type { CatalogItem } from "@/lib/umd";

export type CatalogCourse = CatalogItem & { terms: string[] };

const SOURCES: Array<[string, CatalogItem[]]> = [["202701", spring2027 as CatalogItem[]], ["202608", fall2026 as CatalogItem[]]];

let merged: { byId: Map<string, CatalogCourse>; list: CatalogCourse[] } | null = null;

export function catalogCourses() {
  if (merged) return merged;
  const byId = new Map<string, CatalogCourse>();
  for (const [term, courses] of SOURCES) {
    for (const course of courses) {
      if (!course.credits) continue;
      const known = byId.get(course.course_id);
      if (known) known.terms.push(term);
      else byId.set(course.course_id, { ...course, terms: [term] });
    }
  }
  const list = [...byId.values()].sort((a, b) => a.course_id.localeCompare(b.course_id, "en", { numeric: true }));
  for (const course of list) course.terms.sort();
  merged = { byId, list };
  return merged;
}
