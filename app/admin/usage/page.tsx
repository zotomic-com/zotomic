import { requireAdmin, adminDb } from "@/lib/admin-server";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";

export const dynamic = "force-dynamic";

export default async function AdminUsagePage() {
  await requireAdmin();
  const db = adminDb();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [{ data: ledger }, { data: biz }, { data: media }, { data: reports }] = await Promise.all([
    db.from("usage_ledger").select("business_id, kind, units, cost").gte("created_at", since),
    db.from("businesses").select("id, name"),
    db.from("media_assets").select("business_id, bytes"),
    db.from("reports").select("business_id").eq("status", "ready").gte("created_at", since),
  ]);

  const nameMap = new Map((biz ?? []).map((b) => [b.id as string, b.name as string]));
  const agg = new Map<string, { toolCalls: number; credits: number; storageMB: number; reports: number }>();
  const bump = (id: string) => {
    if (!agg.has(id)) agg.set(id, { toolCalls: 0, credits: 0, storageMB: 0, reports: 0 });
    return agg.get(id)!;
  };
  for (const l of ledger ?? []) {
    const a = bump(l.business_id as string);
    if (l.kind === "tool_call") a.toolCalls += Number(l.units);
    a.credits += Number(l.cost);
  }
  for (const m of media ?? []) bump(m.business_id as string).storageMB += Number(m.bytes ?? 0) / 1_048_576;
  for (const r of reports ?? []) bump(r.business_id as string).reports += 1;

  const rows = [...agg.entries()].map(([id, v]) => ({
    id,
    business: nameMap.get(id) ?? "—",
    toolCalls: v.toolCalls,
    credits: Math.round(v.credits),
    storage: `${v.storageMB.toFixed(1)} MB`,
    reports: v.reports,
  }));

  const cols: Column<(typeof rows)[number]>[] = [
    { key: "business", header: "Business", render: (r) => <span className="font-medium text-fg">{r.business}</span> },
    { key: "toolCalls", header: "Tool calls (30d)", align: "right", render: (r) => r.toolCalls },
    { key: "credits", header: "AI credits (30d)", align: "right", render: (r) => r.credits },
    { key: "reports", header: "Reports (30d)", align: "right", render: (r) => r.reports },
    { key: "storage", header: "Media storage", align: "right", render: (r) => r.storage },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-fg">Usage &amp; Credits</h1>
        <p className="mt-1 text-sm text-fg-muted">Per-business consumption over the last 30 days.</p>
      </div>
      <Card>
        <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} empty={{ title: "No usage recorded yet" }} />
      </Card>
    </div>
  );
}
