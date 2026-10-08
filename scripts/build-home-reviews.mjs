// Builds data/home-reviews.json: short excerpts of real student reviews from PlanetTerp for popular intro
// courses, shown scrolling on the home page (a random mix on each visit, each one linking to its course page).
// Run: node scripts/build-home-reviews.mjs   (a minute or two; rerun once a term)
// Kept: reviews from the last two years that talk about the course itself (exams, homework, lectures...),
// excerpted to a sentence or two, praise and criticism both: up to three reviews rated 4–5 and two rated 2–3
// per course. The home page shows them without instructor names, so criticism reads as what the course was
// like, not as TerpPlan singling someone out. Still left out: insults, telling students to avoid someone,
// remarks on looks, shouting, and casual or misspelled writing that would look careless on the page.
import { writeFileSync } from "node:fs";

const COURSES = ["MATH140", "MATH141", "CMSC131", "CMSC132", "CMSC216", "COMM107", "ENGL101", "PSYC100", "ECON200", "ECON201",
  "STAT400", "BMGT220", "CHEM131", "BSCI170", "PHYS161", "INST126", "HIST200", "ENES100"];
const PRAISE = 3, CRITICISM = 2;
const MAX_AGE_DAYS = 730;
const ABOUT_COURSE = /\b(homework|assignments?|exams?|midterms?|finals?|quiz(zes)?|lectures?|workload|projects?|office hours|grading|curve|labs?|discussions?|tests?|essays?|papers?|readings?|textbook|practice|study|studying)\b/i;
const NOT_SHOWN = /\b(fuck\w*|shit\w*|damn|ass|bitch\w*|crap|cute|hot|sexy|attractive|ugly|stupid|idiot\w*|dumb|hate|hated|kill|trash|garbage|worst|racist|sexist|wtf|lmao|lol|awful|terrible|horrible|useless|nightmare|rude|avoid|don'?t take|do not take|take (him|her|them)|pick another|any other professor|no passion|neglected|ridiculous|weird|slander|slackers|care about teaching|not care|just don'?t|thinks (s?he|they)|poorly|bad (teacher|lecturer|professor)|condescending|learned (literally )?nothing|disaster|ridiculous\w*|insane\w*|brutal|impossible|goat|guy|dude|lady|man)\b/i;
// Casual or misspelled writing (quoted as is, it would look like TerpPlan's own typo).
const CARELESS = /\b(barley|verbatem|alot|definately|recieve|seperate|wierd|untill|arent|isnt|dont|doesnt|didnt|cant|wont|im|ive|u|ur|imo|tbh|gonna|wanna|kinda|sooo+|pls|id|shes|hes|fr|yaps|kaufman|lets)\b|\si\s|!!|\?\?/i;
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
    const full = String(review.review ?? "");
    const text = excerpt(full);
    const letters = text.replace(/[^A-Za-z]/g, "");
    // 1-star reviews are left out: criticism stays, the harshest first impressions do not.
    if (!Number.isFinite(created) || now - created > MAX_AGE_DAYS * 86_400_000 || !(rating >= 2 && rating <= 5)) return [];
    if (text.length < 60 || text.length > 190 || !/^[A-Z"“]/.test(text) || /^\w+( & \w+)?:/.test(text) || !/[.!]$/.test(text) || ABBREVIATION.test(text)) return [];
    if (!ABOUT_COURSE.test(text) || NOT_SHOWN.test(full) || CARELESS.test(text)) return [];
    // A name in the excerpt (the instructor's, or "Dr. ...") would bring the person back in.
    const names = String(review.professor ?? "").split(/\s+/).filter((part) => part.length > 2);
    if (names.some((part) => new RegExp(`\\b${part}\\b`, "i").test(text)) || /\b(Dr|Prof|Professor|Mr|Ms|Mrs)\.?\s+[A-Z]/.test(text)) return [];
    if (letters.length && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.25) return [];
    return [{ course, rating, created: new Date(created).toISOString().slice(0, 10), excerpt: text, professor: String(review.professor ?? "") }];
  }).sort((a, b) => b.created.localeCompare(a.created));
  // The newest of each kind, from different instructors where possible.
  const pick = (list, count) => {
    const chosen = [];
    for (const item of list) { if (chosen.length >= count) break; if (!chosen.some((other) => other.professor === item.professor)) chosen.push(item); }
    for (const item of list) { if (chosen.length >= count) break; if (!chosen.includes(item)) chosen.push(item); }
    return chosen;
  };
  const chosen = [...pick(candidates.filter((item) => item.rating >= 4), PRAISE), ...pick(candidates.filter((item) => item.rating <= 3), CRITICISM)];
  reviews.push(...chosen.map((item) => ({ course: item.course, rating: item.rating, created: item.created, excerpt: item.excerpt })));
  console.log(course, `${chosen.length} (${chosen.filter((item) => item.rating <= 3).length} critical) of ${candidates.length} usable`);
}

writeFileSync(new URL("../data/home-reviews.json", import.meta.url), JSON.stringify({ builtAt: new Date().toISOString().slice(0, 10), reviews }, null, 1) + "\n");
console.log("saved", reviews.length, "reviews,", reviews.filter((item) => item.rating <= 3).length, "critical");
