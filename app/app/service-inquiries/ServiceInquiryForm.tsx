"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Textarea, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { submitServiceInquiryAction, type ServiceType } from "./actions";

export function ServiceInquiryForm({ service, title, blurb }: { service: ServiceType; title: string; blurb: string }) {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await submitServiceInquiryAction(service, { message, contactPhone: phone || undefined });
    setSubmitting(false);
    if ("error" in res) return toast(res.error, "error");
    setSent(true);
  };

  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-fg">{title}</h2>
          <p className="mt-1 text-sm text-fg-muted">{blurb}</p>
        </div>

        {sent ? (
          <div className="flex items-center gap-2 rounded-lg border border-primary bg-primary-soft p-4 text-sm text-navy">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Thanks — we&apos;ve got your request and will reach out soon.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <Field label="What are you looking for?">
              <Textarea required rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us a bit about your needs…" />
            </Field>
            <Field label="Phone (optional — if you'd rather we call)">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
            </Field>
            <Button type="submit" disabled={submitting || !message.trim()}>
              {submitting ? "Sending…" : "Send request"}
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
