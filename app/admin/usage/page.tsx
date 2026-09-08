import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";

export const dynamic = "force-dynamic";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1_073_741_824) return `${(n / 1_048_576).toFixed(1)} MB`;
  return `${(n / 1_073_741_824).toFixed(2)} GB`;
}

export default async function AdminUsagePage() {
  await requireAdmin();
  const db = adminDb();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [{ data: ledger }, { data: biz }, { data: media }, { data: reports }, { data: accounts }, { data: pgEst }] =
    await Promise.all([
      db.from("usage_ledger").select("business_id, kind, units, cost, tool_name").gte("created_at", since),
      db.from("businesses").select("id, name"),
      db.from("media_assets").select("business_id, bytes"),
      db.from("reports").select("business_id").eq("status", "ready").gte("created_at", since),
      db.from("credit_accounts").select("business_id, allowance_balance, purchased_balance, lifetime_spent"),
      db.rpc("tenant_storage_estimate"),
    ]);

  const pgMap = new Map(
    ((pgEst as { business_id: string; est_bytes: number }[] | null) ?? []).map((r) => [r.business_id, Number(r.est_bytes)]),
  );
  const nameMap = new Map((biz ?? []).map((b) => [b.id as string, b.name as string]));
  const accMap = new Map(
    (accounts ?? []).map((a) => [
      a.business_id as string,
      { balance: Number(a.allowance_balance) + Number(a.purchased_balance), spent: Number(a.lifetime_spent) },
    ]),
  );

  type Agg = { credits: number; toolCalls: number; aiTurns: number; cloudinary: number; supabase: number; reports: number };
  const agg = new Map<string, Agg>();
  const bump = (id: string) => {
    if (!agg.has(id))
      agg.set(id, { credits: 0, toolCalls: 0, aiTurns: 0, cloudinary: 0, supabase: 0, reports: 0 });
    return agg.get(id)!;
  };

  for (const l of ledger ?? []) {
    const a = bump(l.business_id as string);
    a.credits += Number(l.cost);
    if (l.kind === "ai_tokens") a.aiTurns += Number(l.units);
    else a.toolCalls += Number(l.units);
  }
  for (const m of media ?? []) bump(m.business_id as string).cloudinary += Number(m.bytes ?? 0);
  for (const r of reports ?? []) bump(r.business_id as string).reports += 1;
  for (const b of biz ?? []) bump(b.id as string).supabase = pgMap.get(b.id as string) ?? 0;

  const rows = [...agg.entries()]
    .map(([id, v]) => ({
      id,
      business: nameMap.get(id) ?? "—",
      credits: Math.round(v.credits),
      balance: accMap.get(id)?.balance ?? 0,
      lifetimeSpent: accMap.get(id)?.spent ?? 0,
      aiTurns: v.aiTurns,
      toolCalls: v.toolCalls,
      cloudinary: v.cloudinary,
      supabase: v.supabase,
      reports: v.reports,
    }))
    .filter((r) => r.business !== "—")
    .sort((a, b) => b.cloudinary + b.supabase - (a.cloudinary + a.supabase));

  const totalCloud = rows.reduce((n, r) => n + r.cloudinary, 0);
  const totalPg = rows.reduce((n, r) => n + r.supabase, 0);
  const totalCredits30 = rows.reduce((n, r) => n + r.credits, 0);

  const cols: Column<(typeof rows)[number]>[] = [
    {
      key: "business",
      header: "Business",
      render: (r) => (
        <Link href={`/admin/tenants/${r.id}`} className="group flex items-center gap-1.5 font-medium text-fg hover:text-primary">
          {r.business}
          <ChevronRight className="h-4 w-4 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
      ),
    },
    { key: "balance", header: "Credits now", align: "right", render: (r) => r.balance.toLocaleString("en-US") },
    { key: "credits", header: "Spent 30d", align: "right", render: (r) => r.credits.toLocaleString("en-US") },
    { key: "aiTurns", header: "AI turns 30d", align: "right", render: (r) => r.aiTurns.toLocaleString("en-US") },
    { key: "cloudinary", header: "Cloudinary", align: "right", render: (r) => fmtBytes(r.cloudinary) },
    { key: "supabase", header: "Supabase ≈", align: "right", render: (r) => fmtBytes(r.supabase) },
    { key: "reports", header: "Reports 30d", align: "right", render: (r) => r.reports },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-fg">Usage &amp; Credits</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Per-business consumption (30 days) and storage by provider. Supabase is an estimate from row
          counts; Cloudinary is exact; Vercel build/bandwidth is shared — see the Vercel dashboard.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Credits spent · 30d" value={totalCredits30.toLocaleString("en-US")} />
        <StatCard label="Cloudinary total" value={fmtBytes(totalCloud)} />
        <StatCard label="Supabase (est.)" value={fmtBytes(totalPg)} />
        <StatCard label="Stores" value={rows.length.toLocaleString("en-US")} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By business</CardTitle>
        </CardHeader>
        <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} empty={{ title: "No usage recorded yet" }} />
      </Card>
    </div>
  );
}
