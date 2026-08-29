import Link from "next/link";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { money } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminTenantsPage() {
  await requireAdmin();
  const db = adminDb();

  const { data: businesses } = await db
    .from("businesses")
    .select("id, name, type, currency, status, created_at")
    .order("created_at", { ascending: false });

  const ids = (businesses ?? []).map((b) => b.id as string);
  const [{ data: subs }, { data: members }, { data: orders }] = await Promise.all([
    db.from("subscriptions").select("business_id, plan, status").in("business_id", ids),
    db.from("business_members").select("business_id, users(name, email)").eq("role", "owner").in("business_id", ids),
    db.from("orders").select("business_id, total, status").in("business_id", ids).neq("status", "cancelled"),
  ]);

  const rev = new Map<string, number>();
  for (const o of orders ?? []) rev.set(o.business_id as string, (rev.get(o.business_id as string) ?? 0) + Number(o.total));

  const rows = (businesses ?? []).map((b) => {
    const sub = (subs ?? []).find((s) => s.business_id === b.id);
    const mem = (members ?? []).find((m) => m.business_id === b.id);
    const owner = (Array.isArray(mem?.users) ? mem?.users[0] : mem?.users) as { name?: string; email?: string } | null;
    return {
      id: b.id as string,
      name: b.name as string,
      owner: owner?.name ?? "—",
      email: owner?.email ?? "",
      plan: sub?.plan ?? "free",
      status: sub?.status ?? "active",
      revenue: money(rev.get(b.id as string) ?? 0, (b.currency as string) ?? "BDT"),
      joined: new Date(b.created_at as string).toLocaleDateString("en-US"),
    };
  });

  const cols: Column<(typeof rows)[number]>[] = [
    {
      key: "name",
      header: "Business",
      render: (r) => (
        <Link href={`/admin/tenants/${r.id}`} className="block">
          <p className="font-medium text-primary">{r.name}</p>
          <p className="text-xs text-fg-subtle">{r.email}</p>
        </Link>
      ),
    },
    { key: "owner", header: "Owner", render: (r) => r.owner },
    { key: "plan", header: "Plan", render: (r) => <Badge tone={r.plan === "free" ? "neutral" : "primary"}>{r.plan}</Badge> },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge tone={r.status === "active" ? "success" : r.status === "cancelled" ? "neutral" : "danger"}>
          {r.status}
        </Badge>
      ),
    },
    { key: "revenue", header: "Revenue", align: "right", render: (r) => r.revenue },
    { key: "joined", header: "Joined", align: "right", render: (r) => r.joined },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-fg">Tenants / Businesses</h1>
        <p className="mt-1 text-sm text-fg-muted">{rows.length} businesses on the platform.</p>
      </div>
      <Card>
        <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} empty={{ title: "No businesses yet" }} />
      </Card>
    </div>
  );
}
