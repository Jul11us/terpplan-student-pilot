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
