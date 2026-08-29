import { requireAdmin, adminDb } from "@/lib/admin-server";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminAuditLogsPage() {
  await requireAdmin();
  const db = adminDb();

  const { data } = await db
    .from("audit_logs")
    .select("id, action, summary, actor_type, target_type, created_at, businesses(name)")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []).map((a) => ({
    id: a.id as string,
    action: a.action as string,
    summary: (a.summary as string) ?? "—",
    actor: (a.actor_type as string) ?? "system",
    business: ((Array.isArray(a.businesses) ? a.businesses[0] : a.businesses) as { name?: string } | null)?.name ?? "—",
    at: new Date(a.created_at as string).toLocaleString("en-US"),
  }));

  const cols: Column<(typeof rows)[number]>[] = [
    { key: "action", header: "Action", render: (r) => <span className="font-medium text-fg">{r.action}</span> },
    { key: "summary", header: "Detail", render: (r) => r.summary },
    { key: "business", header: "Business", render: (r) => r.business },
    { key: "actor", header: "Actor", render: (r) => <Badge tone="neutral">{r.actor}</Badge> },
    { key: "at", header: "When", align: "right", render: (r) => r.at },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-fg">Audit Logs</h1>
        <p className="mt-1 text-sm text-fg-muted">Security-sensitive and write actions across the platform.</p>
      </div>
      <Card>
        <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} empty={{ title: "No audit entries" }} />
      </Card>
    </div>
  );
}
