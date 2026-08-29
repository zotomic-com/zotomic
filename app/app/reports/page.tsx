import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { PageHeader } from "@/components/app/PageHeader";
import { GenerateReportButton } from "@/components/app/GenerateReportButton";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const STATUS_TONE = { ready: "success", generating: "info", queued: "neutral", failed: "danger" } as const;

interface Row {
  id: string;
  period: string;
  status: string;
  generated: string | null;
}

export default async function ReportsPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");

  const db = getAdminSupabase();
  const { data } = await db
    .from("reports")
    .select("id, period_start, period_end, status, generated_at")
    .eq("business_id", tenant.businessId)
    .order("period_end", { ascending: false })
    .limit(50);

  const fmt = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const rows: Row[] = (data ?? []).map((r) => ({
    id: r.id as string,
    period: `${fmt(r.period_start as string)} – ${fmt(r.period_end as string)}`,
    status: r.status as string,
    generated: r.generated_at
      ? new Date(r.generated_at as string).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null,
  }));

  const cols: Column<Row>[] = [
    { key: "period", header: "Period", render: (r) => <span className="font-medium text-fg">{r.period}</span> },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>{r.status}</Badge>
      ),
    },
    { key: "generated", header: "Generated", align: "right", render: (r) => r.generated ?? "—" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        subtitle="Every weekly report, with the metrics and insights behind it."
        action={<GenerateReportButton />}
      />
      <Card>
        <DataTable
          columns={cols}
          rows={rows}
          rowKey={(r) => r.id}
          empty={{
            title: "No reports yet",
            description: "Your first weekly report is queued and generates automatically.",
          }}
        />
      </Card>
    </div>
  );
}
