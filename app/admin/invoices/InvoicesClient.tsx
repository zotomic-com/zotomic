"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { StatCard } from "@/components/ui/stat-card";
import { money } from "@/lib/money";
import type { InvoiceListRow } from "@/lib/admin-invoices";
import { InvoiceForm } from "./InvoiceForm";
import { createInvoice } from "./actions";

const STATUS_TONE = { draft: "neutral", open: "warning", paid: "success", void: "neutral" } as const;
const STATUSES = ["all", "draft", "open", "paid", "void"] as const;
const KINDS = ["all", "manual", "subscription"] as const;

export function InvoicesClient({
  invoices,
  businesses,
}: {
  invoices: InvoiceListRow[];
  businesses: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return invoices.filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (kind === "all" || r.kind === kind) &&
        (!term || r.invoiceNumber.toLowerCase().includes(term) || r.billedTo.toLowerCase().includes(term)),
    );
  }, [invoices, status, kind, q]);

  const outstanding = invoices.filter((r) => r.status === "open").reduce((n, r) => n + r.amountRaw, 0);
  const paidTotal = invoices.filter((r) => r.status === "paid").reduce((n, r) => n + r.amountRaw, 0);

  const cols: Column<InvoiceListRow>[] = [
    {
      key: "invoiceNumber",
      header: "Invoice",
      render: (r) => (
        <Link href={`/admin/invoices/${r.id}`} className="group flex items-center gap-1.5 font-medium text-fg hover:text-primary">
          {r.invoiceNumber}
          <ChevronRight className="h-4 w-4 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
      ),
    },
    { key: "billedTo", header: "Billed to", render: (r) => r.billedTo },
    {
      key: "kind",
      header: "Type",
      render: (r) => <Badge tone={r.kind === "manual" ? "primary" : "neutral"}>{r.kind}</Badge>,
    },
    { key: "amount", header: "Amount", render: (r) => r.amount },
    {
      key: "issuedOn",
      header: "Issued",
      render: (r) => (r.issuedOn ? new Date(r.issuedOn).toLocaleDateString("en-US") : "—"),
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      render: (r) => (
        <span className="flex items-center justify-end gap-2">
          {r.sent && <span className="text-xs text-fg-subtle">sent</span>}
          <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>{r.status}</Badge>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-fg">Invoices</h1>
          <p className="mt-1 text-sm text-fg-muted">Create, edit, send and track every invoice.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New invoice
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Invoices" value={invoices.length.toLocaleString("en-US")} />
        <StatCard label="Outstanding" value={money(outstanding, "BDT")} invert />
        <StatCard label="Collected" value={money(paidTotal, "BDT")} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              status === s ? "border-primary bg-primary-soft text-primary" : "border-border text-fg-muted hover:border-primary"
            }`}
          >
            {s}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        {KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              kind === k ? "border-primary bg-primary-soft text-primary" : "border-border text-fg-muted hover:border-primary"
            }`}
          >
            {k}
          </button>
        ))}
        <Input
          className="ml-auto w-48"
          placeholder="Search #/business…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <Card>
        <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} empty={{ title: "No invoices match" }} />
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title="New invoice" size="lg">
        <InvoiceForm
          businesses={businesses}
          submitLabel="Create invoice"
          onCancel={() => setCreating(false)}
          onSubmit={async (input) => {
            const res = await createInvoice(input);
            if ("ok" in res) {
              setCreating(false);
              router.push(`/admin/invoices/${res.id}`);
            }
            return res;
          }}
        />
      </Modal>
    </div>
  );
}
