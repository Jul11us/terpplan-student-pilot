// Builds data/umd-buildings.json: Testudo building code -> name and map position, for the timetable's
// map links and walking-time estimates.
// Run: node scripts/build-buildings.mjs
// Then check the map links still open the right buildings: python scripts/check-building-maps.py
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

// Map links search Google Maps by building name, so the place card shows the building rather than a
// coordinate. "<name>, College Park, MD" opens the right place for most buildings (checked 2026-10-01
// against our coordinates and Google's place name); these need other wording. Shoemaker has two
// duplicate Google entries, so it always opens a short list headed by the building.
const MAP_QUERY = {
  ARC: "Architecture Building, University of Maryland, College Park, MD",
  BAL: "Baltimore Hall, University of Maryland, College Park, MD",
  CAM: "Cambridge Hall University of Maryland",
  CCC: "Cambridge Community Center University of Maryland",
  DEN: "Denton Hall University of Maryland",
  FDA: "FDA Wiley Building, 5001 Campus Dr, College Park, MD",
  GLF: "Golf Course Clubhouse, University of Maryland, College Park, MD",
  HJP: "H.J. Patterson Hall, University of Maryland, College Park, MD",
  ICC: "College Park Marriott Hotel & Conference Center, Hyattsville, MD",
  IPT: "Institute for Physical Science and Technology University of Maryland",
  KEY: "Francis Scott Key Hall University of Maryland",
  PGG: "Prince Georges Hall University of Maryland",
  SFSC: "UMGC Student and Faculty Services Center, Adelphi, MD",
  SHM: "Shoemaker Bldg, College Park, MD 20742",
  SPH: "School of Public Health, University of Maryland, College Park, MD",
  TAL: "Talbot Hall, University of Maryland, College Park, MD",
  // No classes met in these in the Spring 2027 sample, and no wording opened the building itself. These
  // show a list instead; the default wording jumped to the wrong place (e.g. Harrison Lab -> a greenhouse).
  HAR: "Harrison Laboratory, University of Maryland, College Park",
  SHR: "Shriver Laboratory, University of Maryland, College Park",
  "SCUB 3": "Satellite Central Utilities Bldg 3, College Park, MD",
  "SCUB 4": "Satellite Central Utilities Bldg 4, College Park, MD",
};
// No wording opened a single place for these (no classes met in them in the Spring 2027 sample);
// the search still names the building and lists matches on campus.
const MAP_LIST_ONLY = new Set(["CSS", "FRD", "PGUC"]);
const mapQuery = (code, name) => MAP_QUERY[code]
  ?? (MAP_LIST_ONLY.has(code) ? `${name.replace(/\s*\(Residence Hall\)$/, "")}, University of Maryland, College Park, MD` : `${name}, College Park, MD`);

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

for (const [code, building] of Object.entries(out)) building.map = mapQuery(code, building.name);

const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(new URL("../data/umd-buildings.json", import.meta.url), JSON.stringify(sorted, null, 0).replace(/},"/g, '},\n"') + "\n");
console.log(`${Object.keys(sorted).length} building codes`);
