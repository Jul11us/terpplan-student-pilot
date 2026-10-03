import assert from "node:assert/strict";
import test from "node:test";
import { reportMailto } from "../lib/report-link.ts";

test("a problem report names the course, sections and term, and leaves out the page fragment", () => {
  const previous = globalThis.window;
  globalThis.window = { location: { origin: "https://terpplan.com", pathname: "/", hash: "#move=secret-plan" } };
  try {
    const link = reportMailto({ term: "Spring 2027", courseId: "CMSC131", sectionIds: ["CMSC131-0101", "CMSC131-0102"], seatReadAt: "Oct 2, 4:40 PM ET", language: "en" });
    assert.ok(link.startsWith("mailto:terpplan@proton.me?subject="));
    const params = new URLSearchParams(link.split("?")[1]);
    assert.equal(params.get("subject"), "TerpPlan problem: CMSC131 (Spring 2027)");
    const body = params.get("body");
    assert.match(body, /Course: CMSC131\nSections: CMSC131-0101, CMSC131-0102\nTerm: Spring 2027\nSeat data read: Oct 2, 4:40 PM ET\nPage: https:\/\/terpplan.com\//);
    assert.ok(!body.includes("secret-plan"));
    assert.match(new URLSearchParams(reportMailto({ term: "Spring 2027", sectionIds: ["MATH141-0312"], language: "zh" }).split("?")[1]).get("subject"), /^TerpPlan 问题反馈：MATH141-0312/);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
