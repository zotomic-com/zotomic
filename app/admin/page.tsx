import Link from "next/link";
import { requireAdmin } from "@/lib/admin-server";
import { getPlatformOverview } from "@/lib/admin-metrics";
import { money } from "@/lib/money";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { BarChart, DonutChart } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  await requireAdmin();
  const o = await getPlatformOverview();

  const signupCols: Column<(typeof o.recentSignups)[number]>[] = [
    { key: "business", header: "Business", render: (r) => <span className="font-medium text-fg">{r.business}</span> },
    { key: "owner", header: "Owner", render: (r) => r.owner },
    { key: "plan", header: "Plan", render: (r) => <Badge tone={r.plan === "free" ? "neutral" : "primary"}>{r.plan}</Badge> },
    {
      key: "status",
      header: "Status",
      align: "right",
      render: (r) => (
        <Badge tone={r.status === "active" ? "success" : r.status === "cancelled" ? "neutral" : "danger"}>
          {r.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-fg">Platform Overview</h1>
        <p className="mt-1 text-sm text-fg-muted">Real-time performance of the Zotomic platform.</p>
      </div>

      {o.pendingConfirmations > 0 && (
        <Link
          href="/admin/subscriptions"
          className="flex items-center justify-between rounded border border-warning/30 bg-warning-soft px-4 py-3 text-sm"
        >
          <span className="font-medium text-warning">
            {o.pendingConfirmations} payment{o.pendingConfirmations > 1 ? "s" : ""} awaiting confirmation
          </span>
          <span className="font-semibold text-warning">Review →</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Businesses" value={o.totalBusinesses.toLocaleString("en-US")} />
        <StatCard label="Active Businesses" value={o.activeBusinesses.toLocaleString("en-US")} />
        <StatCard label="MRR" value={money(o.mrr, "BDT")} />
        <StatCard label="Reports Generated" value={o.totalReports.toLocaleString("en-US")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Business growth</CardTitle>
            <span className="text-xs text-fg-subtle">New businesses / month</span>
          </CardHeader>
          <CardBody>
            <BarChart data={o.businessGrowth} xKey="month" series={[{ key: "created", label: "New" }]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Subscription mix</CardTitle>
          </CardHeader>
          <CardBody>
            {o.subscriptionMix.length ? (
              <DonutChart
                data={o.subscriptionMix}
                centerValue={String(o.totalBusinesses)}
                centerLabel="total"
              />
            ) : (
              <p className="text-sm text-fg-subtle">No subscriptions.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent signups</CardTitle>
            <Link href="/admin/tenants" className="text-xs font-semibold text-primary">
              View all
            </Link>
          </CardHeader>
          <DataTable
            columns={signupCols}
            rows={o.recentSignups}
            rowKey={(r) => r.id}
            empty={{ title: "No signups yet" }}
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top businesses by revenue</CardTitle>
          </CardHeader>
          <CardBody>
            {o.topBusinesses.length ? (
              <ul className="space-y-3">
                {o.topBusinesses.map((b) => {
                  const max = o.topBusinesses[0].revenue || 1;
                  return (
                    <li key={b.name}>
                      <div className="flex justify-between text-sm">
                        <span className="text-fg">{b.name}</span>
                        <span className="font-medium text-fg">{money(b.revenue, "BDT")}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(4, (b.revenue / max) * 100)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-fg-subtle">No revenue data yet.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity feed</CardTitle>
          <Link href="/admin/audit-logs" className="text-xs font-semibold text-primary">
            Audit log
          </Link>
        </CardHeader>
        <CardBody>
          {o.activity.length ? (
            <ul className="space-y-2.5">
              {o.activity.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-fg-muted">
                    <span className="font-medium text-fg">{a.action}</span>
                    {a.summary ? ` — ${a.summary}` : ""}
                  </span>
                  <span className="shrink-0 text-xs text-fg-subtle">
                    {new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-subtle">No activity yet.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
