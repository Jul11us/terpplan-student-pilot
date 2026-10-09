// Builds data/rooms.json for the empty-room finder (/rooms): every room on campus that has a class this term,
// with the weekly times it is booked by a class, so the page can show which rooms have no class right now.
// Run: node --import tsx scripts/build-rooms.mjs [term]   (a few minutes; rerun at the start of each term)
// Source: Testudo. The term page lists the departments, each department page its courses, and the
// multi-course sections page (25 courses per request) their meeting days, times, buildings and rooms.
// Online, TBA and unscheduled meetings are left out; a room's size is the largest section that meets there.
import { writeFileSync } from "node:fs";
import { parseTestudoSections } from "../lib/umd.ts";
import { TERM_CALENDARS } from "../lib/term-calendar.ts";
import { dayIndexes, minutes } from "../lib/rooms.ts";

const TERM = process.argv[2] ?? "202608";
const SOC = "https://app.testudo.umd.edu/soc";

async function page(url) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
      if (!response.ok) throw new Error(`Testudo returned ${response.status}`);
      return await response.text();
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
    }
  }
}

// Runs jobs three at a time, to stay gentle on Testudo.
async function pool(items, job) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all([0, 1, 2].map(async () => {
    while (next < items.length) { const index = next++; results[index] = await job(items[index], index); }
  }));
  return results;
}

const index = await page(`${SOC}/${TERM}`);
const departments = [...new Set([...index.matchAll(new RegExp(`href="${TERM}/([A-Z]{4})"`, "g"))].map((match) => match[1]))];
console.log(`${departments.length} departments`);
const courseIds = [...new Set((await pool(departments, async (department) => {
  const html = await page(`${SOC}/${TERM}/${department}`);
  return [...html.matchAll(/<div id="([A-Z]{4}\d{3}[A-Z]?)" class="course"/g)].map((match) => match[1]);
})).flat())];
console.log(`${courseIds.length} courses`);

const batches = [];
for (let start = 0; start < courseIds.length; start += 25) batches.push(courseIds.slice(start, start + 25));
const rooms = new Map();
let done = 0, meetingsKept = 0;
await pool(batches, async (ids) => {
  const html = await page(`${SOC}/${TERM}/sections?courseIds=${ids.join(",")}`);
  const parts = new Map(html.split(/<div id="(?=[A-Z]{4}\d{3}[A-Z]?" class="course-sections")/).slice(1).map((part) => [part.slice(0, part.indexOf('"')), part]));
  for (const id of ids) {
    const part = parts.get(id);
    if (!part) continue;
    for (const section of parseTestudoSections(part, id)) {
      for (const meeting of section.meetings ?? []) {
        const building = (meeting.building ?? "").trim().toUpperCase(), room = (meeting.room ?? "").trim().toUpperCase();
        const start = minutes(meeting.start_time), end = minutes(meeting.end_time), days = dayIndexes(meeting.days);
        if (!/^[A-Z]{2,4}$/.test(building) || building === "ONLINE" || !room || /^(TBA|ONLINE)$/.test(room) || start === null || end === null || end <= start || !days.length) continue;
        const key = `${building} ${room}`;
        const entry = rooms.get(key) ?? { building, room, size: 0, busy: new Set() };
        entry.size = Math.max(entry.size, typeof section.seats === "number" ? section.seats : 0);
        for (const day of days) entry.busy.add(`${day}|${start}|${end}`);
        rooms.set(key, entry);
        meetingsKept += 1;
      }
    }
  }
  done += 1;
  if (done % 25 === 0) console.log(`sections ${done}/${batches.length}`);
});

const calendar = TERM_CALENDARS[TERM] ?? null;
const output = {
  builtAt: new Date().toISOString().slice(0, 10),
  term: TERM,
  calendar,
  // Each room: building code, room number, the largest section that meets there, and its class times as
  // [day (0 = Monday), start, end] in minutes after midnight, sorted.
  rooms: [...rooms.values()]
    .map((entry) => ({ b: entry.building, r: entry.room, s: entry.size, t: [...entry.busy].map((item) => item.split("|").map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]) }))
    .sort((a, b) => a.b.localeCompare(b.b) || a.r.localeCompare(b.r, "en", { numeric: true })),
};
writeFileSync(new URL("../data/rooms.json", import.meta.url), JSON.stringify(output) + "\n");
console.log(`saved ${output.rooms.length} rooms in ${new Set(output.rooms.map((room) => room.b)).size} buildings from ${meetingsKept} meetings`);
