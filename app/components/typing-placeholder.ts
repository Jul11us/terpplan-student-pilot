"use client";

import { useEffect, useState } from "react";

// Course codes and topics the search placeholder "types" in turn, in random order.
export const SEARCH_EXAMPLES = [
  "CMSC131", "MATH140", "ENGL101", "STAT400", "ECON200", "PSYC100", "BMGT110", "CHEM131", "PHYS161", "MATH240",
  "Calculus", "Linear Algebra", "Psychology", "Statistics", "Microeconomics", "Organic Chemistry",
];

const TYPE_MS = 90, ERASE_MS = 45, HOLD_MS = 1600, PAUSE_MS = 350;

function nextExample(previous: string | null) {
  const choices = SEARCH_EXAMPLES.filter((example) => example !== previous);
  return choices[Math.floor(Math.random() * choices.length)]!;
}

// A placeholder that types an example, holds it, erases it and types another. It stays still (showing the
// first example) while `active` is false — the box has text — and for people who ask for reduced motion.
export function useTypingPlaceholder(prefix: string, active: boolean) {
  const [text, setText] = useState(SEARCH_EXAMPLES[0]!);

  useEffect(() => {
    if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let example = nextExample(null), shown = example.length, erasing = true, timer = 0;
    const step = () => {
      if (erasing) {
        shown -= 1;
        if (shown <= 0) { erasing = false; example = nextExample(example); timer = window.setTimeout(step, PAUSE_MS); setText(""); return; }
        setText(example.slice(0, shown));
        timer = window.setTimeout(step, ERASE_MS);
      } else {
        shown += 1;
        setText(example.slice(0, shown));
        if (shown >= example.length) { erasing = true; timer = window.setTimeout(step, HOLD_MS); return; }
        timer = window.setTimeout(step, TYPE_MS);
      }
    };
    // Start from a full example so the first frame matches the server-rendered placeholder.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(example);
    timer = window.setTimeout(step, HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  return `${prefix}${text}`;
}
