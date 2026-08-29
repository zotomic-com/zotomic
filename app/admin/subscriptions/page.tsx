import { requireAdmin, adminDb } from "@/lib/admin-server";
import { money } from "@/lib/money";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { PendingQueue, type PendingRow } from "./SubscriptionsClient";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  active: "success",
  grace: "warning",
  soft_lock: "danger",
  hard_lock: "danger",
  cancelled: "neutral",
} as const;

export default async function AdminSubscriptionsPage() {
  await requireAdmin();
  const db = adminDb();

  const [{ data: pendingInv }, { data: subs }] = await Promise.all([
    db
      .from("invoices")
      .select("id, invoice_number, amount, currency, txn_id, txn_amount, txn_submitted_at, payment_reference, businesses(name)")
      .eq("status", "open")
      .not("txn_submitted_at", "is", null)
      .order("txn_submitted_at", { ascending: true }),
    db
      .from("subscriptions")
      .select("id, plan, status, price, currency, current_period_end, businesses(name)")
      .order("updated_at", { ascending: false }),
  ]);

  const pendingRows: PendingRow[] = (pendingInv ?? []).map((i) => ({
    invoiceId: i.id as string,
    business: ((Array.isArray(i.businesses) ? i.businesses[0] : i.businesses) as { name?: string } | null)?.name ?? "—",
    invoiceNumber: i.invoice_number as string,
    amount: money(Number(i.amount), (i.currency as string) ?? "BDT"),
    txnId: (i.txn_id as string) ?? "—",
    txnAmount: money(Number(i.txn_amount ?? 0), (i.currency as string) ?? "BDT"),
    submittedAt: i.txn_submitted_at
      ? new Date(i.txn_submitted_at as string).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "—",
    reference: (i.payment_reference as string) ?? "—",
  }));

  const subRows = (subs ?? []).map((s) => ({
    id: s.id as string,
    business: ((Array.isArray(s.businesses) ? s.businesses[0] : s.businesses) as { name?: string } | null)?.name ?? "—",
    plan: s.plan as string,
    status: s.status as keyof typeof STATUS_TONE,
    price: money(Number(s.price ?? 0), (s.currency as string) ?? "BDT"),
    renews: s.current_period_end
      ? new Date(s.current_period_end as string).toLocaleDateString("en-US")
      : "—",
  }));

  const subCols: Column<(typeof subRows)[number]>[] = [
    { key: "business", header: "Business", render: (r) => <span className="font-medium text-fg">{r.business}</span> },
    { key: "plan", header: "Plan", render: (r) => <Badge tone={r.plan === "free" ? "neutral" : "primary"}>{r.plan}</Badge> },
    { key: "price", header: "Price", render: (r) => r.price },
    { key: "renews", header: "Renews", render: (r) => r.renews },
    {
      key: "status",
      header: "Status",
      align: "right",
      render: (r) => <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-fg">Subscriptions</h1>
        <p className="mt-1 text-sm text-fg-muted">Confirm bKash payments and monitor subscription health.</p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-bold text-fg">
          Pending confirmation ({pendingRows.length})
        </h2>
        <PendingQueue rows={pendingRows} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>All subscriptions</CardTitle>
        </CardHeader>
        <DataTable columns={subCols} rows={subRows} rowKey={(r) => r.id} empty={{ title: "No subscriptions" }} />
      </Card>
    </div>
  );
}
