import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { getInvoiceData, renderInvoiceHtml } from "@/lib/invoice";
import { money } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const STATUS_TONE = { paid: "success", open: "warning", void: "neutral", failed: "danger" } as const;

const fmt = (d: string | null) =>
  d ? new Date(d.length <= 10 ? d + "T00:00:00Z" : d).toLocaleString("en-US") : "—";

export default async function AdminInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const db = adminDb();

  const { data: inv } = await db
    .from("invoices")
    .select(
      "id, business_id, invoice_number, amount, currency, status, due_date, paid_at, created_at, payment_reference, txn_id, txn_amount, txn_submitted_at, confirmed_by, businesses(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!inv) notFound();

  const bizName =
    ((Array.isArray(inv.businesses) ? inv.businesses[0] : inv.businesses) as { name?: string } | null)?.name ?? "—";

  const [{ data: subRow }, confirmedByRow] = await Promise.all([
    db.from("subscriptions").select("plan").eq("business_id", inv.business_id as string).maybeSingle(),
    inv.confirmed_by
      ? db.from("users").select("name, email").eq("id", inv.confirmed_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const plan = (subRow?.plan as string) ?? "—";
  const confirmedByName = inv.confirmed_by
    ? ((confirmedByRow.data?.name as string) ?? (confirmedByRow.data?.email as string) ?? (inv.confirmed_by as string))
    : null;

  const printable = await getInvoiceData(inv.business_id as string, id);

  return (
    <div className="space-y-5">
      <Link href="/admin/financials" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Financials
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-fg">{inv.invoice_number as string}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {bizName} · {plan} plan
          </p>
        </div>
        <Badge tone={STATUS_TONE[inv.status as keyof typeof STATUS_TONE] ?? "neutral"}>{inv.status as string}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Amount" value={money(Number(inv.amount), (inv.currency as string) ?? "BDT")} />
        <StatCard label="Issued" value={fmt(inv.created_at as string)} />
        <StatCard label="Due" value={fmt(inv.due_date as string | null)} />
        <StatCard label="Paid" value={fmt(inv.paid_at as string | null)} />
      </div>

      <Card>
        <div className="divide-y divide-border text-sm">
          {[
            ["Business", bizName],
            ["Plan", plan],
            ["Payment reference", (inv.payment_reference as string) ?? "—"],
            ["Customer txn ID", (inv.txn_id as string) ?? "—"],
            [
              "Customer-declared amount",
              inv.txn_amount != null ? money(Number(inv.txn_amount), (inv.currency as string) ?? "BDT") : "—",
            ],
            ["Txn submitted", fmt(inv.txn_submitted_at as string | null)],
            ["Confirmed by", confirmedByName ?? "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 px-4 py-2.5">
              <span className="text-fg-muted">{k}</span>
              <span className="font-medium text-fg">{v}</span>
            </div>
          ))}
        </div>
      </Card>

      {printable && (
        <div
          className="print-sheet mx-auto max-w-[680px] rounded-lg"
          dangerouslySetInnerHTML={{ __html: renderInvoiceHtml(printable) }}
        />
      )}
    </div>
  );
}
