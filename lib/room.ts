// Turns a meeting's building/room fields into the short label shown to students, e.g. "IRB 0324".
export function roomLabel(building: string | null | undefined, room: string | null | undefined, language: "en" | "zh") {
  const parts = [building, room].map((value) => value?.trim() ?? "").filter(Boolean);
  if (parts.some((value) => /online/i.test(value))) return language === "zh" ? "线上" : "Online";
  if (!parts.length || parts.some((value) => /^(tba|tbd)$/i.test(value))) return language === "zh" ? "教室待定" : "Room TBA";
  return parts.join(" ");
}
