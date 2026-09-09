/**
 * Fraud signal computation. Aggregates a person's behaviour across EVERY store
 * on the platform (matched by normalized phone) and derives Stage-1/2 auto
 * flags. Admin-set (manual) flags are never downgraded by the scanner.
 */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";
import { normalizePhone } from "./phone";

export interface StoreSignal {
  businessId: string;
  name: string;
  orders: number;
  cancelled: number;
  returned: number;
  deliveryFailures: number;
}

export interface RiskResult {
  phone: string;
  name: string | null;
  email: string | null;
  totalOrders: number;
  cancelled: number;
  returned: number;
  deliveryFailures: number;
  storeCount: number;
  cancellationRate: number;
  returnRate: number;
  signals: string[];       // cancellations | returns | delivery_failures | cross_store
  score: number;           // 0-100
  suggestedStage: 0 | 1 | 2;
  stores: StoreSignal[];
}

const FAIL_SHIP = new Set(["failed", "returned"]);

export async function computeRisk(phoneRaw: string): Promise<RiskResult | null> {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return null;
  const db = getAdminSupabase();

  // customers on any store whose phone ends with this local number
  const { data: custs } = await db
    .from("customers")
    .select("id, business_id, name, email, phone")
    .ilike("phone", `%${phone.slice(-9)}%`)
    .limit(200);

  const matched = (custs ?? []).filter((c) => normalizePhone(c.phone as string) === phone);
  if (!matched.length) return null;

  const custIds = matched.map((c) => c.id as string);
  const bizIds = [...new Set(matched.map((c) => c.business_id as string))];

  const [{ data: orders }, { data: rets }, { data: biz }] = await Promise.all([
    db.from("orders").select("id, business_id, status, customer_id").in("customer_id", custIds),
    db.from("returns").select("id, orders!inner(customer_id)").in("orders.customer_id", custIds),
    db.from("businesses").select("id, name").in("id", bizIds),
  ]);

  const orderIds = (orders ?? []).map((o) => o.id as string);
  const { data: ships } = orderIds.length
    ? await db.from("shipments").select("order_id, status").in("order_id", orderIds)
    : { data: [] as { order_id: string; status: string }[] };

  const bizName = new Map((biz ?? []).map((b) => [b.id as string, b.name as string]));
  const failByOrder = new Set(
    (ships ?? []).filter((s) => FAIL_SHIP.has(s.status as string)).map((s) => s.order_id as string),
  );
  const retCount = (rets ?? []).length;

  const perStore = new Map<string, StoreSignal>();
  for (const b of bizIds) perStore.set(b, { businessId: b, name: bizName.get(b) ?? "—", orders: 0, cancelled: 0, returned: 0, deliveryFailures: 0 });

  let total = 0;
  let cancelled = 0;
  let returned = 0;
  let delivered = 0;
  let deliveryFailures = 0;
  for (const o of orders ?? []) {
    const st = perStore.get(o.business_id as string)!;
    total += 1;
    st.orders += 1;
    if (o.status === "cancelled") {
      cancelled += 1;
      st.cancelled += 1;
    }
    if (o.status === "returned") {
      returned += 1;
      st.returned += 1;
    }
    if (o.status === "delivered" || o.status === "returned") delivered += 1;
    if (failByOrder.has(o.id as string)) {
      deliveryFailures += 1;
      st.deliveryFailures += 1;
    }
  }
  returned = Math.max(returned, retCount);

  const cancellationRate = total ? cancelled / total : 0;
  const returnRate = delivered ? returned / delivered : 0;
  const storeCount = bizIds.length;

  const signals: string[] = [];
  if (total >= 3 && cancellationRate > 0.5) signals.push("cancellations");
  if (delivered >= 3 && returnRate > 0.4) signals.push("returns");
  if (deliveryFailures >= 2) signals.push("delivery_failures");
  if (storeCount >= 2 && cancelled + deliveryFailures >= 3) signals.push("cross_store");

  const score = Math.min(
    100,
    Math.round(
      cancellationRate * 45 +
        returnRate * 30 +
        Math.min(deliveryFailures, 5) * 6 +
        (storeCount >= 2 ? 12 : 0),
    ),
  );

  const suggestedStage: 0 | 1 | 2 =
    signals.length === 0 ? 0 : signals.includes("cross_store") || signals.length >= 2 ? 2 : 1;

  const best = matched.find((c) => c.name) ?? matched[0];
  return {
    phone,
    name: (best?.name as string) || null,
    email: (matched.find((c) => c.email)?.email as string) || null,
    totalOrders: total,
    cancelled,
    returned,
    deliveryFailures,
    storeCount,
    cancellationRate: Math.round(cancellationRate * 100),
    returnRate: Math.round(returnRate * 100),
    signals,
    score,
    suggestedStage,
    stores: [...perStore.values()],
  };
}

/**
 * Platform-wide scan: group customers by normalized phone (min 3 orders total)
 * and upsert Stage-1/2 auto flags. Returns how many flags were created/updated.
 */
export async function runFraudScan(): Promise<{ scanned: number; flagged: number }> {
  const db = getAdminSupabase();
  const { data: custs } = await db
    .from("customers")
    .select("phone, total_orders")
    .not("phone", "is", null)
    .limit(20_000);

  const byPhone = new Map<string, number>();
  for (const c of custs ?? []) {
    const p = normalizePhone(c.phone as string);
    if (!p) continue;
    byPhone.set(p, (byPhone.get(p) ?? 0) + Number(c.total_orders ?? 0));
  }
  const candidates = [...byPhone.entries()].filter(([, n]) => n >= 3).map(([p]) => p);

  let flagged = 0;
  for (const phone of candidates) {
    const risk = await computeRisk(phone);
    if (!risk || risk.suggestedStage === 0) continue;
    const { upsertAutoFlag } = await import("./flags");
    await upsertAutoFlag(risk);
    flagged += 1;
  }
  return { scanned: candidates.length, flagged };
}
