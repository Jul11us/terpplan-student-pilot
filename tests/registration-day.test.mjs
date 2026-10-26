import assert from "node:assert/strict";
import test from "node:test";
import {
  countdown, easternMoment, formatCountdown, readRegistrationDay, REGISTRATION_DAY_EVENT, REGISTRATION_DAY_KEY,
  registrationCourseKey, registrationCourses, registrationDayIsSaved, REMINDER_KEY, saveRegistrationSchedule, setRegistrationDone,
  subscribeRegistrationDay, writeRegistrationDay,
} from "../lib/registration-day.ts";

// Each test uses only an in-memory browser; real localStorage and account data are never read.
function browser(t) {
  const previous = globalThis.window;
  const store = () => {
    const values = new Map();
    return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
  };
  const events = new EventTarget();
  globalThis.window = {
    localStorage: store(), sessionStorage: store(),
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events),
  };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  return globalThis.window;
}

const course = (courseId, section = "0101") => ({ courseId, title: courseId + " title", section, full: false, backups: [] });
const schedule = (courses = [course("MATH141"), course("CMSC132")], term = "202701") => ({ term, termName: term, savedAt: "2026-10-26T12:00:00Z", courses, missing: [] });
const storageEvent = (key) => Object.defineProperty(new Event("storage"), "key", { value: key });

test("a registration time is read as Eastern time, in and out of daylight saving", () => {
  assert.equal(easternMoment("2026-11-02", "08:30").toISOString(), "2026-11-02T13:30:00.000Z", "EST, after the clocks go back");
  assert.equal(easternMoment("2026-10-20", "08:30").toISOString(), "2026-10-20T12:30:00.000Z", "EDT");
  assert.equal(easternMoment("2027-03-14", "12:00").toISOString(), "2027-03-14T16:00:00.000Z", "the day the clocks go forward");
  assert.equal(easternMoment("2026-11-02", ""), null);
  assert.equal(easternMoment("Nov 2", "08:30"), null);
});

test("the countdown runs to the time, says it is open for six hours, then that it has passed", () => {
  const target = new Date("2026-11-02T13:30:00Z");
  const left = countdown(target, new Date("2026-10-30T10:00:00Z"));
  assert.deepEqual(left, { state: "upcoming", days: 3, hours: 3, minutes: 30, seconds: 0 });
  assert.equal(formatCountdown(left, "zh"), "3 天 3 小时");
  assert.equal(formatCountdown(countdown(target, new Date("2026-11-02T11:00:00Z")), "en"), "2h 30m");
  assert.equal(formatCountdown(countdown(target, new Date("2026-11-02T13:20:15Z")), "zh"), "9 分 45 秒");
  assert.deepEqual(countdown(target, new Date("2026-11-02T15:00:00Z")), { state: "open" });
  assert.deepEqual(countdown(target, new Date("2026-11-03T13:30:00Z")), { state: "past" });
});

test("each chosen course lists the other options' sections of that course as its backups", () => {
  const section = (course, number, open = 3) => ({ course_id: course, course_title: course + " title", section_id: `${course}-${number}`, open_seats: open });
  const chosen = [section("MATH141", "0131"), section("COMM107", "2201", 0)];
  const others = [[section("MATH141", "0211"), section("COMM107", "2201", 0)], [section("MATH141", "0211"), section("MATH141", "0311", 0), section("PSYC100", "0101")]];
  assert.deepEqual(registrationCourses(chosen, others), [
    { courseId: "MATH141", title: "MATH141 title", section: "0131", full: false, backups: [{ section: "0211", full: false }, { section: "0311", full: true }] },
    { courseId: "COMM107", title: "COMM107 title", section: "2201", full: true, backups: [] },
  ]);
});

test("legacy completion marks migrate to the exact term and sections in their saved snapshot", (t) => {
  const win = browser(t);
  win.localStorage.setItem(REGISTRATION_DAY_KEY, JSON.stringify({
    ...schedule(), done: ["MATH141", registrationCourseKey("202701", "CMSC132", "0101"), "GONE100", "202608:MATH141:0101", 7],
  }));
  const migrated = readRegistrationDay();
  assert.deepEqual(migrated.done, ["202701:MATH141:0101", "202701:CMSC132:0101"]);
  setRegistrationDone("202701", "MATH141", "0101", false);
  assert.deepEqual(JSON.parse(win.localStorage.getItem(REGISTRATION_DAY_KEY)).done, ["202701:CMSC132:0101"], "the next write persists only section-specific marks");
});

test("a changed section loses its completion mark while unchanged sections keep theirs, including legacy data", (t) => {
  const win = browser(t);
  win.localStorage.setItem(REGISTRATION_DAY_KEY, JSON.stringify({ ...schedule(), done: ["MATH141", "CMSC132"] }));
  const changed = saveRegistrationSchedule(schedule([course("MATH141", "0201"), course("CMSC132")]));
  assert.deepEqual(changed.done, ["202701:CMSC132:0101"]);
  assert.deepEqual(readRegistrationDay().courses.map((item) => item.section), ["0201", "0101"]);
  assert.deepEqual(saveRegistrationSchedule(schedule(changed.courses)).done, changed.done, "seat or backup refreshes retain the exact section's mark");
  assert.deepEqual(saveRegistrationSchedule(schedule(changed.courses, "202708")).done, [], "the same course and section in another term start unchecked");
});

test("an old registration tab cannot overwrite a changed section, removed course or newer term", (t) => {
  const win = browser(t);
  saveRegistrationSchedule(schedule());
  const oldTab = readRegistrationDay();
  const newer = saveRegistrationSchedule({ ...schedule([course("MATH141", "0201")]), savedAt: "2026-10-26T13:00:00Z", missing: ["CMSC132"] });
  const before = win.localStorage.getItem(REGISTRATION_DAY_KEY);
  assert.deepEqual(setRegistrationDone(oldTab.term, "MATH141", "0101", true), newer);
  assert.deepEqual(setRegistrationDone(oldTab.term, "CMSC132", "0101", true), newer);
  assert.equal(win.localStorage.getItem(REGISTRATION_DAY_KEY), before, "stale clicks change neither the schedule nor its saved time");
  const nextTerm = saveRegistrationSchedule(schedule([course("MATH141")], "202708"));
  assert.deepEqual(setRegistrationDone(oldTab.term, "MATH141", "0101", true), nextTerm);
  assert.deepEqual(readRegistrationDay(), nextTerm);
});

test("checkbox changes merge into the latest list and preserve another tab's progress and schedule metadata", (t) => {
  browser(t);
  saveRegistrationSchedule(schedule());
  const oldTab = readRegistrationDay();
  setRegistrationDone("202701", "CMSC132", "0101", true);
  const refreshed = saveRegistrationSchedule({ ...schedule(), savedAt: "2026-10-26T13:00:00Z", missing: ["ENGL101"] });
  const both = setRegistrationDone(oldTab.term, "MATH141", "0101", true);
  assert.deepEqual(new Set(both.done), new Set(["202701:CMSC132:0101", "202701:MATH141:0101"]));
  assert.equal(both.savedAt, refreshed.savedAt);
  assert.deepEqual(both.missing, ["ENGL101"]);
  const beforeRepeat = readRegistrationDay();
  assert.deepEqual(setRegistrationDone(oldTab.term, "MATH141", "0101", true), beforeRepeat, "repeated checked intent never toggles another tab's choice off");
  assert.deepEqual(setRegistrationDone(oldTab.term, "MATH141", "0101", false).done, ["202701:CMSC132:0101"]);
});

test("registration subscriptions receive same-tab schedule and checkbox writes, cross-tab changes and reminder updates", (t) => {
  const win = browser(t);
  const seen = [];
  const stop = subscribeRegistrationDay(() => seen.push(readRegistrationDay()));
  saveRegistrationSchedule(schedule());
  setRegistrationDone("202701", "MATH141", "0101", true);
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[1].done, ["202701:MATH141:0101"]);
  win.localStorage.setItem(REGISTRATION_DAY_KEY, JSON.stringify({ ...schedule([course("MATH141", "0201")]), done: [] }));
  win.dispatchEvent(storageEvent(REGISTRATION_DAY_KEY));
  assert.equal(seen.at(-1).courses[0].section, "0201");
  win.dispatchEvent(storageEvent(REMINDER_KEY));
  win.dispatchEvent(storageEvent(null));
  assert.equal(seen.length, 5);
  win.dispatchEvent(storageEvent("unrelated"));
  assert.equal(seen.length, 5);
  stop();
  win.dispatchEvent(new Event(REGISTRATION_DAY_EVENT));
  win.dispatchEvent(storageEvent(REGISTRATION_DAY_KEY));
  assert.equal(seen.length, 5, "unmount removes both listeners");
});

test("registration writes and subscriptions stay in the sample's own storage without a network connection", (t) => {
  const win = browser(t);
  let networkCalls = 0;
  t.mock.method(globalThis, "fetch", () => { networkCalls += 1; throw new Error("Offline"); });
  writeRegistrationDay({ ...schedule(), done: ["202701:MATH141:0101"] });
  const real = win.localStorage.getItem(REGISTRATION_DAY_KEY);
  win.sessionStorage.setItem("terpplan:demo", "1");
  let updates = 0;
  const stop = subscribeRegistrationDay(() => { updates += 1; });
  saveRegistrationSchedule(schedule([course("MATH141", "0201")]));
  setRegistrationDone("202701", "MATH141", "0201", true);
  assert.deepEqual(readRegistrationDay().done, ["202701:MATH141:0201"]);
  assert.equal(win.localStorage.getItem(REGISTRATION_DAY_KEY), real);
  assert.ok(win.localStorage.getItem(REGISTRATION_DAY_KEY + ":demo"));
  assert.equal(updates, 2);
  win.dispatchEvent(storageEvent(REGISTRATION_DAY_KEY));
  assert.equal(updates, 2, "a sample does not refresh from the student's real list");
  win.dispatchEvent(storageEvent(REGISTRATION_DAY_KEY + ":demo"));
  assert.equal(updates, 3);
  stop();
  win.sessionStorage.removeItem("terpplan:demo");
  assert.deepEqual(readRegistrationDay().done, ["202701:MATH141:0101"]);
  assert.equal(networkCalls, 0, "registration progress remains entirely local");
});

test("failed writes retain consecutive checkbox changes in this tab and report that they are unsaved", (t) => {
  const win = browser(t);
  saveRegistrationSchedule(schedule());
  const original = win.localStorage.getItem(REGISTRATION_DAY_KEY);
  const blocked = t.mock.method(win.localStorage, "setItem", () => { throw new Error("Quota exceeded"); });
  let updates = 0;
  const stop = subscribeRegistrationDay(() => { updates += 1; });
  setRegistrationDone("202701", "MATH141", "0101", true);
  const next = setRegistrationDone("202701", "CMSC132", "0101", true);
  assert.deepEqual(new Set(next.done), new Set(["202701:MATH141:0101", "202701:CMSC132:0101"]));
  assert.deepEqual(readRegistrationDay(), next, "a later read of unchanged storage keeps the local draft");
  assert.equal(registrationDayIsSaved(), false);
  assert.equal(win.localStorage.getItem(REGISTRATION_DAY_KEY), original, "the UI must not claim the disk was changed");
  assert.equal(updates, 2, "same-tab listeners also hear failures and can display an unsaved warning");
  blocked.mock.restore();
  assert.equal(writeRegistrationDay(readRegistrationDay()), true, "retry persists the whole draft");
  assert.equal(registrationDayIsSaved(), true);
  assert.deepEqual(new Set(JSON.parse(win.localStorage.getItem(REGISTRATION_DAY_KEY)).done), new Set(next.done));
  stop();
});

test("a temporary read failure retains the loaded list but cannot write a stale snapshot over another tab", (t) => {
  const win = browser(t);
  saveRegistrationSchedule(schedule());
  const loaded = readRegistrationDay();
  const get = t.mock.method(win.localStorage, "getItem", () => { throw new Error("Storage blocked"); });
  const set = t.mock.method(win.localStorage, "setItem");
  assert.deepEqual(readRegistrationDay(), loaded);
  assert.equal(registrationDayIsSaved(), false);
  const draft = setRegistrationDone("202701", "MATH141", "0101", true);
  assert.deepEqual(draft.done, ["202701:MATH141:0101"]);
  assert.equal(set.mock.callCount(), 0, "an unread latest list must never be replaced with the fallback");
  get.mock.restore();
  assert.deepEqual(readRegistrationDay(), draft);
  assert.equal(writeRegistrationDay(readRegistrationDay()), true);
  assert.equal(registrationDayIsSaved(), true);
});

test("newer external schedules and removals take priority over an unsaved local draft", (t) => {
  const win = browser(t);
  saveRegistrationSchedule(schedule());
  const originalSet = win.localStorage.setItem;
  const blocked = t.mock.method(win.localStorage, "setItem", () => { throw new Error("Quota exceeded"); });
  setRegistrationDone("202701", "MATH141", "0101", true);
  const external = { ...schedule([course("MATH141", "0201")], "202708"), done: [], savedAt: "2026-10-26T14:00:00Z" };
  originalSet(REGISTRATION_DAY_KEY, JSON.stringify(external));
  assert.deepEqual(setRegistrationDone("202701", "CMSC132", "0101", true), external);
  assert.equal(registrationDayIsSaved(), true, "the new external list supersedes the failed local draft");
  blocked.mock.restore();
  setRegistrationDone("202708", "MATH141", "0201", true);
  const blockedAgain = t.mock.method(win.localStorage, "setItem", () => { throw new Error("Quota exceeded"); });
  setRegistrationDone("202708", "MATH141", "0201", false);
  win.localStorage.removeItem(REGISTRATION_DAY_KEY);
  assert.equal(readRegistrationDay(), null, "external deletion is authoritative too");
  assert.equal(registrationDayIsSaved(), true);
  blockedAgain.mock.restore();
});

test("unsaved drafts stay separate for the real and sample lists", (t) => {
  const win = browser(t);
  saveRegistrationSchedule(schedule());
  const blocked = t.mock.method(win.localStorage, "setItem", () => { throw new Error("Quota exceeded"); });
  setRegistrationDone("202701", "MATH141", "0101", true);
  win.sessionStorage.setItem("terpplan:demo", "1");
  const demo = saveRegistrationSchedule(schedule([course("MATH141", "0201")]));
  assert.deepEqual(demo.done, []);
  setRegistrationDone("202701", "MATH141", "0201", true);
  assert.deepEqual(readRegistrationDay().done, ["202701:MATH141:0201"]);
  win.sessionStorage.removeItem("terpplan:demo");
  assert.deepEqual(readRegistrationDay().done, ["202701:MATH141:0101"]);
  assert.equal(registrationDayIsSaved(), false);
  blocked.mock.restore();
});
