import assert from "node:assert/strict";
import test from "node:test";
import { shareMetadata } from "../lib/share-metadata.ts";

const query = (params) => new URLSearchParams(params);

test("a shared link's preview names its term and courses, in the sender's language", () => {
  const zh = shareMetadata(query({ term: "202701", sections: "CMSC330-0101,STAT400-0121", lang: "zh" }));
  assert.equal(zh.title, "2027 春季课表 · CMSC330、STAT400 · TerpPlan");
  assert.match(zh.description, /共 2 门课/);
  const en = shareMetadata(query({ term: "202701", sections: "CMSC330-0101", lang: "en" }));
  assert.equal(en.title, "Spring 2027 schedule · CMSC330 · TerpPlan");
  assert.match(en.description, /: 1 course\./);
});

test("long lists are cut after four courses; broken links fall back to the site's preview", () => {
  const many = shareMetadata(query({ term: "202608", sections: "CMSC131-0101,MATH140-0111,ENGL101-0201,PSYC100-0101,HIST200-0101,ARTH200-0101", lang: "en" }));
  assert.equal(many.title, "Fall 2026 schedule · CMSC131, MATH140, ENGL101, PSYC100 +2 · TerpPlan");
  assert.equal(shareMetadata(query({ term: "202701", sections: "not-a-section", lang: "en" })), null);
  assert.equal(shareMetadata(query({})), null);
});
