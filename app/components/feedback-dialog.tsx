"use client";

import { useEffect, useRef, useState } from "react";
import { FEEDBACK_EVENT, FEEDBACK_KINDS, isEmailAddress, MESSAGE_MAX, type FeedbackKind } from "@/lib/feedback";
import { CONTACT_EMAIL } from "@/lib/site-config";

// The feedback form, mounted once for the whole site and opened with openFeedback() (lib/feedback.ts) from a
// "Feedback" button or a "Report a problem" link (which passes the course or sections it is about).
const copy = {
  en: {
    title: "Feedback", close: "Close",
    intro: "Something wrong, or an idea to make TerpPlan better? It goes straight to the student who builds it.",
    kinds: { problem: "Something's wrong", idea: "An idea", other: "Something else" },
    message: "Message", placeholder: { problem: "What happened, and what did you expect?", idea: "What would help you plan?", other: "Your message" },
    about: "About",
    contact: "Your email (optional)", contactHint: "Only to reply to you. Leave it empty to stay anonymous.",
    send: "Send", sending: "Sending…", sent: "Thanks! Your message was sent.", again: "Send another",
    tooLong: "Keep it under {n} characters.", badEmail: "Check the email address, or leave it empty.",
    failed: "It could not be sent. Try again in a moment, or email {email}.", limit: "That's a lot of messages for now. Try again in an hour, or email {email}.",
  },
  zh: {
    title: "反馈", close: "关闭",
    intro: "哪里不对，或者有让 TerpPlan 更好用的想法？会直接发给做这个网站的同学。",
    kinds: { problem: "有问题", idea: "提建议", other: "其他" },
    message: "内容", placeholder: { problem: "发生了什么？你原本希望看到什么？", idea: "什么功能会帮你排课？", other: "想说的话" },
    about: "相关",
    contact: "你的邮箱（可不填）", contactHint: "只用来回复你。不填就是匿名。",
    send: "发送", sending: "发送中…", sent: "谢谢！已经收到你的反馈。", again: "再写一条",
    tooLong: "请控制在 {n} 字以内。", badEmail: "邮箱格式不对，或者留空。",
    failed: "暂时没发出去，请稍后再试，或发邮件到 {email}。", limit: "这一小时发得有点多了，请稍后再试，或发邮件到 {email}。",
  },
} as const;

type Status = "idle" | "sending" | "sent" | "failed" | "limit";

export default function FeedbackDialog() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("problem");
  const [context, setContext] = useState("");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [language, setLanguage] = useState<"en" | "zh">("en");
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: FeedbackKind; context?: string }>).detail ?? {};
      // Each page sets <html lang>; the form follows it.
      setLanguage(document.documentElement.lang.startsWith("zh") ? "zh" : "en");
      setKind(detail.kind ?? "problem");
      setContext(detail.context ?? "");
      setStatus((current) => current === "sent" ? "idle" : current);
      setOpen(true);
    };
    window.addEventListener(FEEDBACK_EVENT, onOpen);
    return () => window.removeEventListener(FEEDBACK_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    textRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const t = copy[language];
  const tooLong = message.length > MESSAGE_MAX;
  const badEmail = contact.trim() !== "" && !isEmailAddress(contact.trim());
  const canSend = message.trim() !== "" && !tooLong && !badEmail && status !== "sending";

  const send = async () => {
    if (!canSend) return;
    setStatus("sending");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, message, contact: contact.trim(), page: window.location.pathname, context: context || undefined, language }),
      });
      if (response.status === 429) { setStatus("limit"); return; }
      if (!response.ok) { setStatus("failed"); return; }
      setStatus("sent"); setMessage(""); setContext("");
    } catch {
      setStatus("failed");
    }
  };

  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#202728]/40 px-4 py-10 sm:items-center" onClick={() => setOpen(false)}>
    <section role="dialog" aria-modal="true" aria-labelledby="feedback-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-6 text-[#202728] shadow-xl sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <h2 id="feedback-title" className="font-serif text-2xl">{t.title}</h2>
        <button type="button" onClick={() => setOpen(false)} aria-label={t.close} className="rounded-lg border border-[#dcd9d0] px-2.5 py-1 text-sm text-[#5d6561] hover:bg-white">✕</button>
      </div>
      {status === "sent" ? <div className="mt-5">
        <p role="status" className="rounded-xl border border-[#cddbd1] bg-[#edf3ef] px-4 py-3 text-sm text-[#273c38]">{t.sent}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => setStatus("idle")} className="rounded-lg border border-[#536d64] px-3 py-2 text-xs font-semibold text-[#273c38] hover:bg-[#edf3ef]">{t.again}</button>
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-[#273c38] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d302c]">{t.close}</button>
        </div>
      </div> : <form className="mt-3" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <p className="text-sm leading-6 text-[#48534f]">{t.intro}</p>
        <div role="radiogroup" className="mt-4 flex flex-wrap gap-2">{FEEDBACK_KINDS.map((item) => <button key={item} type="button" role="radio" aria-checked={kind === item} onClick={() => setKind(item)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${kind === item ? "border-[#273c38] bg-[#273c38] text-white" : "border-[#dcd9d0] bg-white text-[#48534f] hover:border-[#536d64]"}`}>{t.kinds[item]}</button>)}</div>
        {context && <p className="mt-3 whitespace-pre-line rounded-xl border border-[#e3e0d8] bg-white px-3 py-2 text-xs leading-5 text-[#5d6561]"><span className="font-semibold text-[#48534f]">{t.about}:</span> {context.split("\n").join(" · ")}</p>}
        <label className="mt-4 block text-xs font-semibold text-[#48534f]" htmlFor="feedback-message">{t.message}</label>
        <textarea id="feedback-message" ref={textRef} value={message} onChange={(event) => setMessage(event.target.value)} rows={5} placeholder={t.placeholder[kind]}
          className="mt-1.5 w-full resize-y rounded-xl border border-[#dcd9d0] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#536d64]" />
        {tooLong && <p className="mt-1 text-xs text-[#a34a39]">{t.tooLong.replace("{n}", String(MESSAGE_MAX))}</p>}
        <label className="mt-3 block text-xs font-semibold text-[#48534f]" htmlFor="feedback-contact">{t.contact}</label>
        <input id="feedback-contact" type="email" value={contact} onChange={(event) => setContact(event.target.value)} autoComplete="email"
          className="mt-1.5 w-full rounded-xl border border-[#dcd9d0] bg-white px-3 py-2 text-sm outline-none focus:border-[#536d64]" />
        <p className={`mt-1 text-[11px] ${badEmail ? "text-[#a34a39]" : "text-[#646c68]"}`}>{badEmail ? t.badEmail : t.contactHint}</p>
        {(status === "failed" || status === "limit") && <p role="alert" className="mt-3 rounded-xl border border-[#ead8b5] bg-[#fff8e8] px-3 py-2 text-xs text-[#745424]">{t[status].replace("{email}", CONTACT_EMAIL)}</p>}
        <button type="submit" disabled={!canSend} className="mt-4 rounded-lg bg-[#a34a39] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8e3f30] disabled:opacity-50">{status === "sending" ? t.sending : t.send}</button>
      </form>}
    </section>
  </div>;
}
