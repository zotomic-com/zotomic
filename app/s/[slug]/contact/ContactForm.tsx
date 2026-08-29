"use client";

import { useState, useTransition } from "react";
import { sendStoreEnquiry } from "./actions";

export function ContactForm({ slug }: { slug: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const field =
    "w-full rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-bg)] px-3 py-2.5 text-sm";

  if (done) {
    return (
      <p className="rounded-[var(--sf-radius)] border border-[var(--sf-line)] bg-[var(--sf-card)] p-4 text-sm">
        Thanks — we&apos;ve received your message and will get back to you.
      </p>
    );
  }

  return (
    <form
      action={(fd) =>
        start(async () => {
          setErr("");
          const res = await sendStoreEnquiry(slug, fd);
          if ("error" in res) setErr(res.error);
          else setDone(true);
        })
      }
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="name" placeholder="Your name" required className={field} />
        <input name="phone" placeholder="Phone" className={field} inputMode="tel" />
      </div>
      <input name="email" type="email" placeholder="Email" className={field} />
      <textarea name="message" placeholder="How can we help?" rows={4} required className={`${field} h-auto`} />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-[var(--sf-radius)] bg-[var(--sf-accent)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
