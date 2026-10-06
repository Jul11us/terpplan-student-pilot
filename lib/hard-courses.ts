// "Hardest courses to get": courses that were still full when recent terms ran, from data/hard-courses.json
// (built by scripts/build-hard-courses.mjs). A course counts as full in a term when at most 2% of its seats
// (at least one) were left; small courses (under 30 seats) are left out, since a few students fill them.

export type TermSeats = { seats: number; open: number; sections: number; fullSections: number };
export type HardCourseData = { builtAt: string; terms: string[]; courses: Array<{ id: string; title: string; terms: Record<string, TermSeats> }> };

export type HardCourse = {
  id: string;
  title: string;
  department: string;
  level: number;
  // Terms with enough seats to judge, oldest first.
  readings: Array<{ term: string; seats: number; open: number; fill: number; full: boolean; sections: number; fullSections: number }>;
  fullTerms: number;
  averageFill: number;
  averageSeats: number;
};

export const MIN_SEATS = 30;

export function isFull(seats: number, open: number) {
  return open <= Math.max(1, Math.floor(seats * 0.02));
}

export function courseLevel(id: string) {
  return Number(id.slice(4, 5)) * 100;
}

// Courses judged in at least two terms, the ones full every time first; then by size (a big course that is
// always full turns away the most students), and by how full they got.
export function rankHardCourses(data: HardCourseData, minTerms = 2): HardCourse[] {
  const courses: HardCourse[] = [];
  for (const course of data.courses) {
    const readings = data.terms.flatMap((term) => {
      const reading = course.terms[term];
      if (!reading || reading.seats < MIN_SEATS) return [];
      return [{ term, ...reading, fill: Math.min(1, Math.max(0, 1 - reading.open / reading.seats)), full: isFull(reading.seats, reading.open) }];
    });
    if (readings.length < minTerms) continue;
    const fullTerms = readings.filter((reading) => reading.full).length;
    if (!fullTerms) continue;
    courses.push({
      id: course.id,
      title: course.title,
      department: course.id.slice(0, 4),
      level: courseLevel(course.id),
      readings,
      fullTerms,
      averageFill: readings.reduce((sum, reading) => sum + reading.fill, 0) / readings.length,
      averageSeats: Math.round(readings.reduce((sum, reading) => sum + reading.seats, 0) / readings.length),
    });
  }
  const share = (course: HardCourse) => course.fullTerms / course.readings.length;
  return courses.sort((a, b) => share(b) - share(a) || b.fullTerms - a.fullTerms || b.averageSeats - a.averageSeats || b.averageFill - a.averageFill || a.id.localeCompare(b.id));
}
