"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { DataGrid, type GridColumn } from "@/components/app/DataGrid";
import { ListToolbar } from "@/components/app/ListToolbar";

export interface CustomerRow {
  id: string;
  name: string;
  city: string | null;
  phone: string | null;
  orders: number;
  spent: number;
  last: string | null;
  lastDays: number | null;
  firstThisMonth: boolean;
}

export function CustomersGrid({ customers, currency }: { customers: CustomerRow[]; currency: string }) {
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState("all");

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return customers.filter((c) => {
      if (t && !c.name.toLowerCase().includes(t) && !(c.phone ?? "").includes(t) && !(c.city ?? "").toLowerCase().includes(t))
        return false;
      if (seg === "repeat") return c.orders > 1;
      if (seg === "new") return c.firstThisMonth;
      if (seg === "inactive") return c.lastDays != null && c.lastDays > 90;
      return true;
    });
  }, [customers, q, seg]);

  const counts = {
    all: customers.length,
    repeat: customers.filter((c) => c.orders > 1).length,
    new: customers.filter((c) => c.firstThisMonth).length,
    inactive: customers.filter((c) => c.lastDays != null && c.lastDays > 90).length,
  };

  const cols: GridColumn<CustomerRow>[] = [
    {
      key: "name",
      header: "Customer",
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{c.name}</p>
          {c.phone && <p className="text-xs text-fg-subtle">{c.phone}</p>}
        </div>
      ),
    },
    { key: "city", header: "City", render: (c) => c.city ?? "—" },
    { key: "orders", header: "Orders", align: "right", render: (c) => c.orders },
    { key: "spent", header: "Total spent", align: "right", render: (c) => money(c.spent, currency) },
    {
      key: "last",
      header: "Last order",
      align: "right",
      render: (c) =>
        c.last ? (
          <span className={c.lastDays != null && c.lastDays > 90 ? "text-warning" : undefined}>{c.last}</span>
        ) : (
          "—"
        ),
    },
    {
      key: "tag",
      header: "",
      align: "right",
      render: (c) =>
        c.orders > 1 ? <Badge tone="primary">repeat</Badge> : c.firstThisMonth ? <Badge tone="neutral">new</Badge> : null,
    },
  ];

  return (
    <div className="space-y-4">
      <ListToolbar
        search={q}
        onSearch={setQ}
        searchPlaceholder="Name, phone or city…"
        filters={[
          {
            key: "seg",
            value: seg,
            onChange: setSeg,
            options: [
              { value: "all", label: "All", count: counts.all },
              { value: "repeat", label: "Repeat", count: counts.repeat },
              { value: "new", label: "New this month", count: counts.new },
              { value: "inactive", label: "Inactive 90d+", count: counts.inactive },
            ],
          },
        ]}
      />
      <div className="card">
        <DataGrid
          columns={cols}
          rows={rows}
          rowKey={(c) => c.id}
          rowHref={(c) => `/app/customers/${c.id}`}
          empty={{ title: "No customers match", description: "Customers are created automatically at checkout." }}
        />
      </div>
    </div>
  );
}
