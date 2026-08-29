import { getAdminSupabase } from "@/lib/supabase";
import { PLANS, type PlanId } from "@/lib/plans";

export type SubStatus = "active" | "grace" | "soft_lock" | "hard_lock" | "cancelled";

export interface BillingState {
  plan: PlanId;
  status: SubStatus;
  periodEnd: string | null;
  price: number;
  currency: string;
  /** dashboard writes blocked */
  readOnly: boolean;
  /** whole app locked to the billing screen; storefront offline */
  hardLocked: boolean;
  daysOverdue: number | null;
}

export function deriveBilling(sub: {
  plan: string;
  status: string;
  current_period_end: string | null;
  price: number | null;
  currency: string | null;
} | null): BillingState {
  const plan = (sub?.plan ?? "free") as PlanId;
  const status = (sub?.status ?? "active") as SubStatus;
  const periodEnd = sub?.current_period_end ?? null;
  let daysOverdue: number | null = null;
  if (periodEnd) {
    const diff = Math.floor((Date.now() - new Date(periodEnd + "T00:00:00Z").getTime()) / 86_400_000);
    daysOverdue = diff > 0 ? diff : 0;
  }
  return {
    plan,
    status,
    periodEnd,
    price: Number(sub?.price ?? 0),
    currency: sub?.currency ?? "BDT",
    readOnly: status === "soft_lock" || status === "hard_lock",
    hardLocked: status === "hard_lock",
    daysOverdue,
  };
}

export async function getBilling(businessId: string): Promise<BillingState> {
  const db = getAdminSupabase();
  const { data } = await db
    .from("subscriptions")
    .select("plan, status, current_period_end, price, currency")
    .eq("business_id", businessId)
    .maybeSingle();
  return deriveBilling(data);
}

/** Owner submits a bKash payment against an open invoice. */
export async function submitPayment(
  businessId: string,
  txnId: string,
  amount: number,
): Promise<{ ok: true } | { error: string }> {
  const db = getAdminSupabase();
  const { data: invoice } = await db
    .from("invoices")
    .select("id")
    .eq("business_id", businessId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!invoice) return { error: "No open invoice to pay." };

  const { error } = await db
    .from("invoices")
    .update({ txn_id: txnId.trim().slice(0, 64), txn_amount: amount, txn_submitted_at: new Date().toISOString() })
    .eq("id", invoice.id);
  if (error) return { error: "Could not submit payment." };
  return { ok: true };
}

/** Admin confirms an invoice → paid, extend the subscription one cycle, unlock. */
export async function confirmInvoice(
  invoiceId: string,
  adminId: string,
): Promise<{ ok: true } | { error: string }> {
  const db = getAdminSupabase();
  const { data: inv } = await db
    .from("invoices")
    .select("id, business_id, subscription_id, status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return { error: "Invoice not found" };
  if (inv.status === "paid") return { ok: true };

  await db
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString(), confirmed_by: adminId })
    .eq("id", invoiceId);

  if (inv.subscription_id) {
    const { data: sub } = await db
      .from("subscriptions")
      .select("current_period_end")
      .eq("id", inv.subscription_id)
      .single();
    const base = sub?.current_period_end
      ? new Date(Math.max(Date.now(), new Date(sub.current_period_end + "T00:00:00Z").getTime()))
      : new Date();
    const next = new Date(base);
    next.setDate(next.getDate() + 30);
    await db
      .from("subscriptions")
      .update({
        status: "active",
        current_period_start: new Date().toISOString().slice(0, 10),
        current_period_end: next.toISOString().slice(0, 10),
        grace_started_on: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", inv.subscription_id);
  }

  await db.from("audit_logs").insert({
    business_id: inv.business_id,
    actor_id: adminId,
    actor_type: "admin",
    action: "invoice.confirmed",
    target_type: "invoice",
    target_id: invoiceId,
    summary: "Payment confirmed, subscription reactivated",
  });

  return { ok: true };
}

export function planName(id: PlanId): string {
  return PLANS.find((p) => p.id === id)?.name ?? id;
}
