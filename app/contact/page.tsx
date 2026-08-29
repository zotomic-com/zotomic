"use client";

import { useState } from "react";
import { Clock, Mail, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageHero } from "@/components/site/marketing";

const TOPICS = ["General question", "Sales / plans", "Support", "Partnership", "Data deletion"];

export default function ContactPage() {
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

  return (
    <>
      <PageHero eyebrow="Contact" title="Talk to us" subtitle="We reply within 24 hours." />

      <div className="mx-auto grid max-w-5xl gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-3">
        <div className="space-y-3">
          {[
            { icon: Mail, label: "Email", value: "hello@zotomic.com" },
            { icon: Clock, label: "Response time", value: "Within 24 hours" },
            { icon: MapPin, label: "Location", value: "Bangladesh" },
          ].map((i) => (
            <div key={i.label} className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
              <i.icon className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{i.label}</p>
                <p className="text-sm font-medium text-fg">{i.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm lg:col-span-2">
          {status === "sent" ? (
            <div className="py-10 text-center">
              <p className="text-lg font-extrabold text-navy">Message received</p>
              <p className="mt-1 text-sm text-fg-muted">
                Thanks — we&apos;ll get back to you within 24 hours.
              </p>
            </div>
          ) : (
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
                    {TOPICS.map((t) => (
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
                <p className="text-sm text-danger">
                  Something went wrong. Email us directly at hello@zotomic.com.
                </p>
              )}
              <Button type="submit" disabled={status === "sending"} className="w-full">
                {status === "sending" ? "Sending…" : "Send message"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
