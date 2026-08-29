import { requireAdmin, adminDb } from "@/lib/admin-server";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";

export const dynamic = "force-dynamic";

export default async function AdminAssistantActivityPage() {
  await requireAdmin();
  const db = adminDb();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [{ count: msgs7d }, { count: convs }, { data: usage }, { data: recent }] = await Promise.all([
    db.from("assistant_messages").select("id", { count: "exact", head: true }).eq("role", "user").gte("created_at", since),
    db.from("assistant_conversations").select("id", { count: "exact", head: true }),
    db.from("usage_ledger").select("business_id, units, cost, kind").gte("created_at", since),
    db
      .from("assistant_messages")
      .select("role, content, model, created_at, businesses(name)")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const toolCalls = (usage ?? []).filter((u) => u.kind === "tool_call").reduce((n, u) => n + Number(u.units), 0);
  const credits = (usage ?? []).reduce((n, u) => n + Number(u.cost), 0);

  const rows = (recent ?? []).map((m, i) => ({
    id: `${m.created_at}-${i}`,
    business: ((Array.isArray(m.businesses) ? m.businesses[0] : m.businesses) as { name?: string } | null)?.name ?? "—",
    role: m.role as string,
    preview: String(m.content ?? "").slice(0, 90),
    model: (m.model as string) ?? "—",
    at: new Date(m.created_at as string).toLocaleString("en-US"),
  }));

  const cols: Column<(typeof rows)[number]>[] = [
    { key: "business", header: "Business", render: (r) => <span className="font-medium text-fg">{r.business}</span> },
    { key: "role", header: "Role", render: (r) => r.role },
    { key: "preview", header: "Message", render: (r) => <span className="text-xs">{r.preview}</span> },
    { key: "model", header: "Model", render: (r) => <span className="text-xs">{r.model}</span> },
    { key: "at", header: "When", align: "right", render: (r) => <span className="text-xs">{r.at}</span> },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-fg">Assistant Activity</h1>
        <p className="mt-1 text-sm text-fg-muted">Tool calls and usage across all businesses (7 days).</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Messages · 7d" value={(msgs7d ?? 0).toLocaleString("en-US")} />
        <StatCard label="Conversations" value={(convs ?? 0).toLocaleString("en-US")} />
        <StatCard label="Tool calls · 7d" value={toolCalls.toLocaleString("en-US")} />
        <StatCard label="Credits · 7d" value={credits.toLocaleString("en-US")} />
      </div>
      <Card>
        <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} empty={{ title: "No assistant activity yet" }} />
      </Card>
    </div>
  );
}
