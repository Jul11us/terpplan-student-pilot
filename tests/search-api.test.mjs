import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/search/route.ts";

test("spaced and compact exact course codes return the same matching course", async () => {
  for (const [course, queries] of [["CHEM134", ["chem 134", "CHEM134", " chem   134 "]], ["ENEE150", ["enee 150", "ENEE150", "EnEe 150"]]]) {
    for (const query of queries) {
      const response = await GET(new Request(`https://example.test/api/search?q=${encodeURIComponent(query)}&term=202701`));
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).results.map((item) => item.course_id), [course], query);
    }
  }
});

test("department and title searches still return matching courses", async () => {
  const department = await (await GET(new Request("https://example.test/api/search?q=chem&term=202701"))).json();
  assert.ok(department.results.length > 1);
  assert.ok(department.results.some((course) => course.course_id === "CHEM134"));
  assert.ok(department.results[0].course_id.startsWith("CHEM"));
  const title = await (await GET(new Request("https://example.test/api/search?q=calculus&term=202701"))).json();
  assert.ok(title.results.some((course) => course.course_id === "MATH140"));
});
