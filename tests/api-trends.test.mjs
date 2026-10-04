import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { registerHooks } from "node:module";
import { testDatabase } from "./helpers/d1-sqlite.mjs";

registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export const env = { get DB() { return globalThis.__trendTestDb; } };", shortCircuit: true };
  return next(specifier, context);
} });
const { GET: seats } = await import("../app/api/trends/seats/route.ts");
const { GET: offerings } = await import("../app/api/trends/offerings/route.ts");
const { GET: popular } = await import("../app/api/trends/popular/route.ts");
const { POST: activity } = await import("../app/api/trends/activity/route.ts");
const { recordCourseHistory, getPopularCourses, backfillCourseOfferings } = await import("../lib/history-db.ts");
let database;
let originalFetch;
const request = (path, params) => new Request("https://terpplan.test/api/trends/" + path + "?" + new URLSearchParams(params));
const id = "11111111-1111-4111-8111-111111111111";
const shared = (body, headers = {}) => new Request("https://terpplan.test/api/trends/activity", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

beforeEach(() => {
  database = testDatabase();
  globalThis.__trendTestDb = database;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    // Earlier Testudo semesters: CMSC131 ran every fall and spring except Spring 2025 (not offered);
    // Fall 2025 fails, so it is not stored and is tried again later.
    const term = url.pathname.split("/")[2];
    if (term !== "202701") {
      if (term === "202508") return new Response("busy", { status: 503 });
      if (term === "202501") return new Response("<p>No courses matched your search filters above.</p>");
      const section = (number, seats, open) => `<div class="section"><input name="sectionId" value="${number}"><span class="total-seats-count">${seats}</span><span class="open-seats-count">${open}</span></div>`;
      return new Response(`<div id="CMSC131" class="course"><span class="course-title">Fixture course</span>${section("0101", 30, 0)}${section("0201", 25, 4)}</div><div id="CMSC131H" class="course"><span class="course-title">Honors</span>${section("0101", 99, 50)}</div>`);
    }
    const courseId = url.pathname.split("/").pop();
    return new Response(`<div id="${courseId}" class="course"><span class="course-title">Fixture course</span><div class="section"><input name="sectionId" value="0101"><span class="total-seats-count">20</span><span class="open-seats-count">8</span></div></div>`);
  };
});
afterEach(() => { globalThis.fetch = originalFetch; database.sqlite.close(); delete globalThis.__trendTestDb; });

test("trends routes reject malformed IDs, limits and languages before querying", async () => {
  assert.equal((await seats(request("seats", { term: "bad", sections: "CMSC131-0101" }))).status, 400);
  assert.equal((await seats(request("seats", { term: "202701", sections: "0101" }))).status, 400);
  assert.equal((await seats(request("seats", { term: "202701", sections: "CMSC131-0101;DROP TABLE" }))).status, 400);
  assert.equal((await offerings(request("offerings", { id: "bad" }))).status, 400);
  assert.equal((await offerings(request("offerings", { id: "CMSC131", lang: "fr" }))).status, 400);
  for (const limit of ["NaN", "0", "51", "4oops"]) assert.equal((await popular(request("popular", { term: "202701", limit }))).status, 400);
  assert.equal((await activity(shared({ term: "202701", id: "fake", courseIds: ["CMSC131"] }))).status, 400);
  assert.equal((await activity(shared({ term: "202701", id, courseIds: ["CMSC131"] }, { origin: "https://foreign.test" }))).status, 403);
});

test("real migrated tables store observations once per half hour and keep unknown seats distinct", async () => {
  const section = { section_id: "CMSC131-0101", seats: 20, open_seats: 8, waitlist: 1 };
  await recordCourseHistory("202701", "CMSC131", [section]);
  await recordCourseHistory("202701", "CMSC131", [section]);
  await recordCourseHistory("202701", "CMSC216", [{ section_id: "CMSC216-0101", seats: 20, open_seats: null }]);
  const rows = database.sqlite.prepare("SELECT * FROM seat_history").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].open_seats, 8);
  assert.equal(rows[0].waitlist, 1);
  const response = await offerings(request("offerings", { id: "CMSC131", lang: "zh" }));
  assert.equal(response.status, 200);
  const history = await response.json();
  assert.equal(history.terms[0].termName, "2027 春季");
  assert.equal(history.terms[0].sectionCount, 1);
});

test("offering history reads earlier fall and spring terms once, keeping 'not offered' and retrying failures", async () => {
  await recordCourseHistory("202701", "CMSC131", [{ section_id: "CMSC131-0101", seats: 20, open_seats: 8, waitlist: 0 }]);
  const history = await (await offerings(request("offerings", { id: "CMSC131", lang: "en" }))).json();
  assert.deepEqual(history.terms.map((term) => [term.term, term.sectionCount, term.totalSeats]), [["202701", 1, 20], ["202608", 2, 55], ["202601", 2, 55], ["202501", 0, 0]]);
  assert.equal(history.pattern, "fall-spring");
  // The live term's own row is never replaced by the umd.io numbers.
  assert.equal(database.sqlite.prepare("SELECT section_count AS n FROM course_offerings WHERE term = '202701'").get().n, 1);
  let calls = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => { calls += 1; return previous(input); };
  await offerings(request("offerings", { id: "CMSC131", lang: "en" }));
  assert.equal(calls, 1, "only the failed Fall 2025 is asked again");
});

test("earlier terms keep their final open seats and are read again until the term has ended", async () => {
  const may = new Date("2026-04-01T12:00:00Z");
  await backfillCourseOfferings("CMSC131", ["202601"], may);
  const row = () => database.sqlite.prepare("SELECT section_count, total_seats, open_seats, full_sections, last_seen_at FROM course_offerings WHERE term = '202601'").get();
  assert.deepEqual([row().section_count, row().total_seats, row().open_seats, row().full_sections], [2, 55, 4, 1]);
  // Stored mid-semester: read again a week later, and again after the term ends; then left alone.
  database.sqlite.prepare("UPDATE course_offerings SET open_seats = 9, last_seen_at = ? WHERE term = '202601'").run(may.toISOString());
  await backfillCourseOfferings("CMSC131", ["202601"], new Date("2026-04-03T12:00:00Z"));
  assert.equal(row().open_seats, 9, "not yet a week");
  await backfillCourseOfferings("CMSC131", ["202601"], new Date("2026-06-15T12:00:00Z"));
  assert.equal(row().open_seats, 4, "final numbers after the term ended");
  database.sqlite.prepare("UPDATE course_offerings SET open_seats = 7, last_seen_at = '2026-06-15T12:00:00.000Z' WHERE term = '202601'").run();
  await backfillCourseOfferings("CMSC131", ["202601"], new Date("2027-03-01T12:00:00Z"));
  assert.equal(row().open_seats, 7, "a term read after it ended is final");
  // Rows stored before open seats were kept are filled in.
  database.sqlite.prepare("UPDATE course_offerings SET open_seats = NULL, full_sections = NULL WHERE term = '202601'").run();
  await backfillCourseOfferings("CMSC131", ["202601"], new Date("2027-03-01T12:00:00Z"));
  assert.equal(row().full_sections, 1);
});

test("seat API reads real SQL, excludes other sections and records the current upstream observation", async () => {
  const insert = database.sqlite.prepare("INSERT INTO seat_history VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const [days, open] of [[2, 20], [1, 14]]) insert.run("CMSC131", "CMSC131-0101", "202701", 20, open, 0, new Date(Date.now() - days * 86400000).toISOString());
  insert.run("CMSC216", "CMSC216-0101", "202701", 20, 0, 0, new Date().toISOString());
  const response = await seats(request("seats", { term: "202701", sections: "cmsc131-0101" }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(Object.keys(result.trends), ["CMSC131-0101"]);
  assert.equal(result.trends["CMSC131-0101"].currentOpen, 8);
  assert.equal(result.trends["CMSC131-0101"].snapshots.length, 3);
  assert.ok(result.trends["CMSC131-0101"].velocity > 0);
});

test("sharing counts deduplicate, preserve active plans, and withdraw across all terms", async () => {
  const body = { term: "202701", id, courseIds: ["CMSC131", "CMSC131", "MATH140"] };
  assert.equal((await activity(shared(body))).status, 200);
  const first = database.sqlite.prepare("SELECT added_at FROM plan_activity WHERE course_id = 'CMSC131'").get().added_at;
  assert.equal((await activity(shared(body))).status, 200);
  assert.equal(database.sqlite.prepare("SELECT count(*) AS n FROM plan_activity").get().n, 2);
  assert.equal(database.sqlite.prepare("SELECT added_at FROM plan_activity WHERE course_id = 'CMSC131'").get().added_at, first);
  await activity(shared({ ...body, courseIds: ["CMSC131"] }));
  const result = await popular(request("popular", { term: "202701", limit: "20" }));
  assert.equal(result.status, 200);
  const ranking = await result.json();
  assert.deepEqual(ranking.courses.map((course) => course.courseId), ["CMSC131"]);
  assert.equal(ranking.courses[0].activeCount, 1);
  assert.equal(ranking.courses[0].courseTitle, "Fixture course");
  await activity(shared({ ...body, term: "202608" }));
  await activity(shared({ ...body, courseIds: [], withdraw: true }));
  assert.equal(database.sqlite.prepare("SELECT count(*) AS n FROM plan_activity").get().n, 0);
});

test("popular counts retain long-standing active plans and compare against the actual previous week", async () => {
  const old = new Date(Date.now() - 20 * 86400000).toISOString();
  database.sqlite.prepare("INSERT INTO plan_activity VALUES (?, ?, ?, ?, NULL)").run("CMSC131", "202701", "old-browser", old);
  const courses = await getPopularCourses("202701");
  assert.equal(courses[0].activeCount, 1);
  assert.equal(courses[0].trendDirection, "stable");
});
