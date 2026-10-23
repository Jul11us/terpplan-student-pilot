import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { registerHooks } from "node:module";
import { testDatabase } from "./helpers/d1-sqlite.mjs";

registerHooks({ resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export const env = { get DB() { return globalThis.__fillRiskTestDb; } };", shortCircuit: true };
  return next(specifier, context);
} });
const { courseFillRisk } = await import("../lib/fill-risk.ts");
const { GET: fillRisk } = await import("../app/api/fill-risk/route.ts");
const { recordCourseOffering } = await import("../lib/history-db.ts");

const startedAt = "2026-04-01T10:00:00.000Z";
const race = (term, hours, seats = 120, seen = true) => ({ term, startedAt: seen ? startedAt : null, filledAt: new Date(Date.parse(startedAt) + hours * 3_600_000).toISOString(), totalSeats: seats });
const ending = (term, seats, open, sections, fullSections) => ({ term, sectionCount: sections, totalSeats: seats, openSeats: open, fullSections });

let database;
beforeEach(() => { database = testDatabase(); globalThis.__fillRiskTestDb = database; });
afterEach(() => { database.sqlite.close(); delete globalThis.__fillRiskTestDb; });

const request = (params) => new Request("https://terpplan.test/api/fill-risk?" + new URLSearchParams(params));

test("how fast a course filled sets the level, from the fastest term seen", () => {
  assert.deepEqual(courseFillRisk([race("202608", 3)], []), { level: "hours", hours: 3, term: "202608" });
  assert.deepEqual(courseFillRisk([race("202608", 6)], []), { level: "hours", hours: 6, term: "202608" }, "six hours is still 'in hours'");
  assert.deepEqual(courseFillRisk([race("202608", 20)], []), { level: "day", hours: 20, term: "202608" });
  assert.deepEqual(courseFillRisk([race("202608", 70)], []), { level: "days", hours: 70, term: "202608" });
  assert.deepEqual(courseFillRisk([race("202608", 70), race("202601", 4)], []), { level: "hours", hours: 4, term: "202601" }, "the fastest term wins");
});

test("a race slower than three days defers to how full the endings were, and no evidence says null", () => {
  assert.equal(courseFillRisk([race("202608", 100)], []), null, "it filled, but there is nothing urgent to say");
  assert.deepEqual(courseFillRisk([race("202608", 100)], [ending("202601", 200, 0, 5, 5)]), { level: "full", hours: null, term: "202601" });
  assert.equal(courseFillRisk([], [ending("202601", 200, 40, 5, 1)]), null, "plenty of seats left at the end");
});

test("full before TerpPlan watched counts as full, small courses are left out", () => {
  assert.deepEqual(courseFillRisk([race("202608", 2, 120, false)], []), { level: "full", hours: null, term: "202608" }, "filled, but the start was not seen");
  assert.equal(courseFillRisk([race("202608", 2, 20)], []), null, "under 30 seats: a few students fill a seminar");
  assert.equal(courseFillRisk([], [ending("202601", 20, 0, 1, 1)]), null);
  assert.deepEqual(courseFillRisk([], [ending("202601", 100, 1, 4, 4)]), { level: "full", hours: null, term: "202601" }, "at most 2% left, or every section full");
});

test("the route rejects bad terms and course lists before reading anything", async () => {
  assert.equal((await fillRisk(request({ term: "bad", courses: "CMSC131" }))).status, 400);
  assert.equal((await fillRisk(request({ term: "202701", courses: "" }))).status, 400);
  assert.equal((await fillRisk(request({ term: "202701", courses: "NOPE" }))).status, 400);
  assert.equal((await fillRisk(request({ term: "202701", courses: Array.from({ length: 13 }, (_, index) => `CMSC1${String(index).padStart(2, "0")}`).join(",") }))).status, 400);
});


test("the route reads the races and endings of earlier terms, and answers null for the rest", async () => {
  database.sqlite.prepare("INSERT INTO course_fill (term, course_id, base_taken, total_seats, started_at, filled_at, last_at) VALUES (?, ?, 0, ?, ?, ?, ?)")
    .run("202608", "CMSC351", 120, "2026-04-01T10:00:00.000Z", "2026-04-01T13:00:00.000Z", "2026-04-01T13:00:00.000Z");
  await recordCourseOffering("CMSC216", "202601", 4, 140, 0, 4);
  const response = await fillRisk(request({ term: "202701", courses: "CMSC351,CMSC216,ZZZZ999" }));
  assert.equal(response.status, 200);
  const { risk } = await response.json();
  assert.deepEqual(risk.CMSC351, { level: "hours", hours: 3, term: "202608" });
  assert.equal(risk.CMSC216.level, "full");
  assert.equal(risk.ZZZZ999, null);
});

test("the note's number matches its unit, an hour is said in words, and Chinese has no stray spaces", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { FillRiskNote } = await import("../app/components/fill-risk-note.tsx");
  const note = (risk, language, compact = false) => renderToStaticMarkup(createElement(FillRiskNote, { risk, language, compact }));
  assert.match(note({ level: "days", hours: 70, term: "202608" }, "en"), /within about 3 days after TerpPlan first observed seats being taken in Fall 2026/, "70 hours is about 3 days, measured from the first observed increase");
  assert.match(note({ level: "days", hours: 25, term: "202608" }, "en"), /within about 2 days/, "over a day, rounded up");
  assert.match(note({ level: "days", hours: 70, term: "202608" }, "zh"), /2026 秋季首次观测到座位被选走后，约 3 天内满员/);
  assert.match(note({ level: "hours", hours: 0.6, term: "202608" }, "en"), /within about an hour after/);
  assert.match(note({ level: "hours", hours: 3.2, term: "202608" }, "en"), /within about 3 hours after/);
  assert.match(note({ level: "hours", hours: 3.2, term: "202608" }, "zh"), /2026 秋季首次观测到座位被选走后，约 3 小时就满了/);
  for (const level of ["hours", "day", "days", "full"]) {
    const html = note({ level, hours: level === "full" ? null : 30, term: "202608" }, "zh");
    assert.doesNotMatch(html, /秋季 /, `no space after the term name (${level})`);
  }
  const full = note({ level: "full", hours: null, term: "202601" }, "zh", true);
  assert.match(full, /曾经满员/);
  assert.doesNotMatch(full, /经常/, "one full term does not make it 'often'");
  assert.match(note({ level: "full", hours: null, term: "202601" }, "en", true), /Filled up before/);
});

test("a failed lookup is not kept: asking again tries again, and a good answer is kept", async () => {
  const { loadFillRisks } = await import("../app/components/fill-risk-note.tsx");
  const realFetch = globalThis.fetch;
  const answer = { CMSC351: { level: "hours", hours: 3, term: "202608" } };
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return calls === 1 ? new Response("{}", { status: 503 }) : Response.json({ term: "202701", risk: answer }); };
  try {
    assert.equal(await loadFillRisks("202701", ["CMSC351"]), null, "the 503 answers nothing");
    assert.deepEqual(await loadFillRisks("202701", ["CMSC351"]), answer, "asked again, it is fetched again");
    assert.deepEqual(await loadFillRisks("202701", ["CMSC351"]), answer);
    assert.equal(calls, 2, "once it worked, the answer is kept");
  } finally {
    globalThis.fetch = realFetch;
  }
});
