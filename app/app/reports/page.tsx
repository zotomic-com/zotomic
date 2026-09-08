import Link from "next/link";
import { ChevronRight } from "lucide-react";
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
    {
      key: "period",
      header: "Period",
      render: (r) => (
        <Link
          href={`/app/reports/${r.id}`}
          className="group flex items-center gap-1.5 font-medium text-fg hover:text-primary"
        >
          {r.period}
          <ChevronRight className="h-4 w-4 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>{r.status}</Badge>
      ),
    },
    {
      key: "generated",
      header: "Generated",
      align: "right",
      render: (r) => (
        <Link href={`/app/reports/${r.id}`} className="text-fg-muted hover:text-primary">
          {r.generated ?? "—"}
        </Link>
      ),
    },
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
