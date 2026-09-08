import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { money } from "@/lib/money";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TenantAdminClient } from "./TenantAdminClient";

export const dynamic = "force-dynamic";

const INV_TONE = { paid: "success", open: "warning", void: "neutral", failed: "danger" } as const;
const RPT_TONE = { ready: "success", generating: "info", queued: "neutral", failed: "danger" } as const;

const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

export default async function AdminTenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const db = adminDb();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const { data: biz } = await db
    .from("businesses")
    .select("id, name, type, currency, timezone, status, feature_overrides, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!biz) notFound();
  const currency = biz.currency as string;

  const [
    { data: sub },
    { data: owner },
    { data: orders },
    { count: productCount },
    { data: sf },
    { data: acct },
    { data: creditLog },
    { data: usage30 },
    { data: invoices },
    { data: reports },
    { data: messages },
  ] = await Promise.all([
    db.from("subscriptions").select("plan, status, current_period_end").eq("business_id", id).maybeSingle(),
    db.from("business_members").select("users(name, email)").eq("business_id", id).eq("role", "owner").maybeSingle(),
    db.from("orders").select("total, status").eq("business_id", id),
    db.from("products").select("id", { count: "exact", head: true }).eq("business_id", id),
    db.from("storefront_config").select("published_at").eq("business_id", id).maybeSingle(),
    db.from("credit_accounts").select("allowance_balance, purchased_balance, plan_allowance, week_resets_on, lifetime_purchased, lifetime_spent").eq("business_id", id).maybeSingle(),
    db.from("credit_ledger").select("id, delta, reason, balance_after, actor_type, created_at").eq("business_id", id).order("created_at", { ascending: false }).limit(10),
    db.from("usage_ledger").select("kind, units, cost").eq("business_id", id).gte("created_at", since30),
    db.from("invoices").select("id, invoice_number, amount, currency, status, created_at, paid_at").eq("business_id", id).order("created_at", { ascending: false }).limit(8),
    db.from("reports").select("id, status, period_start, period_end, generated_at").eq("business_id", id).order("period_end", { ascending: false }).limit(8),
    db.from("assistant_messages").select("role, content, model, created_at").eq("business_id", id).order("created_at", { ascending: false }).limit(8),
  ]);

  const revenue = (orders ?? []).filter((o) => o.status !== "cancelled").reduce((n, o) => n + Number(o.total), 0);
  const ownerU = (Array.isArray(owner?.users) ? owner?.users[0] : owner?.users) as { name?: string; email?: string } | null;
  const subscription = {
    plan: sub?.plan ?? "free",
    status: sub?.status ?? "active",
    current_period_end: sub?.current_period_end ?? null,
  };

  const creditBalance = acct ? Number(acct.allowance_balance) + Number(acct.purchased_balance) : 0;
  const usage = { aiTurns: 0, toolCalls: 0, credits: 0 };
  for (const u of usage30 ?? []) {
    usage.credits += Number(u.cost);
    if (u.kind === "ai_tokens") usage.aiTurns += Number(u.units);
    else usage.toolCalls += Number(u.units);
  }

  return (
    <div className="space-y-5">
      <Link href="/admin/tenants" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Tenants
      </Link>
      <div>
        <h1 className="text-xl font-extrabold text-fg">{biz.name}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {ownerU?.name} · {ownerU?.email} · joined {d(biz.created_at as string)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Plan" value={subscription.plan} />
        <StatCard label="Orders" value={(orders?.length ?? 0).toLocaleString("en-US")} />
        <StatCard label="Products" value={(productCount ?? 0).toLocaleString("en-US")} />
        <StatCard label="Revenue" value={money(revenue, currency)} />
        <StatCard label="Credits now" value={creditBalance.toLocaleString("en-US")} />
        <StatCard label="Credits spent · 30d" value={Math.round(usage.credits).toLocaleString("en-US")} />
        <StatCard label="AI turns · 30d" value={usage.aiTurns.toLocaleString("en-US")} />
        <StatCard label="Lifetime spent" value={acct ? Number(acct.lifetime_spent).toLocaleString("en-US") : "0"} />
      </div>

      {/* Invoices */}
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <Link href="/admin/financials" className="text-xs font-semibold text-primary">Financials →</Link>
        </CardHeader>
        <ul className="divide-y divide-border text-sm">
          {(invoices ?? []).length === 0 && <li className="px-4 py-3 text-fg-subtle">No invoices.</li>}
          {(invoices ?? []).map((i) => (
            <li key={i.id as string}>
              <Link href={`/admin/financials/${i.id}`} className="group flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-2">
                <span className="font-medium text-fg">{i.invoice_number as string}</span>
                <span className="flex items-center gap-3 text-fg-muted">
                  {money(Number(i.amount), (i.currency as string) ?? currency)}
                  <Badge tone={INV_TONE[i.status as keyof typeof INV_TONE] ?? "neutral"}>{i.status as string}</Badge>
                  <span className="text-xs">{i.paid_at ? `paid ${d(i.paid_at as string)}` : d(i.created_at as string)}</span>
                  <ChevronRight className="h-4 w-4 text-fg-subtle group-hover:text-primary" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {/* Weekly reports */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly reports</CardTitle>
          <Link href="/admin/reports" className="text-xs font-semibold text-primary">All reports →</Link>
        </CardHeader>
        <ul className="divide-y divide-border text-sm">
          {(reports ?? []).length === 0 && <li className="px-4 py-3 text-fg-subtle">No reports.</li>}
          {(reports ?? []).map((r) => (
            <li key={r.id as string}>
              <Link href={`/admin/reports/${r.id}`} className="group flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-2">
                <span className="font-medium text-fg">{d(r.period_start as string)} – {d(r.period_end as string)}</span>
                <span className="flex items-center gap-3 text-fg-muted">
                  <Badge tone={RPT_TONE[r.status as keyof typeof RPT_TONE] ?? "neutral"}>{r.status as string}</Badge>
                  <span className="text-xs">{r.generated_at ? d(r.generated_at as string) : "—"}</span>
                  <ChevronRight className="h-4 w-4 text-fg-subtle group-hover:text-primary" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {/* Credit ledger */}
      <Card>
        <CardHeader>
          <CardTitle>Credit ledger</CardTitle>
          {acct?.week_resets_on && (
            <span className="text-xs text-fg-subtle">
              allowance {acct.plan_allowance} · resets {d(acct.week_resets_on as string)}
            </span>
          )}
        </CardHeader>
        <ul className="divide-y divide-border text-sm">
          {(creditLog ?? []).length === 0 && <li className="px-4 py-3 text-fg-subtle">No credit activity.</li>}
          {(creditLog ?? []).map((c) => (
            <li key={c.id as string} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-fg-muted">
                <span className="font-medium text-fg">{(c.reason as string) ?? "adjustment"}</span>
                <span className="ml-2 text-xs">{c.actor_type as string}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className={`font-semibold ${Number(c.delta) >= 0 ? "text-success" : "text-danger"}`}>
                  {Number(c.delta) >= 0 ? "+" : ""}{Number(c.delta).toLocaleString("en-US")}
                </span>
                <span className="text-xs text-fg-subtle">bal {Number(c.balance_after).toLocaleString("en-US")}</span>
                <span className="text-xs text-fg-subtle">{d(c.created_at as string)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Assistant messages */}
      <Card>
        <CardHeader>
          <CardTitle>Recent assistant messages</CardTitle>
          <Link href="/admin/assistant-activity" className="text-xs font-semibold text-primary">Assistant activity →</Link>
        </CardHeader>
        <ul className="divide-y divide-border text-sm">
          {(messages ?? []).length === 0 && <li className="px-4 py-3 text-fg-subtle">No assistant activity.</li>}
          {(messages ?? []).map((m, n) => (
            <li key={n} className="flex items-start justify-between gap-3 px-4 py-2.5">
              <span className="text-fg-muted">
                <span className="font-mono text-xs text-fg-subtle">{m.role as string}</span>{" "}
                {String(m.content ?? "").slice(0, 120)}
              </span>
              <span className="shrink-0 text-xs text-fg-subtle">{d(m.created_at as string)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <TenantAdminClient
        businessId={biz.id as string}
        business={{
          name: biz.name as string,
          type: (biz.type as string) ?? null,
          currency,
          timezone: biz.timezone as string,
          status: biz.status as string,
        }}
        subscription={subscription}
        overrides={(biz.feature_overrides as Record<string, boolean>) ?? {}}
        published={!!sf?.published_at}
      />
    </div>
  );
}
