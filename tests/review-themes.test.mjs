import assert from "node:assert/strict";
import test from "node:test";
import { reviewThemes, themesInReview } from "../lib/review-themes.ts";

test("themes come from what reviews say, with negation flipping to the opposite theme", () => {
  assert.deepEqual([...themesInReview("Super clear lectures and very helpful in office hours. Exams were hard though.")].sort(), ["clear", "hardExams", "helpful"]);
  // "kind of hard" is not "kind", and "not helpful" counts against, not for.
  assert.deepEqual([...themesInReview("She is not helpful at all and the class is kind of hard.")], ["unhelpful"]);
  assert.deepEqual([...themesInReview("I would not recommend this professor.")], ["avoid"]);
  assert.deepEqual([...themesInReview("Lectures are not boring; he explains well.")].sort(), ["clear", "engaging"]);
  assert.deepEqual([...themesInReview("Notes help you avoid confusion. Unclear what the curve is.")].sort(), ["curve", "unclear"]);
});

test("a theme needs two reviews once there are five or more, and the most common come first", () => {
  const reviews = ["Very helpful.", "Helpful and clear.", "Clear but hard exams.", "Helpful TA too.", "Boring lectures."];
  assert.deepEqual(reviewThemes(reviews).map((theme) => [theme.key, theme.count, theme.tone]), [["helpful", 3, "good"], ["clear", 2, "good"]]);
  assert.deepEqual(reviewThemes(["Boring."]).map((theme) => theme.key), ["boring"]);
  assert.deepEqual(reviewThemes([]), []);
});
