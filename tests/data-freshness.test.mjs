// The bundled snapshots are rebuilt by hand, once a term (or once a catalog year). This fails when one has gone
// too long without it, so CI says which script to run instead of the site quietly serving old data.
// The limits leave room for a term plus the break: a file rebuilt at the start of a term passes until the next.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const DAY = 86_400_000;
const SNAPSHOTS = [
  { file: "professor-ratings.json", days: 150, run: "node scripts/build-professor-ratings.mjs" },
  { file: "home-reviews.json", days: 150, run: "node scripts/build-home-reviews.mjs" },
  { file: "hard-courses.json", days: 150, run: "node --import tsx scripts/build-hard-courses.mjs" },
  { file: "rooms.json", days: 150, run: "node --import tsx scripts/build-rooms.mjs [term]" },
  { file: "umd-programs.json", days: 400, run: "node scripts/build-programs.mjs" },
];

for (const { file, days, run } of SNAPSHOTS) {
  test(`data/${file} was rebuilt within ${days} days`, () => {
    const { builtAt } = JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), "utf8"));
    assert.match(String(builtAt), /^\d{4}-\d{2}-\d{2}$/, `data/${file} has no builtAt date`);
    const age = Math.floor((Date.now() - Date.parse(builtAt)) / DAY);
    assert.ok(age <= days, `data/${file} was built ${age} days ago (${builtAt}). Rebuild it: ${run}`);
  });
}
