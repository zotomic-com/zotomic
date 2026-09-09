import { requireAdmin, adminDb } from "@/lib/admin-server";
import { StatCard } from "@/components/ui/stat-card";
import { FraudClient, type FlagRow, type StoreToggle } from "./FraudClient";
import { STAGE_LABEL } from "@/lib/fraud/phone";

export const dynamic = "force-dynamic";

export default async function AdminFraudPage() {
  await requireAdmin();
  const db = adminDb();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const [{ data: flags }, { data: matches }, { data: holds }, { data: businesses }] = await Promise.all([
    db
      .from("fraud_flags")
      .select("id, phone, email, name, stage, category, reason, auto_score, source, status, last_activity_at, created_at")
      .eq("status", "active")
      .order("stage", { ascending: false })
      .order("last_activity_at", { ascending: false })
      .limit(500),
    db.from("fraud_order_matches").select("flag_id, created_at").gte("created_at", weekAgo),
    db.from("fraud_order_matches").select("id").eq("held", true).eq("cleared", false),
    db.from("businesses").select("id, name, fraud_warnings_enabled").eq("status", "active").order("name"),
  ]);

  const recentByFlag = new Map<string, number>();
  for (const m of matches ?? []) recentByFlag.set(m.flag_id as string, (recentByFlag.get(m.flag_id as string) ?? 0) + 1);

  const rows: FlagRow[] = (flags ?? []).map((f) => ({
    id: f.id as string,
    phone: (f.phone as string) ?? "—",
    email: (f.email as string) ?? null,
    name: (f.name as string) ?? null,
    stage: Number(f.stage),
    stageLabel: STAGE_LABEL[Number(f.stage)] ?? "Watch",
    category: (f.category as string) ?? "other",
    reason: (f.reason as string) ?? null,
    score: f.auto_score != null ? Number(f.auto_score) : null,
    source: (f.source as string) ?? "auto",
    ordersThisWeek: recentByFlag.get(f.id as string) ?? 0,
    lastActivity: f.last_activity_at
      ? new Date(f.last_activity_at as string).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "—",
  }));

  const stores: StoreToggle[] = (businesses ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    enabled: b.fraud_warnings_enabled !== false,
  }));

  const byStage = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
  for (const r of rows) byStage[r.stage] = (byStage[r.stage] ?? 0) + 1;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-fg">Fraud detection</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Flagged customers across the platform. Stores are warned when a flagged customer orders; Stage 3 (Blacklist)
          auto-holds the order.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Watch" value={(byStage[1] ?? 0).toLocaleString("en-US")} />
        <StatCard label="Suspect" value={(byStage[2] ?? 0).toLocaleString("en-US")} />
        <StatCard label="Blacklist" value={(byStage[3] ?? 0).toLocaleString("en-US")} />
        <StatCard label="Orders on hold" value={(holds ?? []).length.toLocaleString("en-US")} invert />
      </div>

      <FraudClient rows={rows} stores={stores} />
    </div>
  );
}
