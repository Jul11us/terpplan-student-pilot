import { env } from "cloudflare:workers";
import { readFeedback, type FeedbackMessage } from "@/lib/feedback";
import { countError } from "@/lib/error-counts";
import { allowRate, clientRateKey } from "@/lib/rate-limit";
import { readJsonObject, sameOriginMutation } from "@/lib/request-security";
import { CONTACT_EMAIL, SITE_URL } from "@/lib/site-config";
import { sendBudgetedMail } from "@/lib/mail-budget";

// The in-page feedback form. Each message is stored (shown on /admin) and emailed to CONTACT_EMAIL, with the
// student's address as the reply-to when they gave one. Five messages an hour per network address.
const KIND_LABEL = { problem: "Problem", idea: "Idea", other: "Other" } as const;

function feedbackEmail(item: FeedbackMessage, createdAt: string) {
  const lines = [
    item.message,
    "",
    "---",
    `Kind: ${KIND_LABEL[item.kind]}`,
    `Page: ${SITE_URL}${item.page}`,
    ...(item.context ? [item.context] : []),
    `Language: ${item.language}`,
    `Reply to: ${item.contact ?? "(no address given)"}`,
    `Sent: ${createdAt}`,
  ];
  const preview = item.message.replace(/\s+/g, " ").slice(0, 60);
  return { subject: `TerpPlan ${KIND_LABEL[item.kind].toLowerCase()}: ${preview}`, text: lines.join("\n") };
}

export async function POST(request: Request) {
  const denied = sameOriginMutation(request);
  if (denied) return denied;
  const parsed = await readJsonObject(request, 8192);
  if (parsed.error) return parsed.error;
  const checked = readFeedback(parsed.value);
  if ("error" in checked) return Response.json({ error: checked.error }, { status: 400 });
  if (!env.DB) return Response.json({ error: "Feedback is not available right now." }, { status: 503 });
  const item = checked.value;
  try {
    if (!await allowRate(await clientRateKey(request, "feedback"), 5, 3600)) return Response.json({ error: "Too many messages. Please try again later.", code: "rateLimited" }, { status: 429 });
    const createdAt = new Date().toISOString();
    await env.DB.prepare("INSERT INTO feedback (created_at, kind, message, contact, page, context, language) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(createdAt, item.kind, item.message, item.contact, item.page, item.context, item.language).run();
    // The message is kept even if the email cannot go out; /admin lists it either way.
    if (env.RESEND_API_KEY && env.EMAIL_FROM) {
      const message = feedbackEmail(item, createdAt);
      const sent = await sendBudgetedMail("feedback", { from: env.EMAIL_FROM, to: [CONTACT_EMAIL], subject: message.subject, text: message.text, ...(item.contact ? { reply_to: item.contact } : {}) }, `feedback:${crypto.randomUUID()}`).catch(() => "failed");
      if (sent === "failed" || sent === "exhausted") await countError("email");
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "The message could not be sent. Please try again shortly." }, { status: 503 });
  }
}
