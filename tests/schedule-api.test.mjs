import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/schedules/generate/route.ts";

const request = (body) => new Request("http://localhost/api/schedules/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const makeSection = (course, number, start, end) => ({ section_id: `${course}-${number}`, open_seats: 4, instructors: [], meetings: [{ days: "Mon", start_time: start, end_time: end }] });

test("the API rejects malformed constraints before loading course data", async () => {
  assert.equal((await POST(request(null))).status, 400);
  const base = { term: "202601", courseIds: ["CMSC131"] };
  for (const preferences of [{ busyBlocks: [{ id: "x", days: [], start: "12:00", end: "13:00" }] }, { bufferMinutes: -1 }, { bufferMinutes: 1.5 }, { bufferMinutes: "15" }]) assert.equal((await POST(request({ ...base, preferences }))).status, 400);
  assert.equal((await POST(request({ ...base, mode: "alternatives", selectedSectionIds: [] }))).status, 400);
  for (const savedSectionIds of [null, "CMSC131-0101", [null], ["CMSC131-" + "0".repeat(50)], ["MATH140-0101"], ["CMSC131-0101", "CMSC131-0201"], Array(11).fill("CMSC131-0101")]) {
    assert.equal((await POST(request({ ...base, savedSectionIds }))).status, 400);
  }
});

test("the API preserves a validated pick outside its recommendations and honors real exclusions", async () => {
  const originalFetch = globalThis.fetch;
  const sections = Array.from({ length: 4 }, (_, i) => makeSection("PSYC100", `0${i + 1}01`, `${10 + i}:00`, `${10 + i}:50`));
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.match(url.pathname, /^\/v1\/courses\/PSYC100(?:\/sections)?$/);
    return Response.json(url.pathname.endsWith("/sections") ? sections : [{ course_id: "PSYC100", name: "PSYC100", credits: "3" }]);
  };
  try {
    const base = { term: "202601", courseIds: ["PSYC100"] };
    const oldClient = await (await POST(request(base))).json();
    assert.equal(oldClient.options.length, 3, "no new field keeps the existing API behavior");
    const recommended = new Set(oldClient.options.flatMap((option) => option.selectedSections.map((section) => section.section_id)));
    const savedSectionIds = [sections.find((section) => !recommended.has(section.section_id)).section_id];
    const restored = await (await POST(request({ ...base, savedSectionIds }))).json();
    assert.equal(restored.options.length, 4);
    assert.ok(restored.options.some((option) => option.selectedSections.some((section) => section.section_id === savedSectionIds[0])));
    const excluded = await (await POST(request({ ...base, savedSectionIds, sectionFilters: { PSYC100: { excludedSectionIds: savedSectionIds } } }))).json();
    assert.ok(!excluded.options.some((option) => option.selectedSections.some((section) => savedSectionIds.includes(section.section_id))), "saved pick cannot override exclusion");
    const busy = await (await POST(request({ ...base, savedSectionIds, preferences: { busyBlocks: [{ id: "work", label: "PRIVATE LABEL", days: ["Mon"], start: "09:00", end: "15:00" }] } }))).json();
    assert.equal(busy.options.length, 0);
    assert.ok(!JSON.stringify(busy).includes("PRIVATE LABEL"));
  } finally { globalThis.fetch = originalFetch; }
});

test("the API integrates diagnostics, anonymous constraints, persisted pins and replacements", async () => {
  const originalFetch = globalThis.fetch;
  const courses = {
    CMSC131: [makeSection("CMSC131", "0101", "10:00", "10:50"), makeSection("CMSC131", "0201", "14:00", "14:50")],
    MATH140: [makeSection("MATH140", "0101", "11:00", "11:50")],
  };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const match = url.pathname.match(/^\/v1\/courses\/([A-Z0-9]+)(\/sections)?$/);
    assert.ok(match, `Unexpected upstream: ${url.pathname}`);
    const id = match[1];
    return Response.json(match[2] ? courses[id] ?? [] : courses[id] ? [{ course_id: id, name: id, credits: "3" }] : []);
  };
  try {
    const base = { term: "202601", courseIds: ["CMSC131", "MATH140"] };
    const blocked = await (await POST(request({ ...base, preferences: { excludedDays: ["Mon"] } }))).json();
    assert.ok(blocked.diagnostics.some((d) => d.code === "excludedDay"));
    assert.ok(blocked.repairs.some((r) => r.kind === "allowDay"));
    const pinned = await (await POST(request({ ...base, sectionFilters: { CMSC131: { pinnedSectionId: "CMSC131-0101" } }, preferences: { busyBlocks: [{ id: "work", label: "SECRET EVENT", days: ["Mon"], start: "10:00", end: "11:00" }] } }))).json();
    assert.ok(pinned.repairs.some((r) => r.kind === "unpin"));
    assert.ok(!JSON.stringify(pinned).includes("SECRET EVENT"));
    const alternatives = await (await POST(request({ ...base, mode: "alternatives", selectedSectionIds: ["CMSC131-0101", "MATH140-0101"], replaceCourseId: "CMSC131", sectionFilters: { CMSC131: { pinnedSectionId: "CMSC131-0101" } } }))).json();
    assert.equal(alternatives.options[0].selectedSections.find((s) => s.course_id === "CMSC131").section_id, "CMSC131-0201");
    assert.equal(alternatives.options[0].selectedSections.find((s) => s.course_id === "MATH140").section_id, "MATH140-0101");
    const unavailable = await POST(request({ ...base, mode: "alternatives", selectedSectionIds: ["CMSC131-9999", "MATH140-0101"], replaceCourseId: "CMSC131" }));
    assert.equal(unavailable.status, 409);
    const missingCourse = await (await POST(request({ ...base, courseIds: [...base.courseIds, "MISS100"], preferences: { excludedDays: ["Mon"] } }))).json();
    assert.deepEqual(missingCourse.repairs, [], "no repair claim when an upstream course is missing");
  } finally { globalThis.fetch = originalFetch; }
});
