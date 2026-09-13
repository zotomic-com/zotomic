"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { markOrderPaidAction, retryFulfillmentAction, cancelItemAction, renewItemAction, deleteDomainRecordAction } from "./actions";
import { DomainFormModal, type DomainFormValues } from "./DomainFormModal";

interface OrderRow {
  id: string;
  cartOrderId: string;
  orderNumber: string;
  domainName: string;
  itemType: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  pointTo: string;
  status: string;
  orderStatus: string;
  paymentMethod: string;
  retailPrice: number;
  wholesaleCost: number;
  invoiceAmount: number;
  expiresAt: string | null;
  lastError: string | null;
  createdAt: string;
}

const STATUS_TONE: Record<string, "neutral" | "success" | "danger" | "warning" | "info"> = {
  pending: "warning",
  registering: "info",
  transferring: "info",
  active: "success",
  grace: "warning",
  dropped: "danger",
  failed: "danger",
  cancelled: "neutral",
};

function expiryBadge(expiresAt: string | null) {
  if (!expiresAt) return null;
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
  const tone = days <= 7 ? "danger" : days <= 30 ? "warning" : "neutral";
  return <Badge tone={tone}>{days < 0 ? "expired" : `${days}d left`}</Badge>;
}

function toFormValues(o: OrderRow): DomainFormValues {
  return {
    domainName: o.domainName,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerEmail: o.customerEmail,
    pointTo: o.pointTo === "zotomic" ? "zotomic" : "self",
    paymentMethod: o.paymentMethod === "nagad" ? "nagad" : "bkash",
    retailPrice: String(o.retailPrice ?? ""),
    wholesaleCost: o.wholesaleCost ? String(o.wholesaleCost) : "",
    status: o.status,
    expiresAt: o.expiresAt ? o.expiresAt.slice(0, 10) : "",
  };
}

export function OrdersTable({ orders }: { orders: OrderRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<OrderRow | null>(null);

  const run = (fn: () => Promise<{ ok: true } | { error: string }>, ok: string) =>
    start(async () => {
      const res = await fn();
      if ("error" in res) toast(res.error, "error");
      else {
        toast(ok, "success");
        router.refresh();
      }
    });

  const remove = (o: OrderRow) => {
    if (!confirm(`Permanently delete ${o.domainName}? This cannot be undone.`)) return;
    run(() => deleteDomainRecordAction(o.id), "Deleted");
  };

  const cols: Column<OrderRow>[] = [
    {
      key: "domain",
      header: "Domain",
      render: (o) => (
        <div>
          <p className="font-medium text-fg">{o.domainName}</p>
          <p className="text-xs text-fg-subtle">
            {o.orderNumber} · {o.itemType === "transfer" ? "transfer" : "new"}
          </p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (o) => (
        <div>
          <p className="text-fg">{o.customerName}</p>
          <p className="text-xs text-fg-subtle">{o.customerPhone}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (o) => (
        <div>
          {o.orderStatus === "pending_payment" ? (
            <Badge tone="warning">awaiting payment</Badge>
          ) : (
            <Badge tone={STATUS_TONE[o.status] ?? "neutral"}>{o.status.replace("_", " ")}</Badge>
          )}
          {o.lastError && <p className="mt-1 max-w-[220px] text-xs text-danger">{o.lastError}</p>}
        </div>
      ),
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      render: (o) => (
        <div className="text-right">
          <p className="font-mono text-sm">৳{o.invoiceAmount.toFixed(2)}</p>
          <p className="text-xs text-fg-subtle uppercase">{o.paymentMethod}</p>
        </div>
      ),
    },
    { key: "expiry", header: "Expiry", align: "right", render: (o) => <div className="text-right">{expiryBadge(o.expiresAt)}</div> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (o) => (
        <div className="flex flex-wrap justify-end gap-2 text-xs">
          {o.orderStatus === "pending_payment" && (
            <button disabled={pending} onClick={() => run(() => markOrderPaidAction(o.cartOrderId), "Marked paid")} className="font-medium text-primary hover:underline">
              Mark paid
            </button>
          )}
          {o.status === "failed" && (
            <button disabled={pending} onClick={() => run(() => retryFulfillmentAction(o.id), "Retrying…")} className="font-medium text-primary hover:underline">
              Retry
            </button>
          )}
          {(o.status === "active" || o.status === "grace") && (
            <button disabled={pending} onClick={() => run(() => renewItemAction(o.id), "Renewed")} className="font-medium text-primary hover:underline">
              Renew now
            </button>
          )}
          {(o.status === "pending" || o.status === "failed") && (
            <button
              disabled={pending}
              onClick={() => {
                if (confirm(`Cancel ${o.domainName}?`)) run(() => cancelItemAction(o.id), "Cancelled");
              }}
              className="font-medium text-fg-subtle hover:text-danger"
            >
              Cancel
            </button>
          )}
          <button disabled={pending} onClick={() => setEditing(o)} className="text-fg-subtle hover:text-fg" aria-label="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button disabled={pending} onClick={() => remove(o)} className="text-fg-subtle hover:text-danger" aria-label="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Card>
        <CardHeader className="flex items-center justify-between">
          <span className="text-sm font-semibold text-fg">Domains</span>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add domain
          </Button>
        </CardHeader>
        <DataTable columns={cols} rows={orders} rowKey={(o) => o.id} empty={{ title: "No domain orders yet" }} />
      </Card>

      {addOpen && <DomainFormModal open={addOpen} onClose={() => setAddOpen(false)} />}
      {editing && <DomainFormModal open={!!editing} onClose={() => setEditing(null)} itemId={editing.id} initial={toFormValues(editing)} />}
    </>
  );
}
