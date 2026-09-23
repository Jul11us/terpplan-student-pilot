"use client";

import Link from "next/link";
import { useState } from "react";

// Opening this page changes nothing: email security scanners follow links automatically,
// so seat emails stop only after the student presses the button.
export default function UnsubscribePage() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const stop = async () => {
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    setState("busy");
    try {
      const response = await fetch("/api/alerts/unsubscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      setState(response.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  return <main className="grid min-h-screen place-items-center bg-[#f5f3ef] px-4 text-[#202728]">
    <section className="w-full max-w-md rounded-2xl border border-[#e0ddd5] bg-[#fbfaf8] p-6 sm:p-8">
      <Link href="/" className="flex items-center gap-3 font-semibold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#bd302f] font-serif text-lg text-white">T</span>TerpPlan</Link>
      {state === "done" ? <>
        <h1 className="mt-6 font-serif text-2xl">Seat emails stopped</h1>
        <p className="mt-2 text-sm leading-6 text-[#59635f]">You will not get seat alerts from TerpPlan anymore. Your saved address was deleted.</p>
        <p className="mt-1 text-sm leading-6 text-[#59635f]">已停止余位提醒，保存的邮箱地址也已删除。</p>
      </> : <>
        <h1 className="mt-6 font-serif text-2xl">Stop seat emails?</h1>
        <p className="mt-2 text-sm leading-6 text-[#59635f]">TerpPlan will stop emailing you when watched sections open, and delete the address saved for alerts.</p>
        <p className="mt-1 text-sm leading-6 text-[#59635f]">停止接收余位提醒邮件，并删除为提醒保存的邮箱地址。</p>
        <button onClick={() => void stop()} disabled={state === "busy"} className="mt-5 w-full rounded-lg bg-[#273c38] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">Stop seat emails · 停止提醒</button>
        {state === "error" && <p role="alert" className="mt-3 text-sm text-[#8c352c]">This link is not valid. You can also turn emails off on terpplan.com. · 链接无效，也可以在 terpplan.com 上关闭提醒。</p>}
      </>}
    </section>
  </main>;
}
