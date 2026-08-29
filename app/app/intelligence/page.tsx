import { redirect } from "next/navigation";
import Link from "next/link";
import { Eye, Lightbulb, Target } from "lucide-react";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { getDashboardData } from "@/lib/metrics";
import { buildObservations } from "@/lib/observations";
import { getTrafficSummary } from "@/lib/traffic";
import { money } from "@/lib/money";
import { PageHeader } from "@/components/app/PageHeader";
import { GenerateReportButton } from "@/components/app/GenerateReportButton";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const SEV_TONE = { info: "neutral", low: "info", medium: "warning", high: "danger" } as const;

export default async function IntelligencePage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");

  const currency = tenant.business.currency ?? "BDT";
  const data = await getDashboardData(tenant.businessId);
  const observations = buildObservations(data.current, data.previous, data.topProducts, currency);
  const traffic = await getTrafficSummary(tenant.businessId, data.periodStart, data.periodEnd);
  const db = getAdminSupabase();

  const { data: latestReport } = await db
    .from("reports")
    .select("id, status, period_start, period_end, summary, model, generated_at")
    .eq("business_id", tenant.businessId)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [{ data: reportInsights }, { data: recs }] = await Promise.all([
    latestReport?.status === "ready"
      ? db
          .from("insights")
          .select("id, severity, title, body")
          .eq("report_id", latestReport.id)
          .order("severity", { ascending: false })
      : Promise.resolve({ data: null }),
    db
      .from("recommendations")
      .select("id, title, detail, effort, impact, status")
      .eq("business_id", tenant.businessId)
      .eq("status", "open")
      .limit(10),
  ]);

  const hasData = data.current.orders_count > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly Intelligence"
        subtitle="Trailing 7 days vs the 7 before. See what happened, understand why, act on it."
        action={
          <div className="flex items-center gap-3">
            <GenerateReportButton label="Refresh report" />
            <Link href="/app/reports" className="text-sm font-semibold text-primary">
              All reports →
            </Link>
          </div>
        }
      />

      {latestReport?.status === "ready" && latestReport.summary && (
        <div className="rounded border border-primary-soft bg-primary-soft p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">
            This week&apos;s summary
            {latestReport.model ? " · AI narrative" : ""}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-fg">{latestReport.summary}</p>
        </div>
      )}

      {/* SEE */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-navy">
          <Eye className="h-4 w-4 text-primary" /> See
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {data.lines.map((l) => (
            <StatCard
              key={l.key}
              label={l.label}
              value={
                l.value == null
                  ? "—"
                  : l.key === "returns"
                    ? `${l.value.toFixed(1)}%`
                    : l.key === "revenue" || l.key === "profit"
                      ? money(l.value, currency)
                      : Math.round(l.value).toLocaleString("en-US")
              }
              delta={l.delta}
              deltaLabel="vs last week"
              invert={l.invert}
              unavailableReason={l.value == null ? l.unavailableReason : undefined}
            />
          ))}
        </div>
      </section>

      {/* STOREFRONT TRAFFIC */}
      {traffic.hasData && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-navy">
            <Eye className="h-4 w-4 text-primary" /> Storefront traffic
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Visitors" value={traffic.visitors.toLocaleString("en-US")} />
            <StatCard label="Product views" value={traffic.productViews.toLocaleString("en-US")} />
            <StatCard label="Added to cart" value={traffic.addToCart.toLocaleString("en-US")} />
            <StatCard label="Checkouts started" value={traffic.beginCheckout.toLocaleString("en-US")} />
            <StatCard label="Purchases" value={traffic.purchases.toLocaleString("en-US")} />
            <StatCard
              label="Conversion"
              value={traffic.conversionRate != null ? `${traffic.conversionRate.toFixed(1)}%` : "—"}
              unavailableReason={traffic.conversionRate == null ? "No visitors yet" : undefined}
            />
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
            {!hasData ? (
              <EmptyState
                title="Not enough data yet"
                description="Once orders start flowing in, Zotomic explains what changed and why."
              />
            ) : reportInsights && reportInsights.length ? (
              <ul className="space-y-3">
                {reportInsights.map((o) => (
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
              <ul className="space-y-3">
                {observations.map((o) => (
                  <li key={o.key} className="flex items-start gap-3">
                    <Badge tone={SEV_TONE[o.severity]}>{o.severity}</Badge>
                    <span className="text-sm text-fg-muted">{o.text}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 border-t border-border pt-3 text-xs text-fg-subtle">
              These are measured facts. The written analysis — with confidence levels — arrives with
              your weekly report{" "}
              {latestReport?.status === "queued" || latestReport?.status === "generating"
                ? "(currently generating)"
                : ""}
              .
            </p>
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
                  <li key={r.id} className="rounded-sm border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-fg">{r.title}</p>
                      <div className="flex gap-1">
                        {r.effort && <Badge tone="neutral">effort: {r.effort}</Badge>}
                        {r.impact && <Badge tone="primary">impact: {r.impact}</Badge>}
                      </div>
                    </div>
                    {r.detail && <p className="mt-1 text-sm text-fg-muted">{r.detail}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No recommendations yet"
                description="Your weekly report turns the observations above into a ranked action list."
              />
            )}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
