import { redirect } from "next/navigation";
import Link from "next/link";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { planName } from "@/lib/billing";
import { PLANS, formatPrice } from "@/lib/plans";
import { money } from "@/lib/money";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { PaymentForm } from "./BillingClient";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  active: "success",
  grace: "warning",
  soft_lock: "danger",
  hard_lock: "danger",
  cancelled: "neutral",
} as const;

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  grace: "Grace period",
  soft_lock: "Read-only (payment due)",
  hard_lock: "Locked (payment overdue)",
  cancelled: "Cancelled",
};

export default async function BillingPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId) redirect("/onboarding");

  const { billing } = tenant;
  const db = getAdminSupabase();

  const [{ data: openInvoice }, { data: invoices }] = await Promise.all([
    db
      .from("invoices")
      .select("id, invoice_number, amount, currency, due_date, payment_reference, txn_id, txn_submitted_at")
      .eq("business_id", tenant.businessId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("invoices")
      .select("id, invoice_number, amount, currency, status, due_date, paid_at")
      .eq("business_id", tenant.businessId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const invRows = (invoices ?? []).map((i) => ({
    id: i.id as string,
    number: i.invoice_number as string,
    amount: money(Number(i.amount), (i.currency as string) ?? "BDT"),
    status: i.status as string,
    date: i.paid_at
      ? `Paid ${new Date(i.paid_at as string).toLocaleDateString("en-US")}`
      : i.due_date
        ? `Due ${new Date(i.due_date as string).toLocaleDateString("en-US")}`
        : "—",
  }));

  const invCols: Column<(typeof invRows)[number]>[] = [
    { key: "number", header: "Invoice", render: (r) => <span className="font-medium text-fg">{r.number}</span> },
    { key: "amount", header: "Amount", render: (r) => r.amount },
    { key: "date", header: "Date", render: (r) => r.date },
    {
      key: "status",
      header: "Status",
      align: "right",
      render: (r) => (
        <Badge tone={r.status === "paid" ? "success" : r.status === "open" ? "warning" : "neutral"}>
          {r.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Plans & billing" subtitle="Your subscription, invoices, and payment." />

      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <Badge tone={STATUS_TONE[billing.status]}>{STATUS_LABEL[billing.status]}</Badge>
        </CardHeader>
        <CardBody className="space-y-1 text-sm">
          <p className="text-lg font-extrabold text-fg">{planName(billing.plan)}</p>
          <p className="text-fg-muted">
            {billing.plan === "free"
              ? "Free forever — upgrade for unlimited history, richer intelligence and integrations."
              : `${money(billing.price, billing.currency)} / month${
                  billing.periodEnd ? ` · renews ${new Date(billing.periodEnd).toLocaleDateString("en-US")}` : ""
                }`}
          </p>
          {billing.status === "soft_lock" && (
            <p className="pt-1 text-danger">
              Your dashboard is read-only. Your storefront is still live and taking orders.
            </p>
          )}
          {billing.status === "hard_lock" && (
            <p className="pt-1 text-danger">
              Your storefront is offline. Confirm payment to bring everything back instantly.
            </p>
          )}
        </CardBody>
      </Card>

      {openInvoice && (
        <Card>
          <CardHeader>
            <CardTitle>Pay by bKash</CardTitle>
          </CardHeader>
          <CardBody>
            {openInvoice.txn_submitted_at ? (
              <div className="rounded-sm border border-info/30 bg-info-soft p-3 text-sm text-info">
                Payment submitted ({openInvoice.txn_id}). We&apos;ll confirm it and reactivate your
                account — usually within a few hours.
              </div>
            ) : (
              <PaymentForm
                reference={openInvoice.payment_reference as string}
                amount={Number(openInvoice.amount)}
              />
            )}
          </CardBody>
        </Card>
      )}

      {billing.plan === "free" && (
        <Card>
          <CardHeader>
            <CardTitle>Upgrade</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2">
              {PLANS.filter((p) => p.id !== "free").map((p) => (
                <div key={p.id} className="rounded-sm border border-border p-4">
                  <p className="text-sm font-bold text-fg">{p.name}</p>
                  <p className="mt-1 text-xl font-extrabold text-navy">
                    {formatPrice(p)}
                    {p.priceBDT ? <span className="text-xs font-medium text-fg-subtle">/mo</span> : null}
                  </p>
                  <p className="mt-1 text-xs text-fg-muted">{p.tagline}</p>
                  <Link
                    href="/contact"
                    className="mt-3 inline-block text-xs font-semibold text-primary"
                  >
                    {p.id === "pro" ? "Contact us" : "Request upgrade"} →
                  </Link>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <DataTable columns={invCols} rows={invRows} rowKey={(r) => r.id} empty={{ title: "No invoices yet" }} />
      </Card>
    </div>
  );
}
