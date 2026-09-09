"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { money } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { OrderStatusBadge } from "@/components/app/OrderStatusBadge";
import { DataGrid, type GridColumn } from "@/components/app/DataGrid";
import { ListToolbar } from "@/components/app/ListToolbar";
import { BulkBar } from "@/components/app/BulkBar";
import { OrderImport } from "./OrderImport";
import { bulkSetOrderStatus } from "./actions";

export interface OrderRow {
  id: string;
  number: string;
  customer: string;
  items: number;
  total: number;
  status: string;
  payment: string;
  paid: boolean;
  placed: string;
}

const STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "returned", "cancelled"];

export function OrdersGrid({
  orders,
  currency,
  counts,
}: {
  orders: OrderRow[];
  currency: string;
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [pay, setPay] = useState("all");
  const [sel, setSel] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return orders.filter(
      (o) =>
        (status === "all" || o.status === status) &&
        (pay === "all" || (pay === "cod" ? o.payment === "cod" : pay === "paid" ? o.paid : !o.paid && o.payment !== "cod")) &&
        (!t || o.number.toLowerCase().includes(t) || o.customer.toLowerCase().includes(t)),
    );
  }, [orders, q, status, pay]);

  const run = (next: string) =>
    start(async () => {
      const res = await bulkSetOrderStatus([...sel], next);
      if ("error" in res) return toast(res.error, "error");
      toast(`${res.count} order(s) → ${next}`, "success");
      setSel(new Set());
      router.refresh();
    });

  const cols: GridColumn<OrderRow>[] = [
    { key: "number", header: "Order", render: (o) => <span className="font-medium text-fg">#{o.number}</span> },
    { key: "customer", header: "Customer", render: (o) => o.customer },
    { key: "items", header: "Items", align: "right", render: (o) => o.items },
    {
      key: "payment",
      header: "Payment",
      render: (o) => (
        <span className={o.paid ? "text-success" : o.payment === "cod" ? "text-fg-muted" : "text-warning"}>
          {o.payment === "cod" ? "COD" : o.payment}
          {o.paid ? " · paid" : ""}
        </span>
      ),
    },
    { key: "total", header: "Amount", align: "right", render: (o) => money(o.total, currency) },
    { key: "placed", header: "Date", align: "right", render: (o) => o.placed },
    { key: "status", header: "Status", align: "right", render: (o) => <OrderStatusBadge status={o.status} /> },
  ];

  return (
    <div className="space-y-4">
      <ListToolbar
        search={q}
        onSearch={setQ}
        searchPlaceholder="Order # or customer…"
        actions={
          <>
            <OrderImport />
            <Button href="/app/orders/new">
              <Plus className="h-4 w-4" /> New order
            </Button>
          </>
        }
        filters={[
          {
            key: "status",
            value: status,
            onChange: setStatus,
            options: [
              { value: "all", label: "All", count: orders.length },
              ...STATUSES.filter((s) => counts[s]).map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1), count: counts[s] })),
            ],
          },
          {
            key: "pay",
            label: "Payment",
            value: pay,
            onChange: setPay,
            options: [
              { value: "all", label: "All" },
              { value: "paid", label: "Paid" },
              { value: "cod", label: "COD" },
              { value: "unpaid", label: "Unpaid" },
            ],
          },
        ]}
      />

      <div className="card">
        <DataGrid
          columns={cols}
          rows={rows}
          rowKey={(o) => o.id}
          rowHref={(o) => `/app/orders/${o.id}`}
          selected={sel}
          onSelectedChange={setSel}
          empty={{ title: "No orders match", description: "Storefront and manual orders appear here." }}
        />
      </div>

      <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
        {["confirmed", "processing", "shipped", "delivered"].map((s) => (
          <Button key={s} size="sm" variant="outline" disabled={pending} onClick={() => run(s)} className="capitalize">
            {s}
          </Button>
        ))}
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run("cancelled")} className="text-danger">
          Cancel
        </Button>
      </BulkBar>
    </div>
  );
}
