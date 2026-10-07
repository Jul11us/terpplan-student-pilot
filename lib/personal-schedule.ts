export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type BusyBlock = { id: string; days: string[]; start: string; end: string; label?: string };
export const MAX_BUSY_BLOCKS = 24;

const clock = (value: unknown): value is string => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

// The API rejects malformed constraints instead of silently ignoring time the student reserved.
export function validBusyBlocks(value: unknown): value is BusyBlock[] {
  return Array.isArray(value) && value.length <= MAX_BUSY_BLOCKS && new Set(value.map((item) => item?.id)).size === value.length && value.every((item) =>
    item && typeof item === "object" && typeof item.id === "string" && /^[\w-]{1,80}$/.test(item.id)
    && Array.isArray(item.days) && item.days.length > 0 && item.days.length <= 7
    && item.days.every((day: unknown) => typeof day === "string" && WEEKDAYS.includes(day as typeof WEEKDAYS[number]))
    && clock(item.start) && clock(item.end) && item.start < item.end);
}

export function normalizeBusyBlocks(value: unknown): BusyBlock[] {
  if (!validBusyBlocks(value)) return [];
  return value.map((block) => ({ id: block.id, days: [...new Set(block.days)], start: block.start, end: block.end,
    ...(typeof block.label === "string" ? { label: block.label.slice(0, 80) } : {}) }));
}

export function validBuffer(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 120;
}

// Event names are not sent to the scheduler, which only needs anonymous time constraints.
export function anonymousBusyBlocks(blocks: BusyBlock[]) {
  return blocks.map(({ id, days, start, end }) => ({ id, days, start, end }));
}
