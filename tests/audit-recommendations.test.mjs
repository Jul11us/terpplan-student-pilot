import assert from "node:assert/strict";
import test from "node:test";
import { compareAuditCandidates, summarizeAuditCandidate } from "../lib/audit-recommendations.ts";

test("keeps unknown seat counts distinct from full sections", () => {
  const unknown = summarizeAuditCandidate("CMSC132", "Programming II", 4, [
    { section_id: "CMSC132-0101", open_seats: null },
    { section_id: "CMSC132-FC01", open_seats: 4 },
  ]);
  const open = summarizeAuditCandidate("MATH141", "Calculus II", "4", [
    { section_id: "MATH141-0101", open_seats: "3" },
  ]);
  assert.equal(unknown.sections, 1);
  assert.equal(unknown.knownSeatSections, 0);
  assert.equal(unknown.openSections, 0);
  assert.equal(open.openSeats, 3);
  assert.equal(open.knownSeatSections, 1);
  assert.ok(compareAuditCandidates(open, unknown) < 0);
});
