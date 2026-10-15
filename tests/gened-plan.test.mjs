import assert from "node:assert/strict";
import test from "node:test";
import { DIVERSITY, diversityDefault, diversityNeeds, fillOptions, needSlots, planGenEds, sectionsFit } from "../lib/gened-plan.ts";

const mwf = (start, end) => [{ days: "MWF", start_time: start, end_time: end }];
const course = (id, groups, score, sections = [[]], extra = {}) => ({ id, groups, score, sections, ...extra });
const ids = (plan) => plan.picks.map((pick) => pick.id).sort();

test("the ways one course can count: one code per group, the student's pick of an \"or\", a lab as a science", () => {
  assert.deepEqual(fillOptions([["DSHU", "DSSP"], ["DVUP"]], ["DSHU", "DSSP", "DVUP"]), [["DSSP", "DVUP"], ["DSHU", "DVUP"]].map((o) => o.sort()).reverse());
  assert.deepEqual(fillOptions([["DSHU"], ["DVUP"], ["SCIS"]], ["DVUP"]), [["DVUP"]]);
  assert.deepEqual(fillOptions([["DSNL"]], ["DSNS"]), [["DSNS"]], "a lab course is also a natural-science course");
  assert.deepEqual(fillOptions([["DSNL"]], ["DSNL", "DSNS"]).sort(), [["DSNL"], ["DSNS"]], "but not both at once");
  assert.deepEqual(fillOptions([["FSAW"]], ["DSHU"]), []);
});

test("fewest courses first: one course that counts three ways and one that counts two cover five needs", () => {
  const pool = [
    course("A", [["DSHU"], ["DVUP"], ["SCIS"]], 3), course("B", [["DSHU"], ["DVUP"]], 3.5),
    course("C", [["DSHU"]], 4), course("D", [["DVUP"]], 3.9), course("E", [["SCIS"]], 3),
  ];
  const result = planGenEds({ DSHU: 2, DVUP: 2, SCIS: 1 }, pool);
  assert.deepEqual(ids(result.plans[0]), ["A", "B"]);
  assert.deepEqual(result.plans[0].picks.find((pick) => pick.id === "A").covers.sort(), ["DSHU", "DVUP", "SCIS"]);
  assert.ok(result.plans.every((plan) => plan.picks.length === 2), "only the smallest sets are offered");
  assert.deepEqual(result.uncovered, []);
});

test("courses whose sections all clash are not put together; the next smallest set is used", () => {
  const pool = [
    course("A", [["DSHU"], ["DVUP"], ["SCIS"]], 3, [mwf("10:00am", "10:50am")]), course("B", [["DSHU"], ["DVUP"]], 3.5, [mwf("10:00am", "10:50am")]),
    course("C", [["DSHU"]], 4, [mwf("11:00am", "11:50am")]), course("D", [["DVUP"]], 3.9, [mwf("1:00pm", "1:50pm")]), course("E", [["SCIS"]], 3, [mwf("2:00pm", "2:50pm")]),
  ];
  const best = planGenEds({ DSHU: 2, DVUP: 2, SCIS: 1 }, pool).plans[0];
  assert.deepEqual(ids(best), ["A", "C", "D"]);
  assert.ok(sectionsFit([pool[0], { ...pool[1], sections: [mwf("10:00am", "10:50am"), mwf("3:00pm", "3:50pm")] }]), "another section of B would fit");
  assert.ok(sectionsFit([pool[0], { ...pool[1], sections: [[]] }]), "a section with no set time fits anything");
});

test("plan courses count first, and needs nothing this term covers are reported", () => {
  const pool = [course("PLAN1", [["DSHU"]], 3, undefined, { inPlan: true }), course("H1", [["DSHU"]], 3.2), course("I1", [["SCIS"]], 3)];
  const result = planGenEds({ DSHU: 2, SCIS: 2, DSNL: 1 }, pool);
  assert.deepEqual(result.fromPlan, [{ id: "PLAN1", needs: ["DSHU"], covers: ["DSHU"] }]);
  assert.equal(result.total, 5);
  assert.deepEqual(result.plans[0].lines.map((line) => [line.need, line.id, line.fromPlan]), [
    ["DSHU", "PLAN1", true], ["DSHU", "H1", false], ["SCIS", "I1", false], ["SCIS", null, false], ["DSNL", null, false],
  ], "every need, in the order given, with what fills it");
  assert.deepEqual(ids(result.plans[0]), ["H1", "I1"]);
  assert.deepEqual(result.uncovered.sort(), ["DSNL", "SCIS"], "one SCIS course this term, and no lab");
});

test("an \"or\" counts once; a lab science can fill the plain science need", () => {
  const orResult = planGenEds({ DSHU: 1, DSSP: 1 }, [course("F", [["DSHU", "DSSP"]], 3.8), course("G", [["DSSP"]], 3)]);
  assert.deepEqual(orResult.plans[0].picks.map((pick) => [pick.id, pick.covers]).sort(), [["F", ["DSHU"]], ["G", ["DSSP"]]]);
  const lab = planGenEds({ DSNL: 1, DSNS: 1 }, [course("L1", [["DSNL"]], 3), course("L2", [["DSNL"]], 2.9, [mwf("9:00am", "9:50am")]), course("N", [["DSNS"]], 1, [mwf("9:00am", "9:50am")])]);
  assert.deepEqual(ids(lab.plans[0]), ["L1", "L2"]);
  assert.deepEqual(lab.plans[0].picks.flatMap((pick) => pick.needs).sort(), ["DSNL", "DSNS"]);
  assert.deepEqual(lab.plans[0].picks.flatMap((pick) => pick.covers), ["DSNL", "DSNL"], "both are lab courses; one fills the science need");
});

test("up to three different sets, best score first, and nothing needed means no plan", () => {
  const pool = ["P", "Q", "R", "S", "T"].map((id, index) => course(id, [["DSHS"], ["DVUP"]], 3 + index / 10, [mwf(`${index + 8}:00am`, `${index + 8}:50am`)]));
  const result = planGenEds({ DSHS: 1, DVUP: 1 }, pool);
  assert.equal(result.plans.length, 3);
  assert.deepEqual(result.plans.map((plan) => ids(plan)), [["T"], ["S"], ["R"]]);
  assert.deepEqual(planGenEds({}, pool), { total: 0, fromPlan: [], plans: [], uncovered: [], lines: [] });
});

test("Diversity is two DVUP courses or one DVUP and one DVCC; one course never fills both", () => {
  assert.deepEqual(needSlots({ DVUP: 2 }), { DVUP: 1, [DIVERSITY]: 1 });
  assert.deepEqual(needSlots({ DVUP: 1, DVCC: 1 }), { DVUP: 1, [DIVERSITY]: 1 });
  assert.deepEqual(needSlots({ DVCC: 1 }), { [DIVERSITY]: 1 }, "a second Diversity course can be either kind");
  const pool = [course("U1", [["DVUP"]], 3), course("C1", [["DSHU"], ["DVCC"]], 3.9), course("U2", [["DVUP"]], 2.5)];
  const best = planGenEds({ DVUP: 2, DSHU: 1 }, pool).plans[0];
  assert.deepEqual(best.picks.map((pick) => [pick.id, pick.needs, pick.covers]).sort(), [["C1", ["DIV", "DSHU"], ["DVCC", "DSHU"]], ["U1", ["DVUP"], ["DVUP"]]]);
  const dvccOnly = planGenEds({ DVCC: 1 }, [course("U3", [["DVUP"]], 3.5), course("C2", [["DVCC"]], 3)]).plans[0];
  assert.deepEqual(dvccOnly.picks.map((pick) => [pick.id, pick.covers]), [["U3", ["DVUP"]]], "a DVUP course also does");
  const both = planGenEds({ DVUP: 2 }, [course("X", [["DVUP"], ["DVCC"]], 3)]);
  assert.deepEqual(both.plans[0].picks.map((pick) => pick.needs), [["DVUP"]]);
  assert.deepEqual(both.uncovered, [DIVERSITY], "the same course cannot be both Diversity courses");
});

test("picking DVUP and DVCC is one Diversity requirement: what is left follows what the student has taken", () => {
  assert.equal(diversityDefault(["DSHU", "DVUP", "DVCC"]), "none", "both lines of an audit: nothing taken yet");
  assert.equal(diversityDefault(["DVCC"]), "DVUP", "only the second line: one DVUP taken");
  assert.equal(diversityDefault(["DVUP"]), "DVCC", "only the first line: one DVCC taken");
  assert.equal(diversityDefault(["DSHU"]), null);
  assert.deepEqual(needSlots(diversityNeeds("none")), { DVUP: 1, [DIVERSITY]: 1 }, "two courses, at most one DVCC");
  assert.deepEqual(needSlots(diversityNeeds("DVUP")), { [DIVERSITY]: 1 }, "one more of either kind");
  assert.deepEqual(needSlots(diversityNeeds("DVCC")), { DVUP: 1 }, "one more DVUP");
  const pool = [course("U", [["DVUP"]], 3), course("C", [["DVCC"]], 3.5)];
  assert.deepEqual(ids(planGenEds(diversityNeeds("DVUP"), pool).plans[0]), ["C"]);
  assert.deepEqual(ids(planGenEds(diversityNeeds("DVCC"), pool).plans[0]), ["U"]);
  assert.deepEqual(ids(planGenEds(diversityNeeds("none"), pool).plans[0]), ["C", "U"]);
});
