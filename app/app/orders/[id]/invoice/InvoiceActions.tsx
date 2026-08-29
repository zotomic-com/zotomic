"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Mail, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { emailOrderInvoice } from "./actions";

export function InvoiceActions({
  orderId,
  orderNumber,
  customerEmail,
  branded,
}: {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  branded: boolean;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState(customerEmail);
  const [showEmail, setShowEmail] = useState(false);

  const send = () =>
    start(async () => {
      const res = await emailOrderInvoice(orderId, email);
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
          href={`/app/orders/${orderId}`}
          className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-2"
        >
          <ArrowLeft className="h-4 w-4" /> Order #{orderNumber}
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print
        </Button>
        <a
          href={`/app/orders/${orderId}/invoice/download`}
          className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 text-sm font-semibold hover:bg-surface-2"
        >
          <Download className="h-4 w-4" /> Download PDF
        </a>
        <Button size="sm" variant="outline" onClick={() => setShowEmail((s) => !s)}>
          <Mail className="h-4 w-4" /> Email to customer
        </Button>
        {!branded && <Badge tone="neutral">Free plan — includes Zotomic branding</Badge>}
      </div>
      {showEmail && (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border bg-surface-2 p-3">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@example.com"
            className="w-64"
          />
          <Button size="sm" onClick={send} disabled={pending || !email}>
            {pending ? "Sending…" : "Send PDF"}
          </Button>
        </div>
      )}
    </div>
  );
}
