import test from "node:test";
import assert from "node:assert/strict";
import { getCourse, getCourseSectionsSnapshot } from "../lib/umd.ts";

const courseBlock = (id, name, credits, note, section, building) => `
<div id="${id}" class="course">
  <span class="course-title">${name}</span>
  <span class="course-min-credits">${credits}</span>
  <div class="approved-course-texts-container">
    <div class="course-text">${note}</div>
  </div>
  <div class="toggle-sections-link-container"></div>
  <div class="section">
    <input name="sectionId" value="${section}">
    <span class="total-seats-count">30</span>
    <span class="open-seats-count">12</span>
    <div class="section-day-time-group">
      <span class="section-days">MW</span>
      <span class="class-start-time">11:00am</span>
      <span class="class-end-time">12:15pm</span>
      <span class="class-building">${building}</span>
    </div>
  </div>
</div>`;

test("Testudo prefix matches keep each exact course's metadata and sections separate", async () => {
  const html = courseBlock("BMGT220", "Accounting", 3, "24 completed credits required.", "0101", "VMH")
    + courseBlock("BMGT220L", "Accounting Fellows", 1, "Fellows only.", "0201", "LEF");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(html, { headers: { "content-type": "text/html" } });
  try {
    const main = await getCourse("BMGT220", "202701");
    assert.equal(main.course.name, "Accounting");
    assert.equal(main.course.credits, 3);
    assert.deepEqual(main.sections.map(s => s.section_id), ["BMGT220-0101"]);
    assert.equal(main.sections[0].meetings[0].building, "VMH");
    assert.deepEqual(main.course.requirements.map(r => r.text), ["24 completed credits required."]);

    const suffix = await getCourse("BMGT220L", "202701");
    assert.equal(suffix.course.name, "Accounting Fellows");
    assert.equal(suffix.course.credits, 1);
    assert.deepEqual(suffix.sections.map(s => s.section_id), ["BMGT220L-0201"]);
    assert.equal(suffix.sections[0].meetings[0].building, "LEF");
    assert.deepEqual(suffix.course.requirements.map(r => r.text), ["Fellows only."]);

    const snapshot = await getCourseSectionsSnapshot("BMGT220", "202701");
    assert.deepEqual(snapshot.sections, main.sections);
    assert.equal(await getCourse("BMGT221", "202701"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
