// Builds data/home-reviews.json: short excerpts of real student reviews from PlanetTerp for popular intro
// courses, shown scrolling on the home page (a random mix on each visit, each one linking to its course page).
// Run: node scripts/build-home-reviews.mjs   (a minute or two; rerun once a term)
// Kept: reviews from the last two years that talk about the course itself (exams, homework, lectures...),
// excerpted to a sentence or two. The home page is TerpPlan speaking, so it shows what courses are like rather
// than verdicts on people: only reviews rated 3 or more, and none that tell students to avoid someone, insult
// them or are about how they look. Very short or long ones and shouting are left out too. At most three per
// course, the newest first, from different instructors where possible.
import { writeFileSync } from "node:fs";

const COURSES = ["MATH140", "MATH141", "CMSC131", "CMSC132", "CMSC216", "COMM107", "ENGL101", "PSYC100", "ECON200", "ECON201",
  "STAT400", "BMGT220", "CHEM131", "BSCI170", "PHYS161", "INST126", "HIST200", "ENES100"];
const PER_COURSE = 3;
const MAX_AGE_DAYS = 730;
const ABOUT_COURSE = /\b(homework|assignments?|exams?|midterms?|finals?|quiz(zes)?|lectures?|workload|projects?|office hours|grading|curve|labs?|discussions?|tests?|essays?|papers?|readings?|textbook|practice|study|studying)\b/i;
const NOT_SHOWN = /\b(fuck\w*|shit\w*|damn|ass|bitch\w*|crap|cute|hot|sexy|attractive|ugly|stupid|idiot\w*|dumb|hate|hated|kill|trash|garbage|worst|racist|sexist|wtf|lmao|lol|awful|terrible|horrible|useless|nightmare|boring|bored|rude|avoid|don'?t take|do not take|pick another|any other professor|no passion|learned (literally )?nothing|ridiculous|weird|neglected|horrendous|tedious|slander|slackers|care about teaching|not sure if i (really )?learned|hard to understand|stay engaged|zoned out)\b/i;
const ABBREVIATION = /\b(Dr|Prof|Mr|Ms|Mrs|St|vs)\.$/i;

function excerpt(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  // Sentences, not split after "Dr." and the like.
  const sentences = (clean.match(/[^.!?]+[.!?]+/g) ?? [clean]).reduce((list, part) => {
    if (list.length && ABBREVIATION.test(list[list.length - 1].trim())) list[list.length - 1] += part;
    else list.push(part);
    return list;
  }, []);
  let result = "";
  for (const sentence of sentences) {
    if ((result + sentence).length > 190) break;
    result += sentence;
    if (result.length >= 70) break;
  }
  return result.trim();
}

const reviews = [];
for (const course of COURSES) {
  const response = await fetch(`https://planetterp.com/api/v1/course?name=${course}&reviews=true`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) { console.warn(course, response.status); continue; }
  const data = await response.json();
  const now = Date.now();
  const candidates = (data.reviews ?? []).flatMap((review) => {
    const created = Date.parse(review.created ?? "");
    const rating = Number(review.rating);
    const text = excerpt(String(review.review ?? ""));
    const letters = text.replace(/[^A-Za-z]/g, "");
    if (!Number.isFinite(created) || now - created > MAX_AGE_DAYS * 86_400_000 || !(rating >= 3)) return [];
    if (text.length < 60 || text.length > 190 || !/[.!?]$/.test(text) || ABBREVIATION.test(text)) return [];
    if (!ABOUT_COURSE.test(text) || NOT_SHOWN.test(String(review.review ?? ""))) return [];
    if (letters.length && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.3) return [];
    return [{ course, professor: String(review.professor ?? "").trim() || null, rating, created: new Date(created).toISOString().slice(0, 10), excerpt: text }];
  }).sort((a, b) => b.created.localeCompare(a.created));
  const chosen = [];
  for (const item of candidates) { if (chosen.length >= PER_COURSE) break; if (!chosen.some((other) => other.professor === item.professor)) chosen.push(item); }
  for (const item of candidates) { if (chosen.length >= PER_COURSE) break; if (!chosen.includes(item)) chosen.push(item); }
  reviews.push(...chosen);
  console.log(course, `${chosen.length} of ${candidates.length} usable`);
}

writeFileSync(new URL("../data/home-reviews.json", import.meta.url), JSON.stringify({ builtAt: new Date().toISOString().slice(0, 10), reviews }, null, 1) + "\n");
console.log("saved", reviews.length, "reviews");
