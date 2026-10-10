import { GEN_ED_CATEGORIES } from "@/lib/gened-categories";

type Language = "en" | "zh";

// A course's Gen Ed codes as small tags, one per requirement it can count for: "DSHS" or, when it may count
// for one of several, "DSHS / DSNS". Hovering (or a screen reader) gives the categories' names.
export function GenEdTags({ groups, language, className = "" }: { groups: string[][] | undefined; language: Language; className?: string }) {
  if (!groups?.length) return null;
  const name = (code: string) => GEN_ED_CATEGORIES.find((item) => item.code === code)?.[language] ?? code;
  const or = language === "zh" ? " 或 " : " or ";
  return <span className={`flex flex-wrap justify-end gap-1 ${className}`}>
    <span className="sr-only">Gen Ed:</span>
    {groups.map((group) => <span key={group.join("|")} title={group.map(name).join(or)} aria-label={group.map((code) => `${code} (${name(code)})`).join(or)}
      className="whitespace-nowrap rounded-md border border-[#cdd6ea] bg-[#eef2fa] px-1.5 py-0.5 text-[10px] font-semibold leading-4 tracking-wide text-[#2f4a7a]">{group.join(" / ")}</span>)}
  </span>;
}
