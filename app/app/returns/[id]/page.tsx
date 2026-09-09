import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { money } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailShell, FactList } from "@/components/app/DetailShell";
import { Timeline, type TimelineEvent } from "@/components/app/Timeline";
import { ReturnActions } from "./ReturnActions";

export const dynamic = "force-dynamic";

const TONE: Record<string, "neutral" | "warning" | "success" | "danger" | "primary"> = {
  requested: "warning",
  approved: "primary",
  received: "primary",
  refunded: "success",
  rejected: "danger",
  cancelled: "neutral",
};

export default async function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");
  const cur = tenant.business.currency ?? "BDT";
  const db = getAdminSupabase();

  const { data: ret } = await db
    .from("returns")
    .select(
      "id, return_number, status, reason, refund_amount, restock, note, created_at, processed_at, order_id, orders(order_number, total, customers(id, name, phone))",
    )
    .eq("business_id", tenant.businessId)
    .eq("id", id)
    .maybeSingle();
  if (!ret) notFound();

  const [{ data: items }, { data: audit }] = await Promise.all([
    db.from("return_items").select("name, qty, unit_price").eq("return_id", id).eq("business_id", tenant.businessId),
    db
      .from("audit_logs")
      .select("id, action, summary, created_at")
      .eq("business_id", tenant.businessId)
      .eq("target_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const ord = (Array.isArray(ret.orders) ? ret.orders[0] : ret.orders) as
    | { order_number?: string; total?: number; customers?: { id?: string; name?: string; phone?: string } | { id?: string; name?: string; phone?: string }[] }
    | null;
  const cust = (Array.isArray(ord?.customers) ? ord?.customers[0] : ord?.customers) as
    | { id?: string; name?: string; phone?: string }
    | null;
  const lines = (items ?? []) as { name: string; qty: number; unit_price: number }[];
  const status = ret.status as string;

  const events: TimelineEvent[] = [
    ...(audit ?? []).map((a) => ({
      id: a.id as string,
      action: a.action as string,
      summary: (a.summary as string) ?? null,
      at: a.created_at as string,
    })),
    { id: "created", action: "return.created", summary: "Return requested", at: ret.created_at as string },
  ];

  return (
    <DetailShell
      backHref="/app/returns"
      backLabel="Returns"
      title={ret.return_number as string}
      meta={
        <>
          For order{" "}
          <Link href={`/app/orders/${ret.order_id}`} className="text-primary hover:underline">
            #{ord?.order_number}
          </Link>
        </>
      }
      status={<Badge tone={TONE[status] ?? "neutral"}>{status}</Badge>}
      actions={<ReturnActions id={ret.id as string} status={status} />}
      sidebar={
        <>
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardBody>
              <FactList
                items={[
                  { label: "Refund", value: money(Number(ret.refund_amount), cur) },
                  { label: "Restock", value: ret.restock ? "Yes, on receipt" : "No" },
                  { label: "Requested", value: new Date(ret.created_at as string).toLocaleDateString("en-US") },
                  {
                    label: "Processed",
                    value: ret.processed_at ? new Date(ret.processed_at as string).toLocaleDateString("en-US") : "—",
                  },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardBody className="text-sm">
              {cust?.id ? (
                <Link href={`/app/customers/${cust.id}`} className="font-medium text-primary hover:underline">
                  {cust.name ?? "Guest"}
                </Link>
              ) : (
                <p className="font-medium text-fg">{cust?.name ?? "Guest"}</p>
              )}
              {cust?.phone && <p className="text-fg-muted">{cust.phone}</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardBody>
              <Timeline events={events} />
            </CardBody>
          </Card>
        </>
      }
    >
      {ret.reason && (
        <div className="rounded-sm border border-border bg-surface-2 px-3 py-2 text-sm text-fg-muted">
          <span className="font-semibold text-fg">Reason:</span> {ret.reason as string}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Returned items</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="divide-y divide-border">
            {lines.map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="text-fg">
                  {l.name} <span className="text-fg-subtle">× {l.qty}</span>
                </span>
                <span className="font-medium">{money(l.qty * Number(l.unit_price), cur)}</span>
              </li>
            ))}
            {lines.length === 0 && <li className="py-2.5 text-sm text-fg-subtle">No line items recorded.</li>}
          </ul>
        </CardBody>
      </Card>

      {ret.note && (
        <Card>
          <CardHeader>
            <CardTitle>Internal note</CardTitle>
          </CardHeader>
          <CardBody className="text-sm text-fg-muted">{ret.note as string}</CardBody>
        </Card>
      )}
    </DetailShell>
  );
}
