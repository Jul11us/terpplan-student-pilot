import { GEN_ED_CATEGORIES } from "@/lib/gened-categories";
import { classTexts, firstClassText, parseTestudoSections, testudoHtml, type UmdSection } from "@/lib/umd";

// Gen Ed lists always come from Testudo, for every term: it lists a whole category on one page and
// returns sections for many courses per request, while umd.io needs many slow calls for the same data.

export type GenEdCode = (typeof GEN_ED_CATEGORIES)[number]["code"];
export const isGenEdCode = (value: string): value is GenEdCode => GEN_ED_CATEGORIES.some((item) => item.code === value);

export type GenEdCourse = {
  course_id: string;
  name: string;
  credits: string | null;
  genEd: string[];
  sections: UmdSection[];
};

// One category can hold 150+ courses; reuse a result for a while instead of re-reading the source.
const CACHE_MS = 15 * 60_000;
const cache = new Map<string, { expiresAt: number; result: Promise<{ courses: GenEdCourse[]; seatCheckedAt: string }> }>();

// Runs async jobs with a small concurrency limit so the source is not flooded.
async function mapLimited<T, R>(items: T[], limit: number, job: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await job(items[index]!);
    }
  }));
  return results;
}

const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

// Keeps only the section fields the page uses, to keep the response small.
const slimSection = (section: UmdSection): UmdSection => ({
  section_id: section.section_id,
  instructors: section.instructors ?? [],
  seats: section.seats ?? null,
  open_seats: section.open_seats ?? null,
  waitlist: section.waitlist ?? null,
  meetings: (section.meetings ?? []).map((meeting) => ({ days: meeting.days, start_time: meeting.start_time, end_time: meeting.end_time, classtype: meeting.classtype, building: meeting.building, room: meeting.room })),
});

async function testudoGenEd(term: string, code: GenEdCode): Promise<GenEdCourse[]> {
  const html = await testudoHtml(`/gen-ed/${encodeURIComponent(term)}/${code}`);
  const blocks = html.split(/<div id="(?=[A-Z]{4}\d{3}[A-Z]?" class="course")/).slice(1);
  const courses = blocks.map((block) => {
    const courseId = block.slice(0, block.indexOf('"'));
    const min = firstClassText(block, "course-min-credits");
    const max = firstClassText(block, "course-max-credits");
    return {
      course_id: courseId,
      name: firstClassText(block, "course-title") || courseId,
      credits: min ? (max && max !== min ? `${min}–${max}` : min) : null,
      genEd: [...new Set(classTexts(block, "course-subcategory").filter((tag) => /^[A-Z]{4}$/.test(tag)))],
      sections: [] as UmdSection[],
    };
  });
  // The sections page accepts many course IDs at once, the same way Testudo expands sections.
  const byId = new Map(courses.map((course) => [course.course_id, course]));
  await mapLimited(chunk(courses.map((course) => course.course_id), 25), 3, async (ids) => {
    const sectionsHtml = await testudoHtml(`/${encodeURIComponent(term)}/sections?courseIds=${ids.join(",")}`);
    for (const part of sectionsHtml.split(/<div id="(?=[A-Z]{4}\d{3}[A-Z]?" class="course-sections")/).slice(1)) {
      const courseId = part.slice(0, part.indexOf('"'));
      const course = byId.get(courseId);
      if (course) course.sections = parseTestudoSections(part, courseId).map(slimSection);
    }
  });
  return courses;
}

export function getGenEdCourses(term: string, code: GenEdCode) {
  const key = `${term}|${code}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  const result = testudoGenEd(term, code)
    .then((courses) => ({ courses: courses.sort((a, b) => a.course_id.localeCompare(b.course_id)), seatCheckedAt: new Date().toISOString() }));
  // A failed read must not stay cached.
  result.catch(() => cache.delete(key));
  if (cache.size >= 60) cache.delete(cache.keys().next().value!);
  cache.set(key, { expiresAt: Date.now() + CACHE_MS, result });
  return result;
}
