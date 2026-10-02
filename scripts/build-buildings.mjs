// Builds data/umd-buildings.json: Testudo building code -> name and map position, for the timetable's
// map links and walking-time estimates.
// Run: node scripts/build-buildings.mjs
// Source: umd.io's campus building list. It gives coordinates for 421 buildings but a code for only about
// a hundred, so the codes Testudo uses that it leaves out are matched to a building below by name.
import { writeFileSync } from "node:fs";

// Testudo code -> umd.io building number, for buildings umd.io lists without a code.
const BY_ID = {
  IRB: "432", // Brendan Iribe Center
  TMH: "433", // Thurgood Marshall Hall (School of Public Policy)
  EAF: "228", // E.A. Fernandez IDEA Factory
  BMS: "296", // Biomolecular Sciences Building
  CHI: "059", // Chincoteague Hall
};

// Not in umd.io at all; positions from OpenStreetMap.
const EXTRA = {
  ATL: { name: "Atlantic Building", lat: 38.99098, lng: -76.94256 },
  PSC: { name: "Physical Sciences Complex", lat: 38.99092, lng: -76.94134 },
};

const response = await fetch("https://api.umd.io/v1/map/buildings");
if (!response.ok) throw new Error(`umd.io returned ${response.status}`);
const buildings = await response.json();
const round = (value) => Math.round(Number(value) * 1e6) / 1e6;
const entry = (building) => ({ name: building.name, lat: round(building.lat), lng: round(building.long) });

const out = {};
for (const building of buildings) {
  const code = String(building.code ?? "").trim().toUpperCase();
  // Some codes repeat for an annex (e.g. IPT and "IPT Storage"); the first, main building wins.
  if (code && !out[code] && Number.isFinite(Number(building.lat)) && Number.isFinite(Number(building.long))) out[code] = entry(building);
}
for (const [code, id] of Object.entries(BY_ID)) {
  const building = buildings.find((item) => item.id === id);
  if (!building) throw new Error(`umd.io no longer lists building ${id} for ${code}`);
  out[code] = entry(building);
}
Object.assign(out, EXTRA);

const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(new URL("../data/umd-buildings.json", import.meta.url), JSON.stringify(sorted, null, 0).replace(/},"/g, '},\n"') + "\n");
console.log(`${Object.keys(sorted).length} building codes`);
