import assert from "node:assert/strict";
import test from "node:test";
import data from "../data/professor-ratings.json" with { type: "json" };
import { getProfessorSummaries, normalizeProfessorName } from "../lib/planetterp.ts";

test("instructors in the bundled index are answered without PlanetTerp and do not use up the lookup limit", async () => {
  const rated = data.professors.filter((entry) => entry[1] !== null).slice(0, 50);
  const unrated = data.professors.find((entry) => entry[1] === null);
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { calls.push(String(url)); return new Response("[]", { status: 200 }); };
  try {
    const names = [...rated.map((entry) => "  " + entry[0].toUpperCase() + " "), unrated[0], "Nobody Notindexed", "TBA"];
    const results = await getProfessorSummaries(names);
    assert.equal(calls.length, 1, "only the name missing from the index is looked up live");
    assert.ok(calls[0].includes("Nobody"));
    assert.equal(Object.values(results).filter((item) => item.status === "limited").length, 0);
    const first = results[normalizeProfessorName(rated[0][0])];
    assert.deepEqual(first, { name: rated[0][0], matched: true, status: "ok", averageRating: rated[0][1], reviewCount: null, sourceUrl: "https://planetterp.com/professor/" + encodeURIComponent(rated[0][2]) });
    assert.equal(results[normalizeProfessorName(unrated[0])].status, "empty");
    assert.equal(results[normalizeProfessorName("Nobody Notindexed")].status, "unmatched");
    assert.equal(results.tba, undefined, "TBA is not an instructor");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("the index is large enough to be the real PlanetTerp list", () => {
  assert.ok(data.professors.length > 5000);
  assert.match(data.generatedAt, /^\d{4}-\d{2}-\d{2}$/);
});
