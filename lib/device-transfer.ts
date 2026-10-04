// "Continue on another device": the plans, schedule preferences and courses taken from this browser, packed
// into the #fragment of a link. A fragment is never sent to the server, so this still stays between the
// student's own browsers. Personal event names are left out, as promised where they are entered.

import { parseSavedState, writeSavedState, type SavedState } from "@/lib/saved-state";
import { parseTaken, writeTaken, type TakenCourses } from "@/lib/taken-courses";

export const TRANSFER_PREFIX = "#move=";
const VERSION = 1;

export type Transfer = { state: SavedState; taken: TakenCourses | null };

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (text: string) => {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

// Without labels; the student's language stays whatever the other device uses.
function shareable(state: SavedState): SavedState {
  const busyBlocks = state.preferences?.busyBlocks?.map(({ id, days, start, end }) => ({ id, days, start, end }));
  return {
    term: state.term,
    plans: state.plans,
    otherPlans: state.otherPlans,
    showingB: state.showingB,
    ...(state.preferences ? { preferences: { ...state.preferences, ...(busyBlocks ? { busyBlocks } : {}) } } : {}),
  };
}

export async function encodeTransfer(state: SavedState, taken: TakenCourses | null) {
  const body = JSON.stringify({ v: VERSION, s: shareable(state), t: taken ? { completed: taken.completed, inProgress: taken.inProgress, credits: taken.credits, source: taken.source } : null });
  return toBase64Url(await pipe(new TextEncoder().encode(body), new CompressionStream("deflate-raw")));
}

// null when the text is not a TerpPlan transfer (cut short, edited, or from a future version).
export async function decodeTransfer(code: string): Promise<Transfer | null> {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(await pipe(fromBase64Url(code), new DecompressionStream("deflate-raw")))) as { v?: unknown; s?: unknown; t?: unknown };
    if (parsed.v !== VERSION) return null;
    const state = parseSavedState(parsed.s);
    return { state: { term: state.term, plans: state.plans, otherPlans: state.otherPlans, showingB: state.showingB, ...(state.preferences ? { preferences: state.preferences } : {}) }, taken: parseTaken(parsed.t) };
  } catch {
    return null;
  }
}

// Courses in every plan the link carries (both Plan A and Plan B of each term).
export const transferCourseCount = (transfer: Transfer) => [...Object.values(transfer.state.plans), ...Object.values(transfer.state.otherPlans ?? {})].reduce((sum, courses) => sum + courses.length, 0);

// Replace the receiving browser's plan data, including empty values, while keeping its language.
export function applyTransfer(transfer: Transfer) {
  writeSavedState({ term: transfer.state.term, plans: transfer.state.plans, otherPlans: transfer.state.otherPlans ?? {}, showingB: transfer.state.showingB ?? {}, preferences: transfer.state.preferences });
  writeTaken(transfer.taken ? { completed: transfer.taken.completed, inProgress: transfer.taken.inProgress, credits: transfer.taken.credits, source: transfer.taken.source } : null);
}
