// The language a page starts in before the student picks one: their browser's, else English.
//
// Every page keeps the choice in the saved state (lib/saved-state.ts), so the rule is the same everywhere:
// saved choice first, this second. Keeping it here, free of imports, lets lib/demo use it without a cycle
// through the saved state.

export type Language = "en" | "zh";

// Tags are passed in by tests; in the browser the first navigator language decides, as it always has.
export function browserLanguage(tags?: readonly string[]): Language {
  const tag = tags ? tags[0] : typeof navigator === "undefined" ? undefined : navigator.language;
  return (tag ?? "").toLowerCase().startsWith("zh") ? "zh" : "en";
}
