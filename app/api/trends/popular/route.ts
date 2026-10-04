import { getPopularCourses } from "@/lib/history-db";
import { getCourse } from "@/lib/umd";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const term = url.searchParams.get("term") ?? "";
  const rawLimit = url.searchParams.get("limit") ?? "20";
  if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 50) return Response.json({ error: "Limit must be between 1 and 50." }, { status: 400 });
  const limit = Number(rawLimit);

  if (!/^\d{6}$/.test(term)) {
    return Response.json({ error: "Choose a valid term." }, { status: 400 });
  }

  try {
    const popular = await getPopularCourses(term, limit);
    
    // Enrich with course titles
    const enriched = await Promise.all(
      popular.map(async (item) => {
        try {
          const courseData = await getCourse(item.courseId, term);
          const courseName = courseData?.course && typeof courseData.course === 'object' && 'name' in courseData.course
            ? String(courseData.course.name)
            : item.courseId;
          return { ...item, courseTitle: courseName };
        } catch {
          return { ...item, courseTitle: item.courseId };
        }
      }),
    );

    return Response.json({ term, courses: enriched });
  } catch (error) {
    console.error("Popular courses error:", error);
    return Response.json({ error: "Popular courses could not be loaded. Try again shortly." }, { status: 503 });
  }
}
