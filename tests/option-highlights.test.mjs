import assert from "node:assert/strict";
import test from "node:test";
import { optionHighlights } from "../lib/option-highlights.ts";

const option = (extra = {}) => ({ professorRating: 4, gapMinutes: 100, tightWalkCount: 0, campusDays: ["Mon", "Tue", "Wed", "Thu", "Fri"], earliestStart: "9:00am", timeFitPercent: null, ...extra });

test("names what each option does best, only where the options differ", () => {
  const [first, second, third] = optionHighlights([
    option({ professorRating: 3.84, gapMinutes: 110, earliestStart: "10:00am" }),
    option({ professorRating: 3.0, gapMinutes: 110, earliestStart: "12:00pm" }),
    option({ professorRating: 2.49, gapMinutes: 50, earliestStart: "12:00pm" }),
  ]);
  assert.deepEqual(first, ["rating"]);
  assert.deepEqual(second, ["lateStart"]);
  assert.deepEqual(third, ["gaps", "lateStart"]);
});

test("no rushing beats everything else, and a shared quality is not a reason", () => {
  const [first, second] = optionHighlights([option({ tightWalkCount: 0 }), option({ tightWalkCount: 3 })]);
  assert.deepEqual(first, ["noRush"]);
  assert.deepEqual(second, []);
});

test("an identical-looking first option is still called the best balance; a lone option is the only fit", () => {
  assert.deepEqual(optionHighlights([option(), option()]), [["balanced"], []]);
  assert.deepEqual(optionHighlights([option()]), [["onlyOne"]]);
  assert.deepEqual(optionHighlights([]), []);
});
