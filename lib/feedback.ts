// The in-page feedback form ("Report a problem / Suggest something"): what a message may contain, and how
// any part of the site opens the form. Messages are stored for /admin and emailed to CONTACT_EMAIL.

export const FEEDBACK_KINDS = ["problem", "idea", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const MESSAGE_MAX = 2000;
export const FEEDBACK_EVENT = "terpplan:feedback";

export type FeedbackMessage = { kind: FeedbackKind; message: string; contact: string | null; page: string; context: string | null; language: "en" | "zh" };

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

export function isEmailAddress(value: string) {
  return value.length <= 200 && EMAIL.test(value);
}

// Checks a submitted message; returns it cleaned up, or the reason it cannot be accepted.
export function readFeedback(body: Record<string, unknown>): { value: FeedbackMessage } | { error: string } {
  const { kind, message, contact, page, context, language } = body;
  if (typeof kind !== "string" || !(FEEDBACK_KINDS as readonly string[]).includes(kind)) return { error: "Choose what kind of message this is." };
  if (typeof message !== "string" || !message.trim()) return { error: "Write a message." };
  if (message.length > MESSAGE_MAX) return { error: `Keep the message under ${MESSAGE_MAX} characters.` };
  if (contact !== undefined && contact !== null && contact !== "" && (typeof contact !== "string" || !isEmailAddress(contact.trim()))) return { error: "Enter a valid email address, or leave it empty." };
  // A path on this site only (never a #fragment, which can hold a plan).
  if (typeof page !== "string" || !/^\/[A-Za-z0-9/_-]{0,100}$/.test(page)) return { error: "Unknown page." };
  if (context !== undefined && context !== null && (typeof context !== "string" || context.length > 500)) return { error: "Unknown context." };
  return { value: {
    kind: kind as FeedbackKind,
    message: message.trim(),
    contact: typeof contact === "string" && contact.trim() ? contact.trim() : null,
    page,
    context: typeof context === "string" && context.trim() ? context.trim() : null,
    language: language === "zh" ? "zh" : "en",
  } };
}

// Opens the feedback form (mounted once in the layout), optionally as a problem report about a course.
export function openFeedback(detail: { kind?: FeedbackKind; context?: string } = {}) {
  window.dispatchEvent(new CustomEvent(FEEDBACK_EVENT, { detail }));
}
