import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkCatalogMajor, planStatuses, requirementKeys, textRule } from "../lib/major-check.ts";
import { prerequisiteCodes, programCodes } from "../lib/programs.ts";

const facts = {
  AAAA100: { n: "Intro", c: 3 }, AAAA101: { n: "Intro, other", c: 4 }, AAAA200: { n: "Middle", c: 3 },
  AAAA301: { n: "Upper A", c: 3 }, AAAA302: { n: "Upper B", c: 3 }, AAAA303: { n: "Upper C", c: 3 },
  BBBB464: { n: "Excluded", c: 3 }, CCCC100: { n: "Other track", c: 3 },
};

const major = {
  slug: "test--a-major", name: "A Major", kind: "major", url: "https://example.edu", intro: null, apply: null,
  blocks: [{ title: "", role: "always", total: null }, { title: "Track B", role: "choice", total: null }],
  items: [
    { kind: "course", section: "Core", label: "AAAA100 Intro", credits: 3, options: [["AAAA100"], ["AAAA101"]], block: 0 },
    { kind: "course", section: "Core", label: "Note: Students who take AAAA200 must also take another course", credits: null, options: [["AAAA200"]], block: 0 },
    { kind: "choose", section: "Core", label: "Select two of the following:", count: 2, credits: 6, options: [["AAAA301"], ["AAAA302"], ["AAAA303"]], block: 0 },
    { kind: "choose", section: "Electives", label: "Select two 300 or 400 level AAAA courses", count: null, credits: 6, options: [], block: 0 },
    { kind: "choose", section: "Electives", label: "AAAA Courses of Choice (any level)", count: null, credits: 3, options: [], block: 0 },
    { kind: "choose", section: "Electives", label: "Any 400-level BBBB course other than BBBB464", count: null, credits: 3, options: [["BBBB464"]], block: 0 },
    { kind: "course", section: "", label: "CCCC100 Other track", credits: 3, options: [["CCCC100"]], block: 1 },
  ],
};

const plan = (terms) => Object.entries(terms).flatMap(([term, list]) => list.map((id) => ({ id, term: term === "earlier" ? null : term, credits: facts[id]?.c ?? 3 })));
const line = (check, label) => check.lines.find((item) => item.label.startsWith(label));
const ids = (courses) => courses.map((course) => course.id);

test("the plan's terms decide each course's status: before now done, now in progress, later planned", () => {
  const statuses = planStatuses(plan({ earlier: ["AAAA100H"], 202608: ["AAAA200"], 202701: ["AAAA301"] }), "202701");
  assert.equal(statuses.get("AAAA100"), "done", "an honors version stands for its base course");
  assert.equal(statuses.get("AAAA200"), "done");
  assert.equal(statuses.get("AAAA301"), "inProgress");
  assert.equal(planStatuses(plan({ 202708: ["AAAA301"] }), "202701").get("AAAA301"), "planned");
});

test("listed courses are checked, notes are left out, and only the tables that apply count", () => {
  const courses = plan({ earlier: ["AAAA101"], 202608: ["AAAA301"], 202708: ["AAAA303", "AAAA200"] });
  const check = checkCatalogMajor(major, facts, courses, "202608");
  assert.equal(check.lines.some((item) => item.label.startsWith("Note")), false, "the note is not a requirement");
  assert.equal(check.lines.some((item) => item.label.startsWith("CCCC100")), false, "the other track is off by default");
  assert.deepEqual(ids(line(check, "AAAA100").courses), ["AAAA101"], "either alternative meets it");
  assert.deepEqual(line(check, "AAAA100").listed, [["AAAA100"], ["AAAA101"]]);
  const two = line(check, "Select two of the following");
  assert.equal(two.ok, true);
  assert.deepEqual(two.courses.map((course) => [course.id, course.term]), [["AAAA301", "202608"], ["AAAA303", "202708"]]);
  const track = checkCatalogMajor(major, facts, plan({ 202708: ["CCCC100"] }), "202608", { blocks: [0, 1, 7] });
  assert.equal(line(track, "CCCC100").ok, true, "a switched-on table is checked; unknown tables are ignored");
  assert.equal(line(track, "Select two of the following").have, 0);
  assert.deepEqual(line(track, "Select two of the following").options.slice(0, 3), [["AAAA301"], ["AAAA302"], ["AAAA303"]]);
  assert.deepEqual(line(track, "Select two of the following").place, ["AAAA301", "AAAA302", "AAAA303"], "each course can be added to a term");
  assert.deepEqual(line(track, "AAAA100").place, ["AAAA100", "AAAA101"]);
  assert.deepEqual(line(check, "AAAA100").place, [], "met: nothing to add");
  assert.deepEqual(line(check, "Select two 300 or 400").place, [], "a rule in words offers no course");
});

test("rules written as text show the plan's courses in their subject and level, narrower rules first", () => {
  const courses = plan({ 202608: ["AAAA100", "AAAA200"], 202701: ["AAAA301", "AAAA302"], 202708: ["AAAA401", "AAAA402", "BBBB464", "BBBB410"] });
  const check = checkCatalogMajor(major, facts, courses, "202608");
  const upper = line(check, "Select two 300 or 400");
  assert.equal(upper.open, true);
  assert.equal(upper.ok, false, "never checked automatically");
  assert.deepEqual(ids(upper.maybe), ["AAAA401", "AAAA402"], "AAAA301 and AAAA302 already count for the list above");
  assert.deepEqual([upper.maybeHave, upper.maybeNeed, upper.maybeUnit], [6, 6, "credits"]);
  assert.deepEqual(ids(line(check, "AAAA Courses of Choice").maybe), ["AAAA200"], "any level takes what is left");
  const excluded = line(check, "Any 400-level BBBB");
  assert.equal(excluded.open, true, "a rule whose only listed course is the one it leaves out is a rule in words");
  assert.deepEqual(ids(excluded.maybe), ["BBBB410"]);
  assert.equal(check.open, 3);
});

test("ticks are saved by the rule's words, so they survive a rebuilt snapshot that moves rules around", () => {
  const keys = requirementKeys(major);
  assert.equal(new Set(keys).size, keys.length);
  const ticked = [keys[3]];
  const check = checkCatalogMajor(major, facts, [], "202608", { ticked });
  assert.equal(line(check, "Select two 300 or 400").ok, true);
  assert.equal(check.done, 1);
  const moved = { ...major, items: [major.items[3], ...major.items.slice(0, 3), ...major.items.slice(4)] };
  assert.equal(line(checkCatalogMajor(moved, facts, [], "202608", { ticked }), "Select two 300 or 400").ok, true);
  const reworded = { ...major, items: major.items.map((item, index) => index === 3 ? { ...item, label: "Select two upper level AAAA courses" } : item) };
  assert.equal(checkCatalogMajor(reworded, facts, [], "202608", { ticked }).done, 0, "a reworded rule loses its tick");
  const twice = requirementKeys({ items: [major.items[2], major.items[2]] });
  assert.notEqual(twice[0], twice[1], "the same words twice get different keys");
});

test("text rules read subjects and levels the way the catalog writes them", () => {
  const subjects = new Set(["ECON", "GVPT", "PSYC", "CMSC", "STAT"]);
  assert.deepEqual(textRule("Select two 300 or 400 level ECON courses designated for B.A.", subjects).levels, [3, 4]);
  assert.deepEqual(textRule("GVPT Courses of Choice 300-400 level", subjects).levels, [3, 4]);
  assert.deepEqual(textRule("Any 300-level PSYC course or above", subjects).levels, [3, 4]);
  assert.equal(textRule("GVPT Courses of Choice (any level)", subjects).levels, null);
  assert.deepEqual(textRule("three credits from CMSC3XX or CMSC4XX excluding CMSC330 and CMSC351", subjects), { subjects: ["CMSC"], levels: [3, 4], excluded: ["CMSC330", "CMSC351"] });
  assert.equal(textRule("Completion of a foreign language through the elementary level", subjects), null);
});

test("on the catalog snapshot: Biological Sciences takes one of its three math pairs, and both labs for BSCI180", () => {
  const data = JSON.parse(readFileSync(new URL("../data/umd-programs.json", import.meta.url), "utf8"));
  const biology = data.programs.find((item) => item.slug === "computer-mathematical-natural-sciences--biological-sciences");
  const known = {};
  const visit = (code) => { const fact = data.courses[code]; if (!fact || known[code]) return; known[code] = fact; prerequisiteCodes(fact.pr).forEach(visit); };
  programCodes(biology).forEach(visit);
  const check = checkCatalogMajor(biology, known, plan({ earlier: ["MATH140"], 202608: ["MATH141", "BSCI170", "BSCI171"] }), "202608");
  const math = check.lines.filter((item) => item.listed.flat().includes("MATH141"));
  assert.equal(math.length, 1, "the catalog's \"or\" rows are one requirement");
  assert.equal(math[0].ok, true);
  assert.deepEqual(ids(math[0].courses), ["MATH140", "MATH141"]);
  // "( BSCI161 and BSCI171 may count for BSCI180 )": the two labs together, not either one.
  const lab = check.lines.find((item) => item.label.startsWith("BSCI180"));
  assert.deepEqual(lab.listed, [["BSCI180"], ["BSCI161", "BSCI171"]]);
  assert.equal(lab.ok, false, "BSCI171 alone is not enough");
  const both = checkCatalogMajor(biology, known, plan({ 202608: ["BSCI171"], 202701: ["BSCI161"] }), "202608");
  assert.deepEqual(ids(both.lines.find((item) => item.label.startsWith("BSCI180")).courses), ["BSCI161", "BSCI171"]);
});

test("a minor beside the major: what it still needs, and the courses it shares with the major beyond the two allowed", () => {
  const snapshot = JSON.parse(readFileSync(new URL("../data/umd-programs.json", import.meta.url), "utf8"));
  const statistics = snapshot.programs.find((program) => program.slug === "mathematics--statistics-minor");
  const courses = [{ id: "MATH241", term: null, credits: 4 }, { id: "STAT400", term: "202701", credits: 3 }, { id: "STAT401", term: "202708", credits: 3 }];
  const alone = checkCatalogMajor(statistics, snapshot.courses, courses, "202608");
  assert.deepEqual([alone.done, alone.lines.length, alone.overlap, alone.overlapExcess, alone.remainingCredits], [2, 4, [], 0, 6], "STAT430 and one elective are left");
  // A Data Science major counts all three: one more than a minor may share, which takes another course.
  const shared = checkCatalogMajor(statistics, snapshot.courses, courses, "202608", { majorCodes: new Set(["MATH241", "STAT400", "STAT401"]), overlapCap: 2 });
  assert.deepEqual([shared.overlap, shared.overlapExcess, shared.remainingCredits], [["MATH241", "STAT400", "STAT401"], 1, 9]);
  assert.deepEqual(line(shared, "STAT430").place, ["STAT430"]);
});
