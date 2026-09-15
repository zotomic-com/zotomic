"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";

export function WebDevLeadForm() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/web-development/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setStatus("sent");
      } else {
        setError(data.error || "Something went wrong. Please try again.");
        setStatus("error");
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setStatus("error");
    }
  };

  if (status === "sent") {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center shadow-sm">
        <p className="text-lg font-extrabold text-navy">Message received</p>
        <p className="mt-1 text-sm text-fg-muted">Thanks — we&apos;ll get back to you within a day.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} id="inquiry" className="scroll-mt-20 space-y-4 rounded-lg border border-border bg-surface p-6 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name">
          <Input required value={form.name} onChange={set("name")} placeholder="Ahmed Rahman" />
        </Field>
        <Field label="Email">
          <Input type="email" required value={form.email} onChange={set("email")} placeholder="you@example.com" />
        </Field>
      </div>
      <Field label="Phone / WhatsApp (optional)">
        <Input value={form.phone} onChange={set("phone")} placeholder="+880 1xxx-xxxxxx" />
      </Field>
      <Field label="Tell us about your project">
        <Textarea required value={form.message} onChange={set("message")} rows={4} placeholder="What are you looking to build?" />
      </Field>
      {status === "error" && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={status === "sending"} className="w-full">
        {status === "sending" ? "Sending…" : "Send project brief"}
      </Button>
    </form>
  );
}
