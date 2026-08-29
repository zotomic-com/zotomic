import { requireAdmin, adminDb } from "@/lib/admin-server";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const TONE = { ready: "success", generating: "info", queued: "neutral", failed: "danger" } as const;

export default async function AdminReportsPage() {
  await requireAdmin();
  const db = adminDb();

  const { data } = await db
    .from("reports")
    .select("id, status, period_start, period_end, model, error, generated_at, created_at, businesses(name)")
    .order("created_at", { ascending: false })
    .limit(200);

  const all = data ?? [];
  const counts = {
    ready: all.filter((r) => r.status === "ready").length,
    queued: all.filter((r) => r.status === "queued").length,
    failed: all.filter((r) => r.status === "failed").length,
  };

  const rows = all.map((r) => ({
    id: r.id as string,
    business: ((Array.isArray(r.businesses) ? r.businesses[0] : r.businesses) as { name?: string } | null)?.name ?? "—",
    period: `${r.period_start} – ${r.period_end}`,
    status: r.status as keyof typeof TONE,
    model: (r.model as string) ?? "—",
    detail: (r.error as string) ?? (r.generated_at ? new Date(r.generated_at as string).toLocaleString("en-US") : "—"),
  }));

  const cols: Column<(typeof rows)[number]>[] = [
    { key: "business", header: "Business", render: (r) => <span className="font-medium text-fg">{r.business}</span> },
    { key: "period", header: "Period", render: (r) => r.period },
    { key: "status", header: "Status", render: (r) => <Badge tone={TONE[r.status] ?? "neutral"}>{r.status}</Badge> },
    { key: "model", header: "Model", render: (r) => r.model },
    { key: "detail", header: "Detail", render: (r) => <span className="text-xs">{r.detail}</span> },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-fg">Report jobs</h1>
        <p className="mt-1 text-sm text-fg-muted">Weekly Intelligence generation across all businesses.</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Ready" value={counts.ready.toLocaleString("en-US")} />
        <StatCard label="Queued" value={counts.queued.toLocaleString("en-US")} />
        <StatCard label="Failed" value={counts.failed.toLocaleString("en-US")} invert />
      </div>
      <Card>
        <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} empty={{ title: "No report jobs" }} />
      </Card>
    </div>
  );
}
