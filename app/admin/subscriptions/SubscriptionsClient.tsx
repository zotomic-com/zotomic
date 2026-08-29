"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { confirmPayment, voidInvoice } from "./actions";

export interface PendingRow {
  invoiceId: string;
  business: string;
  invoiceNumber: string;
  amount: string;
  txnId: string;
  txnAmount: string;
  submittedAt: string;
  reference: string;
}

export function PendingQueue({ rows }: { rows: PendingRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const confirm = (id: string) =>
    start(async () => {
      const res = await confirmPayment(id);
      if ("error" in res && res.error) toast(res.error, "error");
      else {
        toast("Payment confirmed — account reactivated", "success");
        router.refresh();
      }
    });

  const reject = (id: string) =>
    start(async () => {
      await voidInvoice(id);
      toast("Invoice voided", "info");
      router.refresh();
    });

  if (rows.length === 0) {
    return <EmptyState title="Queue is empty" description="Submitted bKash payments show up here for one-click confirmation." />;
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.invoiceId} className="rounded border border-border bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-fg">{r.business}</p>
              <p className="text-xs text-fg-subtle">
                {r.invoiceNumber} · {r.amount} · ref {r.reference}
              </p>
            </div>
            <Badge tone="warning">awaiting confirmation</Badge>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-fg-subtle">Txn ID</dt>
              <dd className="font-mono text-fg">{r.txnId}</dd>
            </div>
            <div>
              <dt className="text-fg-subtle">Amount submitted</dt>
              <dd className="text-fg">{r.txnAmount}</dd>
            </div>
            <div>
              <dt className="text-fg-subtle">Submitted</dt>
              <dd className="text-fg">{r.submittedAt}</dd>
            </div>
          </dl>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => confirm(r.invoiceId)} disabled={pending}>
              Mark as paid
            </Button>
            <Button size="sm" variant="outline" onClick={() => reject(r.invoiceId)} disabled={pending}>
              Void
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
