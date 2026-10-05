import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFillRate,
  calculateVelocity,
  predictDaysToFull,
  calculateDemandIndex,
  analyzeSeatTrend,
  detectOfferingPattern,
  formatOfferingPattern,
  formatTermName,
  calculateTrendDirection,
} from "../lib/seat-trends.ts";

test("calculateFillRate calculates fill rate from snapshots", () => {
  const snapshots = [
    { openSeats: 20, totalSeats: 20, waitlist: 0, checkedAt: "2024-01-01T00:00:00Z" },
    { openSeats: 10, totalSeats: 20, waitlist: 0, checkedAt: "2024-01-02T00:00:00Z" },
    { openSeats: 5, totalSeats: 20, waitlist: 0, checkedAt: "2024-01-03T00:00:00Z" },
  ];
  assert.ok(Math.abs(calculateFillRate(snapshots) - 0.75) < 0.01);
});

test("calculateFillRate returns 0 for insufficient snapshots", () => {
  assert.equal(calculateFillRate([]), 0);
  assert.equal(
    calculateFillRate([{ openSeats: 10, totalSeats: 20, waitlist: 0, checkedAt: "2024-01-01T00:00:00Z" }]),
    0,
  );
});

test("calculateVelocity computes seats per day", () => {
  const snapshots = [
    { openSeats: 20, totalSeats: 20, waitlist: 0, checkedAt: "2024-01-01T00:00:00Z" },
    { openSeats: 10, totalSeats: 20, waitlist: 0, checkedAt: "2024-01-02T00:00:00Z" },
    { openSeats: 0, totalSeats: 20, waitlist: 0, checkedAt: "2024-01-03T00:00:00Z" },
  ];
  assert.ok(Math.abs(calculateVelocity(snapshots) - 10) < 0.1);
});

test("predictDaysToFull predicts when course will fill", () => {
  const currentOpen = 10;
  const velocity = 10; // 10 seats per day
  const result = predictDaysToFull(currentOpen, velocity);
  assert.equal(result, 1);
});

test("calculateDemandIndex returns score based on fill rate and velocity", () => {
  const fillRate = 0.5;
  const velocity = 5;
  const waitlist = 0;
  const totalSeats = 20;
  const index = calculateDemandIndex(fillRate, velocity, waitlist, totalSeats);
  assert.ok(index >= 0);
  assert.ok(index <= 100);
});

test("analyzeSeatTrend produces complete trend analysis", () => {
  const snapshots = [
    { openSeats: 20, totalSeats: 20, waitlist: 0, checkedAt: "2024-01-01T00:00:00Z" },
    { openSeats: 10, totalSeats: 20, waitlist: 0, checkedAt: "2024-01-02T00:00:00Z" },
    { openSeats: 5, totalSeats: 20, waitlist: 0, checkedAt: "2024-01-03T00:00:00Z" },
  ];
  const trend = analyzeSeatTrend("0101", "CMSC131", "202401", snapshots);
  assert.ok(trend !== null);
  assert.ok(trend.fillRate > 0);
  assert.ok(trend.velocity > 0);
  assert.ok(trend.daysToFull !== null);
  assert.ok(trend.demandIndex >= 0);
});

test("detectOfferingPattern identifies yearly pattern", () => {
  const terms = ["202401", "202301", "202201"];
  const pattern = detectOfferingPattern(terms);
  assert.equal(pattern, "every-spring");
});

test("detectOfferingPattern identifies fall/spring pattern", () => {
  const terms = ["202408", "202401", "202308", "202301"];
  const pattern = detectOfferingPattern(terms);
  assert.equal(pattern, "fall-spring");
});

test("formatOfferingPattern formats pattern in English", () => {
  const pattern = "every-spring";
  assert.equal(formatOfferingPattern(pattern, "en"), "Observed in Spring");
});

test("formatOfferingPattern formats pattern in Chinese", () => {
  const pattern = "fall-spring";
  assert.equal(formatOfferingPattern(pattern, "zh"), "已观测到秋季和春季开课");
});

test("formatTermName formats term code to readable name", () => {
  assert.equal(formatTermName("202401", "en"), "Spring 2024");
  assert.equal(formatTermName("202408", "en"), "Fall 2024");
  assert.equal(formatTermName("202401", "zh"), "2024 春季");
  assert.equal(formatTermName("202408", "zh"), "2024 秋季");
});

test("calculateTrendDirection identifies rising trend", () => {
  assert.equal(calculateTrendDirection(120, 100), "rising");
});

test("calculateTrendDirection identifies stable trend", () => {
  assert.equal(calculateTrendDirection(105, 100), "stable");
  assert.equal(calculateTrendDirection(0, 0), "stable");
});

test("short refresh histories cannot predict a daily filling rate", () => {
  const trend = analyzeSeatTrend("CMSC131-0101", "CMSC131", "202701", [0, 10, 20].map((minute, index) => ({ openSeats: 20 - index * 5, totalSeats: 20, waitlist: 0, checkedAt: new Date(Date.UTC(2026, 9, 1, 0, minute)).toISOString() })));
  assert.equal(trend.velocity, 0);
  assert.equal(trend.daysToFull, null);
  assert.ok(trend.demandIndex > 0);
});

test("earlier regular terms step back through fall and spring only", async () => {
  const { previousRegularTerms } = await import("../lib/offering-backfill.ts");
  assert.deepEqual(previousRegularTerms("202701"), ["202608", "202601", "202508", "202501"]);
  assert.deepEqual(previousRegularTerms("202608", 2), ["202601", "202508"]);
  assert.deepEqual(previousRegularTerms("202605", 2), ["202601", "202508"]);
  assert.deepEqual(previousRegularTerms("202612", 2), ["202608", "202601"]);
});

test("a term is upcoming before it starts, current while it runs and past after it ends", async () => {
  const { termStatus } = await import("../lib/offering-backfill.ts");
  assert.equal(termStatus("202701", new Date("2026-10-04T12:00:00Z")), "upcoming");
  assert.equal(termStatus("202608", new Date("2026-10-04T12:00:00Z")), "current");
  assert.equal(termStatus("202601", new Date("2026-10-04T12:00:00Z")), "past");
  assert.equal(termStatus("202512", new Date("2026-01-10T12:00:00Z")), "current");
});

test("the outlook comes from finished semesters only", async () => {
  const { offeringVerdict } = await import("../app/components/offering-history.tsx");
  const term = (status, seats, open, full, sections = 10, code = "202601") => ({ term: code, termName: "x", sectionCount: sections, totalSeats: seats, openSeats: open, fullSections: full, status });
  assert.equal(offeringVerdict([term("past", 500, 10, 8), term("past", 500, 5, 9)]), "full");
  assert.equal(offeringVerdict([term("past", 500, 50, 3)]), "busy");
  assert.equal(offeringVerdict([term("past", 500, 200, 0)]), "room");
  assert.equal(offeringVerdict([term("current", 500, 0, 10), term("upcoming", 500, 0, 10)]), null);
  // Only the same season counts: a spring term is judged by past springs, not by a full fall.
  assert.equal(offeringVerdict([term("upcoming", 500, 500, 0, 10, "202701"), term("past", 500, 5, 9, 10, "202608"), term("past", 500, 200, 0, 10, "202601")]), "room");
});

test("a course counts as one-season only when the other season was checked twice and empty", async () => {
  const { seasonOnly } = await import("../lib/offering-season.ts");
  const term = (code, sectionCount) => ({ term: code, sectionCount });
  assert.equal(seasonOnly([term("202701", 1), term("202608", 0), term("202601", 2), term("202508", 0), term("202501", 1)]), "spring");
  assert.equal(seasonOnly([term("202608", 3), term("202601", 0), term("202508", 2)]), null, "one empty spring is not enough");
  assert.equal(seasonOnly([term("202608", 3), term("202601", 2)]), null);
  assert.equal(seasonOnly([term("202608", 0), term("202601", 0), term("202508", 0)]), null);
  assert.equal(seasonOnly([term("202605", 4), term("202608", 0), term("202508", 0)]), null, "summer is not a regular season");
});

test("registration progress needs readings a day apart and finds when the course was 90% full", async () => {
  const { seatProgress } = await import("../lib/seat-trends.ts");
  const reading = (at, open) => ({ checkedAt: at, openSeats: open, totalSeats: 100 });
  assert.equal(seatProgress([reading("2026-11-01T10:00:00Z", 80)]), null);
  assert.equal(seatProgress([reading("2026-11-01T10:00:00Z", 80), reading("2026-11-01T20:00:00Z", 70)]), null);
  const progress = seatProgress([reading("2026-11-01T10:00:00Z", 80), reading("2026-11-03T10:00:00Z", 30), reading("2026-11-05T10:00:00Z", 8), reading("2026-11-06T10:00:00Z", 5)]);
  assert.deepEqual([progress.firstOpen, progress.lastOpen, progress.daysTo90], [80, 5, 4]);
  assert.equal(seatProgress([reading("2026-11-01T10:00:00Z", 80), reading("2026-11-03T10:00:00Z", 40)]).daysTo90, null);
});

test("the hold file count is read apart from the waitlist", async () => {
  const { parseTestudoSections } = await import("../lib/umd.ts");
  const html = `<div class="section"><input name="sectionId" value="0101"><span class="total-seats-count">31</span><span class="open-seats-count">0</span>
    <span class="seats-info-label"> Waitlist:</span> <span class="waitlist-count">12</span> <span class="seats-info-label">Holdfile:</span> <span class="waitlist-count">3</span></div>`;
  const [section] = parseTestudoSections(html, "BMGT220");
  assert.deepEqual([section.waitlist, section.holdfile], [12, 3]);
  const [plain] = parseTestudoSections(html.replace(/<span class="seats-info-label">Holdfile.*$/s, "</div>"), "BMGT220");
  assert.equal(plain.holdfile, null);
});
