import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { InventoryClient, type StockRow } from "./InventoryClient";

export const dynamic = "force-dynamic";

const LOW = 5;

export default async function InventoryPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");

  const db = getAdminSupabase();
  const [{ data: products }, { data: variants }, { data: adj }] = await Promise.all([
    db
      .from("products")
      .select("id, name, sku, stock_qty, has_variants, track_inventory, status")
      .eq("business_id", tenant.businessId)
      .neq("status", "archived")
      .order("name"),
    db
      .from("product_variants")
      .select("id, product_id, name, sku, stock_qty, active")
      .eq("business_id", tenant.businessId)
      .eq("active", true),
    db
      .from("inventory_adjustments")
      .select("id, product_id, variant_id, delta, balance, reason, note, created_at")
      .eq("business_id", tenant.businessId)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const pName = new Map((products ?? []).map((p) => [p.id as string, p.name as string]));

  const rows: StockRow[] = [];
  for (const p of products ?? []) {
    if (p.has_variants) {
      for (const v of (variants ?? []).filter((x) => x.product_id === p.id)) {
        rows.push({
          key: v.id as string,
          productId: p.id as string,
          variantId: v.id as string,
          label: `${p.name} — ${v.name}`,
          sku: (v.sku as string) ?? "",
          stock: Number(v.stock_qty),
          tracked: true,
        });
      }
    } else {
      rows.push({
        key: p.id as string,
        productId: p.id as string,
        variantId: null,
        label: p.name as string,
        sku: (p.sku as string) ?? "",
        stock: Number(p.stock_qty),
        tracked: !!p.track_inventory,
      });
    }
  }

  const lowCount = rows.filter((r) => r.tracked && r.stock <= LOW).length;
  const outCount = rows.filter((r) => r.tracked && r.stock <= 0).length;
  const totalUnits = rows.reduce((s, r) => s + Math.max(0, r.stock), 0);

  const history = (adj ?? []).map((a) => ({
    id: a.id as string,
    item: pName.get(a.product_id as string) ?? "—",
    delta: Number(a.delta),
    balance: a.balance == null ? null : Number(a.balance),
    reason: a.reason as string,
    note: (a.note as string) ?? "",
    when: new Date(a.created_at as string).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  const histCols: Column<(typeof history)[number]>[] = [
    { key: "item", header: "Product", render: (r) => r.item },
    { key: "reason", header: "Reason", render: (r) => <span className="capitalize">{r.reason}</span> },
    {
      key: "delta",
      header: "Change",
      align: "right",
      render: (r) => (
        <span className={r.delta < 0 ? "text-danger" : "text-success"}>
          {r.delta > 0 ? "+" : ""}
          {r.delta}
        </span>
      ),
    },
    { key: "balance", header: "Balance", align: "right", render: (r) => (r.balance ?? "—") },
    { key: "when", header: "Date", align: "right", render: (r) => r.when },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Inventory" subtitle="Stock on hand across products and variants." />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Tracked items" value={rows.filter((r) => r.tracked).length.toLocaleString("en-US")} />
        <StatCard label="Units on hand" value={totalUnits.toLocaleString("en-US")} />
        <StatCard label={`Low stock (≤${LOW})`} value={lowCount.toLocaleString("en-US")} invert />
        <StatCard label="Out of stock" value={outCount.toLocaleString("en-US")} invert />
      </div>

      <InventoryClient rows={rows} lowThreshold={LOW} />

      <Card>
        <CardHeader>
          <CardTitle>Recent stock changes</CardTitle>
        </CardHeader>
        <DataTable columns={histCols} rows={history} rowKey={(r) => r.id} empty={{ title: "No adjustments yet" }} />
      </Card>
    </div>
  );
}
