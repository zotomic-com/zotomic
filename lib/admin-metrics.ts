import { getAdminSupabase } from "@/lib/supabase";

export interface PlatformOverview {
  totalBusinesses: number;
  activeBusinesses: number;
  mrr: number;
  totalReports: number;
  subscriptionMix: { name: string; value: number }[];
  businessGrowth: { month: string; created: number }[];
  recentSignups: {
    id: string;
    business: string;
    owner: string;
    plan: string;
    status: string;
    createdAt: string;
  }[];
  topBusinesses: { name: string; revenue: number }[];
  activity: { id: string; action: string; summary: string | null; createdAt: string }[];
  pendingConfirmations: number;
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const db = getAdminSupabase();

  const [
    { count: totalBusinesses },
    { data: subs },
    { count: totalReports },
    { data: signups },
    { data: audit },
    { count: pending },
    { data: allBiz },
  ] = await Promise.all([
    db.from("businesses").select("id", { count: "exact", head: true }),
    db.from("subscriptions").select("plan, status, price"),
    db.from("reports").select("id", { count: "exact", head: true }).eq("status", "ready"),
    db
      .from("business_members")
      .select("created_at, role, businesses(id, name, created_at), users(name)")
      .eq("role", "owner")
      .order("created_at", { ascending: false })
      .limit(6),
    db
      .from("audit_logs")
      .select("id, action, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(12),
    db.from("invoices").select("id", { count: "exact", head: true }).eq("status", "open").not("txn_submitted_at", "is", null),
    db.from("businesses").select("id, name, created_at"),
  ]);

  const subRows = subs ?? [];
  const activeBusinesses = subRows.filter((s) => s.status === "active").length;
  const mrr = subRows
    .filter((s) => s.status === "active" && s.plan !== "free")
    .reduce((sum, s) => sum + Number(s.price ?? 0), 0);

  const mix = new Map<string, number>();
  for (const s of subRows) mix.set(s.plan, (mix.get(s.plan) ?? 0) + 1);
  const subscriptionMix = [...mix.entries()].map(([name, value]) => ({
    name: name[0].toUpperCase() + name.slice(1),
    value,
  }));

  // last 8 months of business creation
  const months: { month: string; created: number }[] = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString("en-US", { month: "short" });
    const created = (allBiz ?? []).filter((b) => {
      const c = new Date(b.created_at as string);
      return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
    }).length;
    months.push({ month: label, created });
  }

  const recentSignups = (signups ?? []).map((m) => {
    const biz = (Array.isArray(m.businesses) ? m.businesses[0] : m.businesses) as
      | { id?: string; name?: string; created_at?: string }
      | null;
    const owner = (Array.isArray(m.users) ? m.users[0] : m.users) as { name?: string } | null;
    const plan = subRows.find(() => false); // placeholder, resolved below
    void plan;
    return {
      id: (biz?.id ?? m.created_at) as string,
      business: biz?.name ?? "—",
      owner: owner?.name ?? "—",
      plan: "—",
      status: "active",
      createdAt: (m.created_at as string) ?? "",
    };
  });

  // resolve plan/status per signup
  if (recentSignups.length) {
    const bizIds = (signups ?? [])
      .map((m) => {
        const b = Array.isArray(m.businesses) ? m.businesses[0] : m.businesses;
        return (b as { id?: string })?.id;
      })
      .filter(Boolean) as string[];
    const { data: sMap } = await db
      .from("subscriptions")
      .select("business_id, plan, status")
      .in("business_id", bizIds);
    for (const s of recentSignups) {
      const found = (sMap ?? []).find((x) => x.business_id === s.id);
      if (found) {
        s.plan = found.plan;
        s.status = found.status;
      }
    }
  }

  // top businesses by all-time delivered revenue
  const { data: revRows } = await db
    .from("orders")
    .select("business_id, total, status")
    .neq("status", "cancelled");
  const revMap = new Map<string, number>();
  for (const r of revRows ?? []) {
    revMap.set(r.business_id as string, (revMap.get(r.business_id as string) ?? 0) + Number(r.total));
  }
  const nameMap = new Map((allBiz ?? []).map((b) => [b.id as string, b.name as string]));
  const topBusinesses = [...revMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, revenue]) => ({ name: nameMap.get(id) ?? "—", revenue }));

  return {
    totalBusinesses: totalBusinesses ?? 0,
    activeBusinesses,
    mrr,
    totalReports: totalReports ?? 0,
    subscriptionMix,
    businessGrowth: months,
    recentSignups,
    topBusinesses,
    activity: (audit ?? []).map((a) => ({
      id: a.id as string,
      action: a.action as string,
      summary: (a.summary as string) ?? null,
      createdAt: a.created_at as string,
    })),
    pendingConfirmations: pending ?? 0,
  };
}
