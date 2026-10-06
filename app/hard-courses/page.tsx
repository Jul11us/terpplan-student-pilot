import data from "@/data/hard-courses.json";
import { rankHardCourses, type HardCourseData } from "@/lib/hard-courses";
import { HardCoursesList } from "@/app/components/hard-courses-list";

// Ranked on the server so the page ships only the list, not the whole seat file.
const ranked = rankHardCourses(data as HardCourseData).slice(0, 500);

export default function HardCoursesPage() {
  return <HardCoursesList courses={ranked} terms={(data as HardCourseData).terms} builtAt={(data as HardCourseData).builtAt} />;
}
