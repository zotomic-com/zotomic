import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { RetryButton } from "./RetryButton";

export const dynamic = "force-dynamic";

const TONE = { ready: "success", generating: "info", queued: "neutral", failed: "danger" } as const;

const RANGES = [
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "365", label: "Last year", days: 365 },
  { key: "all", label: "All time", days: null },
] as const;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireAdmin();
  const db = adminDb();

  const { range } = await searchParams;
  const active = RANGES.find((r) => r.key === range) ?? RANGES[1]; // default 90 days

  let q = db
    .from("reports")
    .select("id, business_id, status, period_start, period_end, model, error, generated_at, created_at, businesses(name)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (active.days != null) {
    const cutoff = new Date(Date.now() - active.days * 86_400_000).toISOString();
    q = q.gte("created_at", cutoff);
  }
  const { data } = await q;

  const all = data ?? [];
  const counts = {
    ready: all.filter((r) => r.status === "ready").length,
    queued: all.filter((r) => r.status === "queued").length,
    failed: all.filter((r) => r.status === "failed").length,
  };

  const rows = all.map((r) => ({
    id: r.id as string,
    businessId: (r.business_id as string) ?? "",
    business: ((Array.isArray(r.businesses) ? r.businesses[0] : r.businesses) as { name?: string } | null)?.name ?? "—",
    period: `${r.period_start} – ${r.period_end}`,
    status: r.status as keyof typeof TONE,
    model: (r.model as string) ?? "—",
    detail: (r.error as string) ?? (r.generated_at ? new Date(r.generated_at as string).toLocaleString("en-US") : "—"),
  }));

  const cols: Column<(typeof rows)[number]>[] = [
    {
      key: "business",
      header: "Business",
      render: (r) => (
        <Link
          href={`/admin/reports/${r.id}`}
          className="group flex items-center gap-1.5 font-medium text-fg hover:text-primary"
        >
          {r.business}
          <ChevronRight className="h-4 w-4 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
      ),
    },
    { key: "period", header: "Period", render: (r) => r.period },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span className="flex items-center gap-2">
          <Badge tone={TONE[r.status] ?? "neutral"}>{r.status}</Badge>
          {(r.status === "failed" || r.status === "queued") && r.businessId && <RetryButton businessId={r.businessId} />}
        </span>
      ),
    },
    { key: "model", header: "Model", render: (r) => r.model },
    { key: "detail", header: "Detail", render: (r) => <span className="text-xs">{r.detail}</span> },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-fg">Report jobs</h1>
        <p className="mt-1 text-sm text-fg-muted">Weekly Intelligence generation across all businesses.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={r.key === "90" ? "/admin/reports" : `/admin/reports?range=${r.key}`}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              active.key === r.key
                ? "border-primary bg-primary-soft text-primary"
                : "border-border text-fg-muted hover:border-primary"
            }`}
          >
            {r.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Ready" value={counts.ready.toLocaleString("en-US")} />
        <StatCard label="Queued" value={counts.queued.toLocaleString("en-US")} />
        <StatCard label="Failed" value={counts.failed.toLocaleString("en-US")} invert />
      </div>
      <Card>
        <DataTable
          columns={cols}
          rows={rows}
          rowKey={(r) => r.id}
          empty={{ title: "No report jobs in this range" }}
        />
      </Card>
    </div>
  );
}
