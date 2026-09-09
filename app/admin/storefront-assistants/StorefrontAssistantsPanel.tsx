import Link from "next/link";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { SF_CHAT_QUOTA, utcPeriod } from "@/lib/storefront/assistant";
import type { PlanId } from "@/lib/plans";
import { PendingTopups } from "./PendingTopups";

const num = (n: number) => n.toLocaleString("en-US");

export async function StorefrontAssistantsPanel() {
  await requireAdmin();
  const db = adminDb();
  const period = utcPeriod();

  const [{ data: cfgs }, { data: businesses }, { data: subs }, { data: usage }, { data: kn }, { data: topups }] =
    await Promise.all([
      db
        .from("storefront_assistant_config")
        .select("business_id, enabled, suspended, suspended_reason, extra_conversations, persona"),
      db.from("businesses").select("id, name, status"),
      db.from("subscriptions").select("business_id, plan"),
      db.from("storefront_assistant_usage").select("business_id, conversations, messages, blocked").eq("period", period),
      db.from("storefront_assistant_knowledge").select("business_id"),
      db
        .from("storefront_chat_purchases")
        .select("id, business_id, conversations, amount, method, txn_id, submitted_at")
        .eq("status", "submitted")
        .order("submitted_at", { ascending: false }),
    ]);

  const bizName = new Map((businesses ?? []).map((b) => [b.id as string, b.name as string]));
  const planOf = new Map((subs ?? []).map((s) => [s.business_id as string, (s.plan as PlanId) ?? "free"]));
  const usageOf = new Map((usage ?? []).map((u) => [u.business_id as string, u]));
  const knCount = new Map<string, number>();
  for (const k of kn ?? []) knCount.set(k.business_id as string, (knCount.get(k.business_id as string) ?? 0) + 1);

  const rows = (cfgs ?? [])
    .map((c) => {
      const bid = c.business_id as string;
      const plan = (planOf.get(bid) ?? "free") as PlanId;
      const u = usageOf.get(bid);
      const used = Number(u?.conversations ?? 0);
      const quota = SF_CHAT_QUOTA[plan] ?? SF_CHAT_QUOTA.free;
      return {
        id: bid,
        name: bizName.get(bid) ?? "—",
        state: c.suspended ? "suspended" : c.enabled ? "live" : "off",
        plan,
        used,
        quota,
        overQuota: used >= quota,
        extra: Number(c.extra_conversations ?? 0),
        messages: Number(u?.messages ?? 0),
        blocked: Number(u?.blocked ?? 0),
        knowledge: knCount.get(bid) ?? 0,
        trained: !!c.persona || (knCount.get(bid) ?? 0) > 0,
      };
    })
    .sort((a, b) => b.used - a.used);

  const live = rows.filter((r) => r.state === "live").length;
  const suspended = rows.filter((r) => r.state === "suspended").length;
  const convThisMonth = rows.reduce((n, r) => n + r.used, 0);
  const blockedThisMonth = rows.reduce((n, r) => n + r.blocked, 0);

  const pending = (topups ?? []).map((t) => ({
    id: t.id as string,
    businessId: t.business_id as string,
    business: bizName.get(t.business_id as string) ?? "—",
    conversations: Number(t.conversations),
    amount: Number(t.amount),
    method: t.method as string,
    txnId: t.txn_id as string,
    at: new Date(t.submitted_at as string).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  const cols: Column<(typeof rows)[number]>[] = [
    {
      key: "name",
      header: "Store",
      render: (r) => (
        <Link href={`/admin/tenants/${r.id}`} className="block">
          <p className="font-medium text-primary">{r.name}</p>
          <p className="text-xs text-fg-subtle capitalize">{r.plan} plan</p>
        </Link>
      ),
    },
    {
      key: "state",
      header: "State",
      render: (r) =>
        r.state === "suspended" ? (
          <Badge tone="danger">Suspended</Badge>
        ) : r.state === "live" ? (
          <Badge tone="success">Live</Badge>
        ) : (
          <Badge tone="neutral">Off</Badge>
        ),
    },
    {
      key: "used",
      header: "Conversations / mo",
      render: (r) => (
        <span className={r.overQuota ? "font-semibold text-danger" : ""}>
          {num(r.used)} / {num(r.quota)}
          {r.extra > 0 && <span className="text-fg-subtle"> · +{num(r.extra)}</span>}
        </span>
      ),
    },
    { key: "messages", header: "Messages", align: "right", render: (r) => num(r.messages) },
    {
      key: "blocked",
      header: "Turned away",
      align: "right",
      render: (r) => (r.blocked > 0 ? <span className="text-danger">{num(r.blocked)}</span> : "—"),
    },
    {
      key: "knowledge",
      header: "Trained",
      align: "right",
      render: (r) => (r.trained ? `${r.knowledge} Q&A` : <span className="text-fg-subtle">no</span>),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-fg">Storefront Assistants</h1>
        <p className="mt-1 text-sm text-fg-muted">
          The per-store shopping chatbots. Open a store to edit its name, suspend it, or adjust its conversation pool.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Live" value={num(live)} />
        <StatCard label="Suspended" value={num(suspended)} />
        <StatCard label="Conversations · this month" value={num(convThisMonth)} />
        <StatCard label="Turned away · this month" value={num(blockedThisMonth)} />
      </div>

      {pending.length > 0 && (
        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold text-fg">Pending top-up payments ({pending.length})</p>
          <PendingTopups rows={pending} />
        </Card>
      )}

      <Card>
        <DataTable
          columns={cols}
          rows={rows}
          rowKey={(r) => r.id}
          empty={{ title: "No storefront assistants configured yet" }}
        />
      </Card>
    </div>
  );
}
