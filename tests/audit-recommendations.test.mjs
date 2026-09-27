import assert from "node:assert/strict";
import test from "node:test";
import { compareAuditCandidates, compareAuditCandidatesByGpa, summarizeAuditCandidate } from "../lib/audit-recommendations.ts";

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

test("defaults to open seats and uses GPA only when explicitly selected", () => {
  const manySeats = { ...summarizeAuditCandidate("HIST110", "History", 3, [{ section_id: "HIST110-0101", open_seats: 15 }]), averageGpa: 2.8 };
  const highGpa = { ...summarizeAuditCandidate("INST104", "Information", 3, [{ section_id: "INST104-0101", open_seats: 2 }]), averageGpa: 3.75 };
  const noSeats = { ...summarizeAuditCandidate("ENES200", "Engineering", 3, [{ section_id: "ENES200-0101", open_seats: 0 }]), averageGpa: 3.9 };
  assert.deepEqual([highGpa, noSeats, manySeats].sort(compareAuditCandidates).map((item) => item.courseId), ["HIST110", "INST104", "ENES200"]);
  assert.deepEqual([highGpa, noSeats, manySeats].sort(compareAuditCandidatesByGpa).map((item) => item.courseId), ["ENES200", "INST104", "HIST110"]);
});
