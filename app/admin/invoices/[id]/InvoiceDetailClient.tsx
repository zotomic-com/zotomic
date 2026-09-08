"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Mail, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { AdminInvoice } from "@/lib/admin-invoices";
import { InvoiceForm } from "../InvoiceForm";
import { deleteInvoice, sendInvoice, setInvoiceStatus, updateInvoice } from "../actions";

const STATUS_TONE = { draft: "neutral", open: "warning", paid: "success", void: "neutral" } as const;

export function InvoiceDetailClient({
  invoice,
  businesses,
}: {
  invoice: AdminInvoice;
  businesses: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [sendTo, setSendTo] = useState("");

  const editable = invoice.kind === "manual" && invoice.status !== "paid";

  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>, done?: string) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast(res.error, "error");
      else {
        if (done) toast(done, "success");
        router.refresh();
      }
    });

  if (editing) {
    return (
      <Card>
        <CardBody>
          <InvoiceForm
            businesses={businesses}
            initial={invoice}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={async (input) => {
              const res = await updateInvoice(invoice.id, input);
              if ("ok" in res) {
                setEditing(false);
                router.refresh();
              }
              return res;
            }}
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-fg">{invoice.invoiceNumber}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {invoice.businessName ?? invoice.recipientName ?? "—"} · {invoice.kind}
            {invoice.sentAt ? ` · sent ${new Date(invoice.sentAt).toLocaleDateString("en-US")}` : ""}
          </p>
        </div>
        <Badge tone={STATUS_TONE[invoice.status as keyof typeof STATUS_TONE] ?? "neutral"}>{invoice.status}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a href={`/admin/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
          <Button size="sm" variant="outline">
            <Download className="h-4 w-4" /> PDF
          </Button>
        </a>

        {editable && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        )}

        {invoice.status === "open" && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setInvoiceStatus(invoice.id, "paid"), "Marked paid")}>
            Mark paid
          </Button>
        )}
        {invoice.status === "paid" && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setInvoiceStatus(invoice.id, "open"), "Reopened")}>
            Reopen
          </Button>
        )}
        {invoice.status !== "void" && invoice.status !== "paid" && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setInvoiceStatus(invoice.id, "void"), "Voided")}>
            Void
          </Button>
        )}

        {invoice.kind === "manual" && invoice.status !== "paid" && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Delete ${invoice.invoiceNumber}? This cannot be undone.`)) {
                run(async () => {
                  const res = await deleteInvoice(invoice.id);
                  if ("ok" in res) router.push("/admin/invoices");
                  return res;
                });
              }
            }}
            className="text-danger"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border p-3">
        <Mail className="h-4 w-4 text-fg-subtle" />
        <Input
          className="w-56"
          placeholder={invoice.recipientEmail || "recipient email (optional)"}
          value={sendTo}
          onChange={(e) => setSendTo(e.target.value)}
        />
        <Button
          size="sm"
          disabled={pending}
          onClick={() => run(() => sendInvoice(invoice.id, sendTo || undefined), "Invoice emailed")}
        >
          {invoice.sentAt ? "Resend invoice" : "Send invoice"}
        </Button>
        <span className="text-xs text-fg-subtle">from invoice@zotomic.com · PDF attached</span>
      </div>
    </div>
  );
}
