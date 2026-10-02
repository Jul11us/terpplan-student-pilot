import assert from "node:assert/strict";
import test from "node:test";
import { buildReminderIcs } from "../lib/ics.ts";

test("the registration reminder is one Eastern-time event with two alerts", () => {
  const ics = buildReminderIcs({ date: "2026-11-09", time: "08:30" }, { summary: "Register for Spring 2027", description: "CMSC216 0104\nMATH141 0312", url: "https://app.testudo.umd.edu/" }, new Date("2026-10-02T12:00:00Z"));
  const unfolded = ics.replace(/\r\n /g, "");
  assert.match(unfolded, /DTSTART;TZID=America\/New_York:20261109T083000\r\n/);
  assert.match(unfolded, /DTEND;TZID=America\/New_York:20261109T090000\r\n/);
  assert.match(unfolded, /DESCRIPTION:CMSC216 0104\\nMATH141 0312/);
  assert.equal((unfolded.match(/BEGIN:VALARM/g) ?? []).length, 2);
  assert.match(unfolded, /TRIGGER:-P1D/);
  assert.match(unfolded, /TRIGGER:-PT15M/);
  assert.ok(ics.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75));
  assert.throws(() => buildReminderIcs({ date: "11/09/2026", time: "8:30" }, { summary: "", description: "", url: "" }));
});
