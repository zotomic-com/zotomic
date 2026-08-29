import { requireAdmin, adminDb } from "@/lib/admin-server";
import { money } from "@/lib/money";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminFinancialsPage() {
  await requireAdmin();
  const db = adminDb();

  const [{ data: subs }, { data: invoices }] = await Promise.all([
    db.from("subscriptions").select("plan, status, price"),
    db
      .from("invoices")
      .select("id, invoice_number, amount, currency, status, paid_at, due_date, businesses(name)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const mrr = (subs ?? [])
    .filter((s) => s.status === "active" && s.plan !== "free")
    .reduce((n, s) => n + Number(s.price ?? 0), 0);
  const collected = (invoices ?? [])
    .filter((i) => i.status === "paid")
    .reduce((n, i) => n + Number(i.amount), 0);
  const outstanding = (invoices ?? [])
    .filter((i) => i.status === "open")
    .reduce((n, i) => n + Number(i.amount), 0);

  const rows = (invoices ?? []).map((i) => ({
    id: i.id as string,
    number: i.invoice_number as string,
    business: ((Array.isArray(i.businesses) ? i.businesses[0] : i.businesses) as { name?: string } | null)?.name ?? "—",
    amount: money(Number(i.amount), (i.currency as string) ?? "BDT"),
    status: i.status as string,
    date: i.paid_at
      ? `Paid ${new Date(i.paid_at as string).toLocaleDateString("en-US")}`
      : i.due_date
        ? `Due ${new Date(i.due_date as string).toLocaleDateString("en-US")}`
        : "—",
  }));

  const cols: Column<(typeof rows)[number]>[] = [
    { key: "number", header: "Invoice", render: (r) => <span className="font-medium text-fg">{r.number}</span> },
    { key: "business", header: "Business", render: (r) => r.business },
    { key: "amount", header: "Amount", render: (r) => r.amount },
    { key: "date", header: "Date", render: (r) => r.date },
    {
      key: "status",
      header: "Status",
      align: "right",
      render: (r) => (
        <Badge tone={r.status === "paid" ? "success" : r.status === "open" ? "warning" : "neutral"}>{r.status}</Badge>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-fg">Financials</h1>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="MRR" value={money(mrr, "BDT")} />
        <StatCard label="Collected (all time)" value={money(collected, "BDT")} />
        <StatCard label="Outstanding" value={money(outstanding, "BDT")} invert />
      </div>
      <Card>
        <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} empty={{ title: "No invoices" }} />
      </Card>
    </div>
  );
}
