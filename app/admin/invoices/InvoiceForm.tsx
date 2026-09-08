"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { money } from "@/lib/money";
import type { AdminInvoice } from "@/lib/admin-invoices";
import type { InvoiceInput } from "./actions";

type ItemRow = { key: string; description: string; quantity: string; unitPrice: string };

const blankItem = (): ItemRow => ({ key: Math.random().toString(36).slice(2), description: "", quantity: "1", unitPrice: "" });

export function InvoiceForm({
  businesses,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  businesses: { id: string; name: string }[];
  initial?: AdminInvoice;
  submitLabel: string;
  onSubmit: (input: InvoiceInput) => Promise<{ error: string } | { ok: true; id: string }>;
  onCancel?: () => void;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const [mode, setMode] = useState<"business" | "person">(
    initial ? (initial.businessId ? "business" : "person") : "business",
  );
  const [businessId, setBusinessId] = useState(initial?.businessId ?? "");
  const [recipientName, setRecipientName] = useState(initial?.recipientName ?? "");
  const [recipientEmail, setRecipientEmail] = useState(initial?.recipientEmail ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "BDT");
  const [issuedOn, setIssuedOn] = useState(initial?.issuedOn ?? new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [status, setStatus] = useState<"draft" | "open">(
    initial && initial.status !== "draft" ? "open" : "draft",
  );
  const [items, setItems] = useState<ItemRow[]>(
    initial && initial.items.length
      ? initial.items.map((it) => ({
          key: it.id ?? Math.random().toString(36).slice(2),
          description: it.description,
          quantity: String(it.quantity),
          unitPrice: String(it.unitPrice),
        }))
      : [blankItem()],
  );

  const total = useMemo(
    () => items.reduce((n, it) => n + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0),
    [items],
  );

  const setItem = (i: number, patch: Partial<ItemRow>) =>
    setItems((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = () =>
    start(async () => {
      const res = await onSubmit({
        businessId: mode === "business" ? businessId || null : null,
        recipientName: mode === "person" ? recipientName : null,
        recipientEmail: mode === "person" ? recipientEmail : recipientEmail || null,
        currency,
        issuedOn,
        dueDate: dueDate || null,
        notes: notes || null,
        status,
        items: items.map((it) => ({
          description: it.description,
          quantity: Number(it.quantity) || 0,
          unitPrice: Number(it.unitPrice) || 0,
        })),
      });
      if ("error" in res) toast(res.error, "error");
      else toast(submitLabel.includes("Create") ? "Invoice created" : "Saved", "success");
    });

  return (
    <div className="space-y-4">
      {/* recipient */}
      <div className="flex gap-2">
        {(["business", "person"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              mode === m ? "border-primary bg-primary-soft text-primary" : "border-border text-fg-muted"
            }`}
          >
            {m === "business" ? "Registered business" : "Someone else"}
          </button>
        ))}
      </div>

      {mode === "business" ? (
        <Field label="Business">
          <Select value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
            <option value="">Select a business…</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Recipient name">
            <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Acme Ltd" />
          </Field>
          <Field label="Recipient email">
            <Input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="billing@acme.com" />
          </Field>
        </div>
      )}
      {mode === "business" && (
        <Field label="Send to (optional — defaults to the owner's email)">
          <Input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="override@example.com" />
        </Field>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Field label="Currency">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {["BDT", "USD", "EUR", "GBP", "INR"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Issued on">
          <Input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
        </Field>
        <Field label="Due date">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>

      {/* line items */}
      <div>
        <p className="mb-1.5 text-xs font-semibold text-fg-muted">Line items</p>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={it.key} className="flex items-center gap-2">
              <Input
                className="flex-1"
                placeholder="Description"
                value={it.description}
                onChange={(e) => setItem(i, { description: e.target.value })}
              />
              <Input
                className="w-16 text-right"
                type="number"
                placeholder="Qty"
                value={it.quantity}
                onChange={(e) => setItem(i, { quantity: e.target.value })}
              />
              <Input
                className="w-28 text-right"
                type="number"
                placeholder="Unit price"
                value={it.unitPrice}
                onChange={(e) => setItem(i, { unitPrice: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setItems((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : r))}
                className="text-fg-subtle hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <Button size="sm" variant="outline" onClick={() => setItems((r) => [...r, blankItem()])}>
            <Plus className="h-4 w-4" /> Line
          </Button>
          <span className="text-sm font-bold text-fg">Total {money(total, currency)}</span>
        </div>
      </div>

      <Field label="Notes (shown on the invoice)">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment terms, thank-you note…" />
      </Field>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <Field label="Save as">
          <Select value={status} onChange={(e) => setStatus(e.target.value as "draft" | "open")}>
            <option value="draft">Draft</option>
            <option value="open">Open (ready to send)</option>
          </Select>
        </Field>
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
          )}
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
