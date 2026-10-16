import assert from "node:assert/strict";
import test from "node:test";
import { genEdGroupsIn, testudoRelatedCourses } from "../lib/umd.ts";

// Testudo pads the Gen Ed element with a lot of whitespace; the codes come after more than 1500 characters.
const padding = "\t".repeat(2000);
const page = (codes) => `<div class="course-title">X</div><div class="gen-ed-codes-group six columns">${padding}<div>${padding}<span class="course-info-label"><abbr title="General Education"><span>GenEd</span></abbr></span>:${padding}${codes}</div></div><div class="approved-course-texts-container"><div>Credit only granted for: HESP120 or LING200. DSHU in the description is not a code.</div></div>`;
const sub = (code) => `<span class="course-subcategory"><a href="#" title="${code}">${code}</a></span>`;

test("Gen Ed codes are read from the whole element, however much whitespace pads it", () => {
  assert.deepEqual(genEdGroupsIn(page(sub("DSHS"))), [["DSHS"]]);
  assert.deepEqual(genEdGroupsIn(page(`${sub("DSHS")} or ${sub("DSHU")}`)), [["DSHS", "DSHU"]]);
  assert.deepEqual(genEdGroupsIn(page(`${sub("FSAR")}, ${sub("FSMA")}`)), [["FSAR"], ["FSMA"]]);
  assert.deepEqual(genEdGroupsIn("<div class=\"course-title\">No Gen Ed</div>"), []);
});

test("cross-listings and credit-only-once courses are read from the course text", () => {
  const block = `<div class="approved-course-texts-container"><div class="row"><div class="twelve columns"><div class="approved-course-text"><div><div><div class="crosslisted-as"><strong>Cross-listed with:</strong> ENGL234. </div><div><strong>Credit only granted for:</strong> ENGL234, AAAS234 or AASP298L.</div></div></div></div></div></div><div class="row"><div class="approved-course-text">An exploration of AAAS stories.</div></div></div><div class="toggle-sections-link-container"></div>`;
  assert.deepEqual(testudoRelatedCourses(block, "AAAS234"), { crossListed: ["ENGL234"], creditOnlyFor: ["ENGL234", "AASP298L"] });
  assert.deepEqual(testudoRelatedCourses("<div class=\"course-title\">No notes</div>", "AAAS100"), { crossListed: [], creditOnlyFor: [] });
});
