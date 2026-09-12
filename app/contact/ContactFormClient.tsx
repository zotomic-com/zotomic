"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function ContactFormClient({ topics }: { topics: string[] }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", business: "", topic: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const set = (k: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  };

  if (status === "sent") {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm lg:col-span-2">
        <div className="py-10 text-center">
          <p className="text-lg font-extrabold text-navy">Message received</p>
          <p className="mt-1 text-sm text-fg-muted">Thanks — we&apos;ll get back to you within 24 hours.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm lg:col-span-2">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name">
            <Input required value={form.name} onChange={set("name")} placeholder="Ahmed Rahman" />
          </Field>
          <Field label="Email">
            <Input type="email" required value={form.email} onChange={set("email")} placeholder="you@example.com" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone / WhatsApp">
            <Input value={form.phone} onChange={set("phone")} placeholder="+880 1xxx-xxxxxx" />
          </Field>
          <Field label="Topic">
            <Select required value={form.topic} onChange={set("topic")}>
              <option value="">Select a topic…</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Business name">
          <Input value={form.business} onChange={set("business")} placeholder="My shop" />
        </Field>
        <Field label="Message">
          <Textarea required value={form.message} onChange={set("message")} placeholder="How can we help?" />
        </Field>
        {status === "error" && (
          <p className="text-sm text-danger">Something went wrong. Email us directly at hello@zotomic.com.</p>
        )}
        <Button type="submit" disabled={status === "sending"} className="w-full">
          {status === "sending" ? "Sending…" : "Send message"}
        </Button>
      </form>
    </div>
  );
}
