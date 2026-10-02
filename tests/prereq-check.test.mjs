import assert from "node:assert/strict";
import test from "node:test";
import { courseSet, unmetRequirements, describeRequirement } from "../lib/prereq-check.ts";
import { GET } from "../app/api/prereqs/route.ts";

test("ordinary prerequisites must precede the plan while concurrent requirements may be in it", () => {
  const planned = courseSet(["CMSC131", "MATH140"]);
  assert.deepEqual(unmetRequirements(["&", "CMSC131", "~MATH140"], courseSet([]), planned), ["CMSC131"]);
  assert.deepEqual(unmetRequirements(["&", "CMSC131", "~MATH140"], courseSet(["cmsc131a"]), planned), []);
});

test("alternatives, course thresholds and higher courses preserve the missing requirement", () => {
  const rule = ["&", ["|", "CMSC131", "CMSC133"], [2, "MATH140", "STAT400", "MATH141"], "MATH113+"];
  assert.deepEqual(unmetRequirements(rule, courseSet(["CMSC133", "MATH140"])), [[2, "MATH140", "STAT400", "MATH141"]]);
  assert.deepEqual(unmetRequirements(rule, courseSet(["CMSC133", "MATH140", "STAT400"])), []);
  assert.deepEqual(unmetRequirements("MATH113+", courseSet(["CMSC216"])), ["MATH113+"]);
  const labels = { orHigher: " or higher", sameTerm: " (same term OK)", of: k => `${k} of` };
  assert.equal(describeRequirement(["&", ["|", "CMSC131", "CMSC133"], "~MATH140"], labels), "(CMSC131 / CMSC133) + MATH140 (same term OK)");
});

test("prerequisite API returns catalog rules without requiring a student's course history", async () => {
  const response = await GET(new Request("https://example.test/api/prereqs?term=202701&ids=cmsc132,MATH141,cmsc132"));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.rules.CMSC132, ["&", ["|", "CMSC131", "CMSC133"], "MATH140"]);
  assert.equal(payload.rules.MATH141, "MATH140");
  assert.equal(Object.keys(payload.rules).length, 2);
  const historical = await GET(new Request("https://example.test/api/prereqs?term=202608&ids=CMSC132"));
  assert.deepEqual((await historical.json()).rules, {});
});

test("prerequisite API rejects invalid inputs before returning any catalog rules", async () => {
  for (const query of ["term=bad&ids=CMSC132", "term=202701&ids=", "term=202701&ids=invalid"]) {
    assert.equal((await GET(new Request(`https://example.test/api/prereqs?${query}`))).status, 400);
  }
});
