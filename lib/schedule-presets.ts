// One-click bundles of the schedule preferences students ask for most ("no Friday classes", "no 8ams").
// A preset only writes the preference fields the planner already understands, so nothing here changes how
// schedules are built: it is a shortcut through the same form, and the form stays the source of truth.

export type PresetFields = {
  excludedDays: string[];
  earliestStart: string;
  windowStart: string;
  windowEnd: string;
  strictTime: boolean;
  preferFewerDays: boolean;
  preferNearbyClasses: boolean;
};

export type PresetKey = "noFriday" | "noEarly" | "noEvening" | "fewerDays" | "nearby";

export const PRESET_KEYS: PresetKey[] = ["noFriday", "noEarly", "noEvening", "fewerDays", "nearby"];

const NO_EARLY_AT = "10:00";
const DAY_WINDOW = { start: "08:00", end: "17:00" } as const;

const toMinutes = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]);
  return hour > 23 || minute > 59 ? null : hour * 60 + minute;
};

// A preset reads as on when the fields already satisfy it, so presets the student set by hand in the form
// below (10:30 instead of 10:00) still show as active rather than inviting a redundant click.
export function presetActive(key: PresetKey, fields: PresetFields): boolean {
  switch (key) {
    case "noFriday": return fields.excludedDays.includes("Fri");
    case "noEarly": return (toMinutes(fields.earliestStart) ?? -1) >= toMinutes(NO_EARLY_AT)!;
    case "noEvening": {
      const end = toMinutes(fields.windowEnd);
      return fields.strictTime && end !== null && end <= toMinutes(DAY_WINDOW.end)!;
    }
    case "fewerDays": return fields.preferFewerDays;
    case "nearby": return fields.preferNearbyClasses;
  }
}

// The fields to write when turning a preset on. Only the keys it owns are returned, so two presets can be
// on at once without one clearing the other's settings.
export function presetOn(key: PresetKey, fields: PresetFields): Partial<PresetFields> {
  switch (key) {
    case "noFriday": return { excludedDays: [...new Set([...fields.excludedDays, "Fri"])] };
    case "noEarly": return { earliestStart: NO_EARLY_AT };
    case "noEvening": return {
      // Keeps a morning start the student already chose; only the end of the day is what this preset is about.
      windowStart: fields.windowStart || DAY_WINDOW.start,
      windowEnd: DAY_WINDOW.end,
      strictTime: true,
    };
    case "fewerDays": return { preferFewerDays: true };
    // Ranking only: it does not pick areas for the student, since which part of campus to stay in is
    // theirs to choose and narrowing it by guess would quietly drop sections they need.
    case "nearby": return { preferNearbyClasses: true };
  }
}

// Turning a preset off reverts only its own fields. "No classes after 5pm" drops the strict window rather
// than the time window itself, so the window stays visible in the form for the student to adjust.
export function presetOff(key: PresetKey, fields: PresetFields): Partial<PresetFields> {
  switch (key) {
    case "noFriday": return { excludedDays: fields.excludedDays.filter((day) => day !== "Fri") };
    case "noEarly": return { earliestStart: "" };
    case "noEvening": return { strictTime: false };
    case "fewerDays": return { preferFewerDays: false };
    case "nearby": return { preferNearbyClasses: false };
  }
}

export const togglePreset = (key: PresetKey, fields: PresetFields): Partial<PresetFields> =>
  presetActive(key, fields) ? presetOff(key, fields) : presetOn(key, fields);
