import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Eye, Lightbulb, Target } from "lucide-react";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { money } from "@/lib/money";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const SEV_TONE = { info: "neutral", low: "info", medium: "warning", high: "danger" } as const;
const STATUS_TONE = { ready: "success", generating: "info", queued: "neutral", failed: "danger" } as const;

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");

  const currency = tenant.business.currency ?? "BDT";
  const db = getAdminSupabase();

  const { data: report } = await db
    .from("reports")
    .select("id, business_id, status, period_start, period_end, summary, model, generated_at, error")
    .eq("id", id)
    .maybeSingle();

  if (!report || report.business_id !== tenant.businessId) notFound();

  const [{ data: metrics }, { data: insights }, { data: recs }] = await Promise.all([
    db.from("report_metrics").select("key, label, value, previous_value, change_pct, direction, available, unavailable_reason, unit").eq("report_id", id),
    db.from("insights").select("id, severity, title, body").eq("report_id", id).order("severity", { ascending: false }),
    db.from("recommendations").select("id, title, detail, effort, impact").eq("report_id", id),
  ]);

  const period = `${fmtDate(report.period_start as string)} – ${fmtDate(report.period_end as string)}`;

  const fmtMetric = (key: string, v: number | null, unit: string | null) => {
    if (v == null) return "—";
    if (key === "revenue" || key === "profit" || unit === "currency") return money(v, currency);
    if (key === "returns" || unit === "percent") return `${Number(v).toFixed(1)}%`;
    return Math.round(Number(v)).toLocaleString("en-US");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Weekly report · ${period}`}
        subtitle={
          report.generated_at
            ? `Generated ${fmtDate(report.generated_at as string)}${report.model ? ` · AI narrative (${report.model})` : ""}`
            : "Not generated yet"
        }
        action={
          <Link href="/app/reports" className="flex items-center gap-1 text-sm font-semibold text-primary">
            <ChevronLeft className="h-4 w-4" /> All reports
          </Link>
        }
      />

      <div className="flex items-center gap-2">
        <Badge tone={STATUS_TONE[report.status as keyof typeof STATUS_TONE] ?? "neutral"}>
          {report.status as string}
        </Badge>
        {report.status === "failed" && report.error && (
          <span className="text-sm text-danger">{report.error as string}</span>
        )}
      </div>

      {report.summary && (
        <div className="rounded border border-primary-soft bg-primary-soft p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">
            Summary{report.model ? " · AI narrative" : ""}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-fg">{report.summary as string}</p>
        </div>
      )}

      {/* SEE — the metric snapshot for this period */}
      {metrics && metrics.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-navy">
            <Eye className="h-4 w-4 text-primary" /> See
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

      {/* UNDERSTAND */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-navy">
          <Lightbulb className="h-4 w-4 text-primary" /> Understand
        </h2>
        <Card className="mt-3">
          <CardBody>
            {insights && insights.length ? (
              <ul className="space-y-3">
                {insights.map((o) => (
                  <li key={o.id as string} className="flex items-start gap-3">
                    <Badge tone={SEV_TONE[(o.severity as keyof typeof SEV_TONE) ?? "info"]}>
                      {o.severity as string}
                    </Badge>
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

      {/* ACT */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-navy">
          <Target className="h-4 w-4 text-primary" /> Act
        </h2>
        <Card className="mt-3">
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
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
