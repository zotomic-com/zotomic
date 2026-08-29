import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { money } from "@/lib/money";
import { StatCard } from "@/components/ui/stat-card";
import { TenantAdminClient } from "./TenantAdminClient";

export const dynamic = "force-dynamic";

export default async function AdminTenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const db = adminDb();

  const { data: biz } = await db
    .from("businesses")
    .select("id, name, type, currency, timezone, status, feature_overrides, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!biz) notFound();

  const [{ data: sub }, { data: owner }, { data: orders }, { count: productCount }, { data: sf }] = await Promise.all([
    db.from("subscriptions").select("plan, status, current_period_end").eq("business_id", id).maybeSingle(),
    db.from("business_members").select("users(name, email)").eq("business_id", id).eq("role", "owner").maybeSingle(),
    db.from("orders").select("total, status").eq("business_id", id),
    db.from("products").select("id", { count: "exact", head: true }).eq("business_id", id),
    db.from("storefront_config").select("published_at").eq("business_id", id).maybeSingle(),
  ]);

  const revenue = (orders ?? []).filter((o) => o.status !== "cancelled").reduce((n, o) => n + Number(o.total), 0);
  const ownerU = (Array.isArray(owner?.users) ? owner?.users[0] : owner?.users) as { name?: string; email?: string } | null;
  const subscription = {
    plan: sub?.plan ?? "free",
    status: sub?.status ?? "active",
    current_period_end: sub?.current_period_end ?? null,
  };

  return (
    <div className="space-y-5">
      <Link href="/admin/tenants" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Tenants
      </Link>
      <div>
        <h1 className="text-xl font-extrabold text-fg">{biz.name}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {ownerU?.name} · {ownerU?.email} · joined {new Date(biz.created_at as string).toLocaleDateString("en-US")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Plan" value={subscription.plan} />
        <StatCard label="Orders" value={(orders?.length ?? 0).toLocaleString("en-US")} />
        <StatCard label="Products" value={(productCount ?? 0).toLocaleString("en-US")} />
        <StatCard label="Revenue" value={money(revenue, biz.currency as string)} />
      </div>

      <TenantAdminClient
        businessId={biz.id as string}
        business={{
          name: biz.name as string,
          type: (biz.type as string) ?? null,
          currency: biz.currency as string,
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
