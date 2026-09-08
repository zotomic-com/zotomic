import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Eye, Lightbulb, Target } from "lucide-react";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { money } from "@/lib/money";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { RetryButton } from "../RetryButton";

export const dynamic = "force-dynamic";

const SEV_TONE = { info: "neutral", low: "info", medium: "warning", high: "danger" } as const;
const STATUS_TONE = { ready: "success", generating: "info", queued: "neutral", failed: "danger" } as const;

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function AdminReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const db = adminDb();

  const { data: report } = await db
    .from("reports")
    .select("id, business_id, status, period_start, period_end, summary, model, generated_at, error, businesses(name, currency)")
    .eq("id", id)
    .maybeSingle();
  if (!report) notFound();

  const biz = (Array.isArray(report.businesses) ? report.businesses[0] : report.businesses) as
    | { name?: string; currency?: string }
    | null;
  const currency = biz?.currency ?? "BDT";

  const [{ data: metrics }, { data: insights }, { data: recs }] = await Promise.all([
    db.from("report_metrics").select("key, label, value, previous_value, change_pct, available, unavailable_reason, unit").eq("report_id", id),
    db.from("insights").select("id, severity, title, body").eq("report_id", id).order("severity", { ascending: false }),
    db.from("recommendations").select("id, title, detail, effort, impact").eq("report_id", id),
  ]);

  const period = `${fmtDate(report.period_start as string)} – ${fmtDate(report.period_end as string)}`;
  const status = report.status as keyof typeof STATUS_TONE;

  const fmtMetric = (key: string, v: number | null, unit: string | null) => {
    if (v == null) return "—";
    if (key === "revenue" || key === "profit" || unit === "currency") return money(v, currency);
    if (key === "returns" || unit === "percent") return `${Number(v).toFixed(1)}%`;
    return Math.round(Number(v)).toLocaleString("en-US");
  };

  return (
    <div className="space-y-6">
      <Link href="/admin/reports" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Report jobs
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-fg">{biz?.name ?? "—"}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {period}
            {report.generated_at ? ` · generated ${fmtDate(report.generated_at as string)}` : ""}
            {report.model ? ` · ${report.model}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status}</Badge>
          {(status === "failed" || status === "queued") && report.business_id && (
            <RetryButton businessId={report.business_id as string} />
          )}
        </div>
      </div>

      {report.status === "failed" && report.error && (
        <p className="rounded border border-danger/30 bg-danger-soft p-3 text-sm text-danger">{report.error as string}</p>
      )}

      {report.summary && (
        <div className="rounded border border-primary-soft bg-primary-soft p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">
            Summary{report.model ? " · AI narrative" : ""}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-fg">{report.summary as string}</p>
        </div>
      )}

      {metrics && metrics.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-navy">
            <Eye className="h-4 w-4 text-primary" /> Metrics
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {metrics.map((m) => (
              <StatCard
                key={m.key as string}
                label={m.label as string}
                value={fmtMetric(m.key as string, m.available ? (m.value as number) : null, m.unit as string | null)}
                delta={m.change_pct as number | null}
                deltaLabel="vs prior week"
                invert={m.key === "returns"}
                unavailableReason={!m.available ? (m.unavailable_reason as string) ?? undefined : undefined}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-navy">
          <Lightbulb className="h-4 w-4 text-primary" /> Insights
        </h2>
        <Card className="mt-3">
          <CardBody>
            {insights && insights.length ? (
              <ul className="space-y-3">
                {insights.map((o) => (
                  <li key={o.id as string} className="flex items-start gap-3">
                    <Badge tone={SEV_TONE[(o.severity as keyof typeof SEV_TONE) ?? "info"]}>{o.severity as string}</Badge>
                    <span className="text-sm text-fg-muted">
                      <span className="font-medium text-fg">{o.title as string}</span>
                      {o.body ? ` — ${o.body as string}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No insights for this period" />
            )}
          </CardBody>
        </Card>
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-navy">
          <Target className="h-4 w-4 text-primary" /> Recommendations
        </h2>
        <Card className="mt-3">
          <CardHeader>
            <CardTitle>What the report told the owner to do</CardTitle>
          </CardHeader>
          <CardBody>
            {recs && recs.length ? (
              <ul className="space-y-3">
                {recs.map((r) => (
                  <li key={r.id as string} className="rounded-sm border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-fg">{r.title as string}</p>
                      <div className="flex gap-1">
                        {r.effort ? <Badge tone="neutral">effort: {r.effort as string}</Badge> : null}
                        {r.impact ? <Badge tone="primary">impact: {r.impact as string}</Badge> : null}
                      </div>
                    </div>
                    {r.detail ? <p className="mt-1 text-sm text-fg-muted">{r.detail as string}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No recommendations for this period" />
            )}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
