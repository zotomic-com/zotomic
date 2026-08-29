"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { PageHero, Section } from "@/components/site/marketing";

export default function DataDeletionPage() {
  const [form, setForm] = useState({ email: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.email,
          email: form.email,
          topic: "Data deletion request",
          message: form.message || "Please delete all data associated with this account.",
        }),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <>
      <PageHero
        eyebrow="Legal"
        title="Data deletion request"
        subtitle="Ask us to permanently delete the data associated with your account."
      />
      <Section>
        <p className="mb-6 max-w-2xl text-sm text-fg-muted">
          Submit the email address on your account and we&apos;ll confirm the request, then delete
          your business data, products, orders, customers and reports within 30 days. Records we&apos;re
          legally required to keep (e.g. invoices) are retained only as long as the law requires.
        </p>
        <div className="max-w-lg rounded-lg border border-border bg-surface p-6 shadow-sm">
          {status === "sent" ? (
            <p className="py-6 text-center text-sm text-fg-muted">
              Request received. We&apos;ll email you to confirm before anything is deleted.
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Field label="Account email">
                <Input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="you@example.com"
                />
              </Field>
              <Field label="Anything we should know? (optional)">
                <Textarea
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                />
              </Field>
              {status === "error" && (
                <p className="text-sm text-danger">Something went wrong. Email hello@zotomic.com.</p>
              )}
              <Button type="submit" disabled={status === "sending"} className="w-full">
                {status === "sending" ? "Sending…" : "Submit request"}
              </Button>
            </form>
          )}
        </div>
      </Section>
    </>
  );
}
