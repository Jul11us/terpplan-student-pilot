import snapshot from "@/data/umd-programs.json";
import { programCodes, type CourseFact, type Program } from "@/lib/programs";

const data = snapshot as unknown as { source: string; builtAt: string; programs: Program[]; courses: Record<string, CourseFact> };
const CACHE = { "cache-control": "public, max-age=3600" };

// GET /api/programs               -> minors and majors to choose from
// GET /api/programs?slug=<minor>  -> the minor's requirements plus facts for its courses and their prerequisites
// GET /api/programs?slug=<major>  -> only the course codes the major lists, used to find overlap
export function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) {
    const list = (kind: Program["kind"]) => data.programs.filter((program) => program.kind === kind && (kind === "minor" || program.items.length)).map(({ slug: id, name }) => ({ slug: id, name }));
    return Response.json({ builtAt: data.builtAt, minors: list("minor"), majors: list("major") }, { headers: CACHE });
  }
  const program = data.programs.find((item) => item.slug === slug);
  if (!program) return Response.json({ error: "Program not found." }, { status: 404 });
  if (program.kind === "major") return Response.json({ slug, name: program.name, codes: programCodes(program) }, { headers: CACHE });

  const courses: Record<string, CourseFact> = {};
  const visit = (code: string) => {
    const fact = data.courses[code];
    if (!fact || courses[code]) return;
    courses[code] = fact;
    fact.pg?.forEach((group) => group.forEach(visit));
  };
  programCodes(program).forEach(visit);
  return Response.json({ builtAt: data.builtAt, program, courses }, { headers: CACHE });
}
