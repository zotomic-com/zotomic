import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { money } from "@/lib/money";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  name: string;
  city: string | null;
  orders: number;
  spent: number;
  last: string | null;
  repeat: boolean;
}

export default async function CustomersPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");

  const currency = tenant.business.currency ?? "BDT";
  const db = getAdminSupabase();

  const { data } = await db
    .from("customers")
    .select("id, name, city, total_orders, total_spent, last_order_at, first_order_at")
    .eq("business_id", tenant.businessId)
    .order("total_spent", { ascending: false })
    .limit(100);

  const rows: Row[] = (data ?? []).map((c) => ({
    id: c.id as string,
    name: (c.name as string) ?? "Guest",
    city: (c.city as string) ?? null,
    orders: Number(c.total_orders ?? 0),
    spent: Number(c.total_spent ?? 0),
    last: c.last_order_at
      ? new Date(c.last_order_at as string).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null,
    repeat: Number(c.total_orders ?? 0) > 1,
  }));

  const repeat = rows.filter((r) => r.repeat).length;
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);

  const cols: Column<Row>[] = [
    { key: "name", header: "Customer", render: (r) => <span className="font-medium text-fg">{r.name}</span> },
    { key: "city", header: "City", render: (r) => r.city ?? "—" },
    { key: "orders", header: "Orders", align: "right", render: (r) => r.orders },
    { key: "spent", header: "Total spent", align: "right", render: (r) => money(r.spent, currency) },
    { key: "last", header: "Last order", align: "right", render: (r) => r.last ?? "—" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Customers" subtitle={`${rows.length} customers · minimal contact detail shown`} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Customers" value={rows.length.toLocaleString("en-US")} />
        <StatCard label="Repeat customers" value={repeat.toLocaleString("en-US")} />
        <StatCard label="Lifetime revenue" value={money(totalSpent, currency)} />
      </div>

      <Card>
        <DataTable
          columns={cols}
          rows={rows}
          rowKey={(r) => r.id}
          empty={{ title: "No customers yet", description: "Customers are created automatically at checkout." }}
        />
      </Card>
    </div>
  );
}
