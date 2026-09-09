import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STAGE_LABEL, CATEGORY_LABEL } from "@/lib/fraud/phone";
import { rowToFlag } from "@/lib/fraud/flags";
import { FraudFlagActions } from "./FraudFlagActions";

export const dynamic = "force-dynamic";

const dt = (s: string | null) => (s ? new Date(s).toLocaleString("en-US") : "—");

export default async function FraudFlagDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const db = adminDb();

  const { data: raw } = await db.from("fraud_flags").select("*").eq("id", id).maybeSingle();
  if (!raw) notFound();
  const flag = rowToFlag(raw);

  const { data: matches } = await db
    .from("fraud_order_matches")
    .select("stage, matched_on, held, cleared, created_at, businesses(name), orders(order_number, status, total, currency)")
    .eq("flag_id", id)
    .order("created_at", { ascending: false })
    .limit(30);

  const ev = flag.evidence as Record<string, number | string[]>;

  return (
    <div className="space-y-5">
      <Link href="/admin/fraud" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Fraud detection
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-extrabold text-fg">
            {flag.name ?? flag.phone ?? "Unknown"}
            <Badge tone={flag.stage >= 3 ? "danger" : "warning"}>{STAGE_LABEL[flag.stage]}</Badge>
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            {[flag.phone, flag.email].filter(Boolean).join(" · ") || "no contact on file"} ·{" "}
            <span className="capitalize">{flag.source}</span>
            {flag.autoScore != null ? ` · risk score ${flag.autoScore}` : ""}
          </p>
        </div>
        <FraudFlagActions
          flagId={flag.id}
          stage={flag.stage}
          category={flag.category}
          reason={flag.reason ?? ""}
          hasPhone={!!flag.phone}
        />
      </div>

      {flag.reason && (
        <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm text-fg-muted">{flag.reason}</div>
      )}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Signals</CardTitle>
          </CardHeader>
          <dl className="divide-y divide-border px-4 text-sm">
            {[
              ["Category", CATEGORY_LABEL[flag.category] ?? flag.category],
              ["Total orders", ev.totalOrders ?? "—"],
              ["Cancelled", `${ev.cancelled ?? 0} (${ev.cancellationRate ?? 0}%)`],
              ["Returned", `${ev.returned ?? 0} (${ev.returnRate ?? 0}%)`],
              ["Failed deliveries", ev.deliveryFailures ?? 0],
              ["Stores involved", ev.storeCount ?? flag.stores.length],
              ["First seen", dt(flag.lastActivityAt)],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-3 py-2.5">
                <dt className="text-fg-subtle">{k}</dt>
                <dd className="text-right font-medium text-fg">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <div className="space-y-5">
          {flag.stores.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Stores</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-border px-4 text-sm">
                {flag.stores.map((s) => (
                  <li key={s.businessId} className="flex items-center justify-between py-2.5">
                    <Link href={`/admin/tenants/${s.businessId}`} className="font-medium text-primary hover:underline">
                      {s.name}
                    </Link>
                    <span className="text-xs text-fg-subtle">
                      {s.orders ?? 0} orders · {s.cancelled ?? 0} cancelled · {s.returned ?? 0} returned ·{" "}
                      {s.deliveryFailures ?? 0} failed
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Orders matched</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-border px-4 text-sm">
              {(matches ?? []).length === 0 && <li className="py-3 text-fg-subtle">No orders matched yet.</li>}
              {(matches ?? []).map((m, i) => {
                const o = (Array.isArray(m.orders) ? m.orders[0] : m.orders) as
                  | { order_number?: string; status?: string }
                  | null;
                const b = (Array.isArray(m.businesses) ? m.businesses[0] : m.businesses) as { name?: string } | null;
                return (
                  <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="text-fg-muted">
                      <span className="font-medium text-fg">{o?.order_number ?? "—"}</span> · {b?.name ?? "—"}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-fg-subtle">
                      {new Date(m.created_at as string).toLocaleDateString("en-US")}
                      {m.held && !m.cleared && <Badge tone="danger">held</Badge>}
                      {m.cleared && <Badge tone="neutral">cleared</Badge>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
