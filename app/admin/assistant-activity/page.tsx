import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";

export const dynamic = "force-dynamic";

export default async function AdminAssistantActivityPage() {
  await requireAdmin();
  const db = adminDb();
  const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [{ count: msgs7d }, { count: convs }, { data: usage7 }, { data: usage30 }, { data: biz }, { data: recent }] =
    await Promise.all([
      db.from("assistant_messages").select("id", { count: "exact", head: true }).eq("role", "user").gte("created_at", since7),
      db.from("assistant_conversations").select("id", { count: "exact", head: true }),
      db.from("usage_ledger").select("units, cost, kind").gte("created_at", since7),
      db.from("usage_ledger").select("business_id, tool_name, units, cost, kind").gte("created_at", since30),
      db.from("businesses").select("id, name"),
      db
        .from("assistant_messages")
        .select("role, content, model, created_at, businesses(name)")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

  const toolCalls7 = (usage7 ?? []).filter((u) => u.kind === "tool_call").reduce((n, u) => n + Number(u.units), 0);
  const credits7 = (usage7 ?? []).reduce((n, u) => n + Number(u.cost), 0);

  const nameMap = new Map((biz ?? []).map((b) => [b.id as string, b.name as string]));

  // by tool (30d)
  const byTool = new Map<string, { calls: number; credits: number }>();
  // by business (30d)
  const byBiz = new Map<string, { calls: number; credits: number; aiTurns: number }>();
  for (const u of usage30 ?? []) {
    const tool = (u.tool_name as string) || (u.kind === "ai_tokens" ? "(AI turns)" : "(other)");
    const t = byTool.get(tool) ?? { calls: 0, credits: 0 };
    t.calls += Number(u.units);
    t.credits += Number(u.cost);
    byTool.set(tool, t);

    const b = byBiz.get(u.business_id as string) ?? { calls: 0, credits: 0, aiTurns: 0 };
    if (u.kind === "ai_tokens") b.aiTurns += Number(u.units);
    else b.calls += Number(u.units);
    b.credits += Number(u.cost);
    byBiz.set(u.business_id as string, b);
  }

  const toolRows = [...byTool.entries()]
    .map(([tool, v]) => ({ tool, calls: v.calls, credits: Math.round(v.credits) }))
    .sort((a, b) => b.credits - a.credits);

  const bizRows = [...byBiz.entries()]
    .map(([id, v]) => ({
      id,
      business: nameMap.get(id) ?? "—",
      calls: v.calls,
      aiTurns: v.aiTurns,
      credits: Math.round(v.credits),
    }))
    .sort((a, b) => b.credits - a.credits);

  const recentRows = (recent ?? []).map((m, i) => ({
    id: `${m.created_at}-${i}`,
    business: ((Array.isArray(m.businesses) ? m.businesses[0] : m.businesses) as { name?: string } | null)?.name ?? "—",
    role: m.role as string,
    preview: String(m.content ?? "").slice(0, 90),
    model: (m.model as string) ?? "—",
    at: new Date(m.created_at as string).toLocaleString("en-US"),
  }));

  const toolCols: Column<(typeof toolRows)[number]>[] = [
    { key: "tool", header: "Tool", render: (r) => <span className="font-mono text-xs text-fg">{r.tool}</span> },
    { key: "calls", header: "Calls (30d)", align: "right", render: (r) => r.calls.toLocaleString("en-US") },
    { key: "credits", header: "Credits (30d)", align: "right", render: (r) => r.credits.toLocaleString("en-US") },
  ];
  const bizCols: Column<(typeof bizRows)[number]>[] = [
    {
      key: "business",
      header: "Business",
      render: (r) =>
        r.business === "—" ? (
          <span className="font-medium text-fg">{r.business}</span>
        ) : (
          <Link href={`/admin/tenants/${r.id}`} className="group flex items-center gap-1.5 font-medium text-fg hover:text-primary">
            {r.business}
            <ChevronRight className="h-4 w-4 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        ),
    },
    { key: "aiTurns", header: "AI turns", align: "right", render: (r) => r.aiTurns.toLocaleString("en-US") },
    { key: "calls", header: "Tool calls", align: "right", render: (r) => r.calls.toLocaleString("en-US") },
    { key: "credits", header: "Credits (30d)", align: "right", render: (r) => r.credits.toLocaleString("en-US") },
  ];
  const recentCols: Column<(typeof recentRows)[number]>[] = [
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
        <p className="mt-1 text-sm text-fg-muted">Assistant usage and credit consumption across all businesses.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Messages · 7d" value={(msgs7d ?? 0).toLocaleString("en-US")} />
        <StatCard label="Conversations" value={(convs ?? 0).toLocaleString("en-US")} />
        <StatCard label="Tool calls · 7d" value={toolCalls7.toLocaleString("en-US")} />
        <StatCard label="Credits · 7d" value={Math.round(credits7).toLocaleString("en-US")} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Credits by tool · 30 days</CardTitle>
          </CardHeader>
          <DataTable columns={toolCols} rows={toolRows} rowKey={(r) => r.tool} empty={{ title: "No tool usage yet" }} />
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Credits by business · 30 days</CardTitle>
          </CardHeader>
          <DataTable columns={bizCols} rows={bizRows} rowKey={(r) => r.id} empty={{ title: "No usage yet" }} />
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent messages</CardTitle>
        </CardHeader>
        <DataTable columns={recentCols} rows={recentRows} rowKey={(r) => r.id} empty={{ title: "No assistant activity yet" }} />
      </Card>
    </div>
  );
}
