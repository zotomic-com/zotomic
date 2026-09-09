"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { DataGrid, type GridColumn } from "@/components/app/DataGrid";
import { ListToolbar } from "@/components/app/ListToolbar";
import { createReturn } from "./actions";

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
  customer: string;
  status: string;
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

export function ReturnsGrid({
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
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [creating, setCreating] = useState(false);

  const [orderId, setOrderId] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState("0");
  const [restock, setRestock] = useState(true);
  const order = orders.find((o) => o.id === orderId);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (!t || r.number.toLowerCase().includes(t) || r.orderNumber.toLowerCase().includes(t) || r.customer.toLowerCase().includes(t)),
    );
  }, [rows, q, status]);

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;

  const openCreate = () => {
    setOrderId(orders[0]?.id ?? "");
    setQty({});
    setReason("");
    setRefund("0");
    setRestock(true);
    setCreating(true);
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
      if ("error" in res) return toast(res.error, "error");
      toast("Return created", "success");
      setCreating(false);
      router.push(`/app/returns/${res.id}`);
    });

  const cols: GridColumn<ReturnRow>[] = [
    { key: "number", header: "Return", render: (r) => <span className="font-medium text-fg">{r.number}</span> },
    { key: "order", header: "Order", render: (r) => `#${r.orderNumber}` },
    { key: "customer", header: "Customer", render: (r) => r.customer },
    { key: "refund", header: "Refund", align: "right", render: (r) => r.refund },
    { key: "restock", header: "Restock", render: (r) => (r.restock ? "Yes" : "No") },
    { key: "date", header: "Date", align: "right", render: (r) => r.date },
    { key: "status", header: "Status", align: "right", render: (r) => <Badge tone={TONE[r.status] ?? "neutral"}>{r.status}</Badge> },
  ];

  return (
    <div className="space-y-4">
      <ListToolbar
        search={q}
        onSearch={setQ}
        searchPlaceholder="Return, order # or customer…"
        actions={
          <Button onClick={openCreate} disabled={!orders.length}>
            <Plus className="h-4 w-4" /> New return
          </Button>
        }
        filters={[
          {
            key: "status",
            value: status,
            onChange: setStatus,
            options: [
              { value: "all", label: "All", count: rows.length },
              ...["requested", "approved", "received", "refunded", "rejected"]
                .filter((s) => counts[s])
                .map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1), count: counts[s] })),
            ],
          },
        ]}
      />

      {!orders.length && (
        <p className="text-sm text-fg-subtle">No eligible orders yet — returns are created against shipped/delivered orders.</p>
      )}

      <div className="card">
        <DataGrid
          columns={cols}
          rows={shown}
          rowKey={(r) => r.id}
          rowHref={(r) => `/app/returns/${r.id}`}
          empty={{ title: "No returns" }}
        />
      </div>

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
                      setRefund(String(order.items.reduce((s, x) => s + (next[x.id] ?? 0) * x.unitPrice, 0)));
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
    </div>
  );
}
