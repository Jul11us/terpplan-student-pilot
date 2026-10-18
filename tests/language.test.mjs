import assert from "node:assert/strict";
import test from "node:test";

import { browserLanguage } from "../lib/language.ts";

test("the browser's language decides a page with no saved choice", () => {
  assert.equal(browserLanguage(["zh-CN"]), "zh");
  assert.equal(browserLanguage(["zh-Hant-TW"]), "zh");
  assert.equal(browserLanguage(["en-US"]), "en");
  assert.equal(browserLanguage(["fr-FR"]), "en", "other languages read the English site");
  assert.equal(browserLanguage([]), "en", "no tag at all is English");
});
