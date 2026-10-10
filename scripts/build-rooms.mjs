// Builds data/rooms.json for the empty-room finder (/rooms): every room on campus that has a class this term,
// with the weekly times it is booked by a class, so the page can show which rooms have no class right now.
// Run: node --import tsx scripts/build-rooms.mjs [term]   (a few minutes; rerun at the start of each term)
// Source: Testudo. The term page lists the departments, each department page its courses, and the
// multi-course sections page (25 courses per request) their meeting days, times, buildings and rooms.
// Online, TBA and unscheduled meetings are left out; a room's size is the largest section that meets there.
// Then UMD 25Live (the campus room-booking system, read without signing in): each room it schedules gets its
// 25Live id (so /rooms can use that day's real bookings, exams and events included) and its official capacity,
// and its general-purpose classrooms with no class this term are added.
// --live-only: keep data/rooms.json's Testudo part and only redo the 25Live part (seconds instead of minutes).
import { readFileSync, writeFileSync } from "node:fs";
import { parseTestudoSections } from "../lib/umd.ts";
import { TERM_CALENDARS } from "../lib/term-calendar.ts";
import { dayIndexes, minutes } from "../lib/rooms.ts";

const LIVE_ONLY = process.argv.includes("--live-only");
const TERM = process.argv.slice(2).find((arg) => /^\d{6}$/.test(arg)) ?? "202608";
const LIVE = "https://25live.collegenet.com/25live/data/umd/run";
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

async function fromTestudo() {
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
  let done = 0;
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
        }
      }
    }
    done += 1;
    if (done % 25 === 0) console.log(`sections ${done}/${batches.length}`);
  });

  const calendar = TERM_CALENDARS[TERM] ?? null;
  return {
    builtAt: new Date().toISOString().slice(0, 10),
    term: TERM,
    calendar,
    // Each room: building code, room number, the largest section that meets there, and its class times as
    // [day (0 = Monday), start, end] in minutes after midnight, sorted.
    rooms: [...rooms.values()]
      .map((entry) => ({ b: entry.building, r: entry.room, s: entry.size, t: [...entry.busy].map((item) => item.split("|").map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]) }))
      .sort((a, b) => a.b.localeCompare(b.b) || a.r.localeCompare(b.r, "en", { numeric: true })),
  };
}

// 25Live's spaces: { "IRB 0324": { id, capacity, general } }. Its names are "<building> <room>".
async function liveSpaces() {
  const response = await fetch(`${LIVE}/spaces.json`, { headers: { "User-Agent": "TerpPlan (terpplan.com)" }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`25Live returned ${response.status}`);
  const list = (await response.json()).spaces?.space ?? [];
  return new Map((Array.isArray(list) ? list : [list]).flatMap((space) => {
    const match = /^([A-Z]{2,4})\s+([0-9A-Z]+)$/.exec(String(space.space_name ?? "").trim().toUpperCase());
    return match ? [[`${match[1]} ${match[2]}`, { id: Number(space.space_id), capacity: Number(space.max_capacity) || 0, general: /\bGP\b/.test(space.formal_name ?? "") }]] : [];
  }));
}

const output = LIVE_ONLY ? JSON.parse(readFileSync(new URL("../data/rooms.json", import.meta.url), "utf8")) : await fromTestudo();
if (LIVE_ONLY) output.rooms = output.rooms.filter((room) => room.t.length).map(({ b, r, s, t }) => ({ b, r, s, t }));
const spaces = await liveSpaces();
let linked = 0, added = 0;
for (const room of output.rooms) {
  const space = spaces.get(`${room.b} ${room.r}`);
  if (!space) continue;
  // l: 25Live id; c: official capacity.
  room.l = space.id; if (space.capacity) room.c = space.capacity;
  linked += 1;
}
const known = new Set(output.rooms.map((room) => `${room.b} ${room.r}`));
for (const [key, space] of spaces) {
  if (known.has(key) || !space.general) continue;
  const [b, r] = key.split(" ");
  output.rooms.push({ b, r, s: space.capacity, t: [], l: space.id, ...(space.capacity ? { c: space.capacity } : {}) });
  added += 1;
}
output.rooms.sort((a, b) => a.b.localeCompare(b.b) || a.r.localeCompare(b.r, "en", { numeric: true }));
output.liveAt = new Date().toISOString().slice(0, 10);
console.log(`25Live: ${spaces.size} spaces, ${linked} rooms linked, ${added} general-purpose rooms added`);
writeFileSync(new URL("../data/rooms.json", import.meta.url), JSON.stringify(output) + "\n");
console.log(`saved ${output.rooms.length} rooms in ${new Set(output.rooms.map((room) => room.b)).size} buildings`);
