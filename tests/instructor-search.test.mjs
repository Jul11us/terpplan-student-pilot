import assert from "node:assert/strict";
import test from "node:test";
import { instructorWords, nameMatches, offerInstructors, searchInstructors, MAX_INSTRUCTORS } from "../lib/instructor-search.ts";
import { GET } from "../app/api/instructor/search/route.ts";

test("what counts as an instructor name", () => {
  assert.deepEqual(instructorWords("@Kauffman"), ["kauffman"]);
  assert.deepEqual(instructorWords("  Chris  Kauf "), ["chris", "kauf"]);
  assert.deepEqual(instructorWords("Wyss-Gallifent"), ["wyss", "gallifent"]);
  assert.equal(instructorWords("CMSC131"), null, "course codes have digits");
  assert.equal(instructorWords("ab"), null, "too short");
  assert.equal(instructorWords("a b c d e"), null, "too many words");
  assert.ok(nameMatches("Christopher Kauffman", ["chris", "kauf"]));
  assert.ok(nameMatches("Justin Wyss-Gallifent", ["gallif"]));
  assert.ok(!nameMatches("Linda Kauffman", ["chris", "kauf"]));
});

test("instructors are offered after @ and for names, but not for a department the course search answers", () => {
  assert.equal(offerInstructors("@math", ["MATH140"]), true);
  assert.equal(offerInstructors("math", ["MATH140", "MATH141"]), false);
  assert.equal(offerInstructors("chen", []), true);
  assert.equal(offerInstructors("calculus", ["MATH140"]), true, "a title word may also be a name; PlanetTerp decides");
  assert.equal(offerInstructors("MATH140", []), false);
});

test("each typed word is looked up, and a name must contain every word", async () => {
  const asked = [];
  // "chris" alone fills PlanetTerp's 100 names without reaching Kauffman; "kauf" finds him.
  const lists = {
    chris: Array.from({ length: 100 }, (_, index) => ({ type: "professor", name: `Chris Adams${index}` })),
    kauf: [{ type: "professor", name: "Ashlie Kauffman" }, { type: "professor", name: "Christopher Kauffman" }, { type: "course", name: "CMSC216" }, { type: "ta", name: "Chris Kauffmann" }],
  };
  const fetcher = async (url) => { const word = new URL(url).searchParams.get("query"); asked.push(word); return Response.json(lists[word] ?? []); };
  assert.deepEqual(await searchInstructors("chris kauf", fetcher), { results: [{ name: "Christopher Kauffman" }, { name: "Chris Kauffmann" }], more: false });
  assert.deepEqual(asked.sort(), ["chris", "kauf"]);
  const many = async () => Response.json(Array.from({ length: 20 }, (_, index) => ({ type: "professor", name: `Ann Nelson${index}` })));
  const nelsons = await searchInstructors("nelson", many);
  assert.equal(nelsons.results.length, MAX_INSTRUCTORS);
  assert.equal(nelsons.more, true);
  await assert.rejects(searchInstructors("nelson", async () => new Response("down", { status: 502 })));
});

test("the API answers non-names with nothing and does not call PlanetTerp", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("should not be called"); };
  try {
    assert.deepEqual(await (await GET(new Request("https://terpplan.test/api/instructor/search?q=CMSC131"))).json(), { results: [], more: false });
    assert.deepEqual(await (await GET(new Request("https://terpplan.test/api/instructor/search?q=x"))).json(), { results: [], more: false });
    assert.equal((await GET(new Request("https://terpplan.test/api/instructor/search?q=nelson"))).status, 503, "an upstream failure is an error, not an empty list");
  } finally { globalThis.fetch = original; }
});
