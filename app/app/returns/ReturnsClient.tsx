"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DataTable, type Column } from "@/components/ui/data-table";
import { useToast } from "@/components/ui/toast";
import { createReturn, setReturnStatus } from "./actions";

export interface OrderOption {
  id: string;
  number: string;
  customer: string;
  total: string;
  items: { id: string; name: string; qty: number; unitPrice: number }[];
}
export interface ReturnRow {
  id: string;
  number: string;
  orderNumber: string;
  status: string;
  reason: string;
  refund: string;
  restock: boolean;
  date: string;
}

const TONE: Record<string, "neutral" | "warning" | "success" | "danger" | "primary"> = {
  requested: "warning",
  approved: "primary",
  received: "primary",
  refunded: "success",
  rejected: "danger",
  cancelled: "neutral",
};

const NEXT: Record<string, { label: string; to: string }[]> = {
  requested: [
    { label: "Approve", to: "approved" },
    { label: "Reject", to: "rejected" },
  ],
  approved: [{ label: "Mark received", to: "received" }],
  received: [{ label: "Mark refunded", to: "refunded" }],
};

export function ReturnsClient({
  rows,
  orders,
  currency,
}: {
  rows: ReturnRow[];
  orders: OrderOption[];
  currency: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);

  const [orderId, setOrderId] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState("0");
  const [restock, setRestock] = useState(true);

  const order = orders.find((o) => o.id === orderId);

  const openCreate = () => {
    setOrderId(orders[0]?.id ?? "");
    setQty({});
    setReason("");
    setRefund("0");
    setRestock(true);
    setCreating(true);
  };

  const suggestRefund = (next: Record<string, number>) => {
    if (!order) return;
    const total = order.items.reduce((s, it) => s + (next[it.id] ?? 0) * it.unitPrice, 0);
    setRefund(String(total));
  };

  const submit = () =>
    start(async () => {
      const res = await createReturn({
        orderId,
        reason,
        refundAmount: Number(refund) || 0,
        restock,
        items: Object.entries(qty).map(([orderItemId, q]) => ({ orderItemId, qty: q })),
      });
      if ("error" in res) toast(res.error, "error");
      else {
        toast("Return created", "success");
        setCreating(false);
        router.refresh();
      }
    });

  const move = (id: string, to: string) =>
    start(async () => {
      const res = await setReturnStatus(id, to as never);
      if ("error" in res) toast(res.error, "error");
      else {
        toast(`Marked ${to}`, "success");
        router.refresh();
      }
    });

  const cols: Column<ReturnRow>[] = [
    { key: "number", header: "Return", render: (r) => <span className="font-medium text-fg">{r.number}</span> },
    { key: "order", header: "Order", render: (r) => `#${r.orderNumber}` },
    { key: "refund", header: "Refund", align: "right", render: (r) => r.refund },
    {
      key: "restock",
      header: "Restock",
      render: (r) => (r.restock ? <Badge tone="neutral">yes</Badge> : <Badge tone="neutral">no</Badge>),
    },
    { key: "date", header: "Date", render: (r) => r.date },
    {
      key: "status",
      header: "Status",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <Badge tone={TONE[r.status] ?? "neutral"}>{r.status}</Badge>
          {(NEXT[r.status] ?? []).map((n) => (
            <Button key={n.to} size="sm" variant="ghost" disabled={pending} onClick={() => move(r.id, n.to)}>
              {n.label}
            </Button>
          ))}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={openCreate} disabled={!orders.length}>
          <Plus className="h-4 w-4" /> New return
        </Button>
      </div>
      {!orders.length && (
        <p className="text-sm text-fg-subtle">No eligible orders yet — returns are created against delivered orders.</p>
      )}

      <Card>
        <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} empty={{ title: "No returns" }} />
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title="New return" size="lg">
        <div className="space-y-3">
          <Field label="Order">
            <Select
              value={orderId}
              onChange={(e) => {
                setOrderId(e.target.value);
                setQty({});
                setRefund("0");
              }}
            >
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  #{o.number} · {o.customer} · {o.total}
                </option>
              ))}
            </Select>
          </Field>

          {order && (
            <div className="rounded-sm border border-border">
              {order.items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg">{it.name}</p>
                    <p className="text-xs text-fg-subtle">
                      {it.qty} × {currency} {it.unitPrice}
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={it.qty}
                    className="w-20"
                    value={qty[it.id] ?? 0}
                    onChange={(e) => {
                      const next = { ...qty, [it.id]: Math.min(it.qty, Math.max(0, Number(e.target.value) || 0)) };
                      setQty(next);
                      suggestRefund(next);
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          <Field label="Reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong size, damaged, …" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Refund amount (${currency})`}>
              <Input type="number" min={0} value={refund} onChange={(e) => setRefund(e.target.value)} />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm text-fg">
              <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
              Restock items when received
            </label>
          </div>

          <Button onClick={submit} disabled={pending || !order} className="w-full">
            {pending ? "Creating…" : "Create return"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
