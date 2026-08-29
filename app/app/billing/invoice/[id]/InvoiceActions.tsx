"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { emailInvoice } from "./actions";

export function InvoiceActions({ invoiceId, defaultEmail }: { invoiceId: string; defaultEmail: string }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState(defaultEmail);
  const [showEmail, setShowEmail] = useState(false);

  const send = () =>
    start(async () => {
      const res = await emailInvoice(invoiceId, email);
      if ("error" in res) toast(res.error, "error");
      else {
        toast(`Invoice sent to ${res.to}`, "success");
        setShowEmail(false);
      }
    });

  return (
    <div className="no-print space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/app/billing"
          className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-2"
        >
          <ArrowLeft className="h-4 w-4" /> Billing
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowEmail((s) => !s)}>
          <Mail className="h-4 w-4" /> Email invoice
        </Button>
      </div>
      {showEmail && (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border bg-surface-2 p-3">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-64"
          />
          <Button size="sm" onClick={send} disabled={pending}>
            {pending ? "Sending…" : "Send"}
          </Button>
        </div>
      )}
    </div>
  );
}
