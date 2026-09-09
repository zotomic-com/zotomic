import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { money } from "@/lib/money";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/ui/stat-card";
import { CustomersGrid, type CustomerRow } from "./CustomersGrid";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");
  const currency = tenant.business.currency ?? "BDT";
  const db = getAdminSupabase();

  const { data } = await db
    .from("customers")
    .select("id, name, city, phone, total_orders, total_spent, last_order_at, first_order_at")
    .eq("business_id", tenant.businessId)
    .order("total_spent", { ascending: false })
    .limit(300);

  const now = Date.now();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  const rows: CustomerRow[] = (data ?? []).map((c) => {
    const lastAt = c.last_order_at ? new Date(c.last_order_at as string).getTime() : null;
    return {
      id: c.id as string,
      name: (c.name as string) ?? "Guest",
      city: (c.city as string) ?? null,
      phone: (c.phone as string) ?? null,
      orders: Number(c.total_orders ?? 0),
      spent: Number(c.total_spent ?? 0),
      last: lastAt ? new Date(lastAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null,
      lastDays: lastAt ? Math.floor((now - lastAt) / 86400000) : null,
      firstThisMonth: c.first_order_at ? new Date(c.first_order_at as string).getTime() >= monthStart : false,
    };
  });

  const repeat = rows.filter((r) => r.orders > 1).length;
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const aov = rows.reduce((s, r) => s + r.orders, 0) > 0 ? totalSpent / rows.reduce((s, r) => s + r.orders, 0) : 0;

  return (
    <div className="space-y-5">
      <PageHeader title="Customers" subtitle={`${rows.length} customers`} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Customers" value={rows.length.toLocaleString("en-US")} />
        <StatCard label="Repeat rate" value={rows.length ? `${Math.round((repeat / rows.length) * 100)}%` : "—"} />
        <StatCard label="Avg order value" value={money(aov, currency)} />
        <StatCard label="Lifetime revenue" value={money(totalSpent, currency)} />
      </div>

      <CustomersGrid customers={rows} currency={currency} />
    </div>
  );
}
