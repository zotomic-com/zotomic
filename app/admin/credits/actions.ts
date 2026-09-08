"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { grantCredits } from "@/lib/credits";

async function auditAdmin(businessId: string, adminId: string, action: string, summary: string) {
  await adminDb().from("audit_logs").insert({
    business_id: businessId,
    actor_id: adminId,
    actor_type: "admin",
    action,
    summary,
  });
}

/** Confirm an owner-submitted top-up → grant the credits. */
export async function confirmCreditPurchase(purchaseId: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const db = adminDb();

  const { data: p } = await db
    .from("credit_purchases")
    .select("id, business_id, credits, amount, method, txn_id, status")
    .eq("id", purchaseId)
    .maybeSingle();
  if (!p) return { error: "Purchase not found" };
  if (p.status !== "submitted") return { error: "Already resolved" };

  const res = await grantCredits(p.business_id as string, Number(p.credits), {
    reason: "purchase",
    actorId: admin.id,
    actorType: "admin",
    refType: "credit_purchase",
    refId: p.id as string,
  });
  if (!res.ok) return { error: res.reason };

  await db
    .from("credit_purchases")
    .update({ status: "granted", resolved_by: admin.id, resolved_at: new Date().toISOString() })
    .eq("id", p.id);

  await db.from("notifications").insert({
    business_id: p.business_id as string,
    type: "credits_granted",
    title: `${Number(p.credits).toLocaleString("en-US")} assistant credits added`,
    body: `Your ৳${Number(p.amount)} ${p.method} payment was confirmed.`,
    href: "/app/billing#credits",
  });

  await auditAdmin(
    p.business_id as string,
    admin.id,
    "credits.purchase_confirmed",
    `Confirmed ${p.method} txn ${p.txn_id} — granted ${p.credits} credits`,
  );

  revalidatePath("/admin/credits");
  return { ok: true };
}

export async function rejectCreditPurchase(
  purchaseId: string,
  note: string,
): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const db = adminDb();
  const { data: p } = await db
    .from("credit_purchases")
    .select("id, business_id, status")
    .eq("id", purchaseId)
    .maybeSingle();
  if (!p) return { error: "Purchase not found" };
  if (p.status !== "submitted") return { error: "Already resolved" };

  await db
    .from("credit_purchases")
    .update({ status: "rejected", note: note.slice(0, 300), resolved_by: admin.id, resolved_at: new Date().toISOString() })
    .eq("id", p.id);

  await db.from("notifications").insert({
    business_id: p.business_id as string,
    type: "credits_rejected",
    title: "Credit payment not confirmed",
    body: note.slice(0, 300) || "We couldn't verify that transaction. Contact support.",
    href: "/app/billing#credits",
  });

  await auditAdmin(p.business_id as string, admin.id, "credits.purchase_rejected", `Rejected credit purchase: ${note}`);
  revalidatePath("/admin/credits");
  return { ok: true };
}

/** Manual add/deduct of credits for any store (item 6: admin add/edit/delete credit). */
export async function adminAdjustCredits(
  businessId: string,
  amount: number,
  note: string,
): Promise<{ ok: true; balanceAfter: number } | { error: string }> {
  const admin = await requireAdmin();
  if (!Number.isFinite(amount) || amount === 0) return { error: "Enter a non-zero amount." };

  const res = await grantCredits(businessId, Math.round(amount), {
    reason: "admin_adjust",
    actorId: admin.id,
    actorType: "admin",
    note: note.slice(0, 300),
  });
  if (!res.ok) return { error: res.reason };

  await adminDb().from("notifications").insert({
    business_id: businessId,
    type: "credits_adjusted",
    title: amount > 0 ? `${amount} assistant credits added` : `${-amount} assistant credits removed`,
    body: note.slice(0, 300) || "Adjusted by Zotomic support.",
    href: "/app/billing#credits",
  });

  await auditAdmin(
    businessId,
    admin.id,
    "credits.admin_adjust",
    `${amount > 0 ? "Added" : "Removed"} ${Math.abs(amount)} credits${note ? ` — ${note}` : ""}`,
  );

  revalidatePath("/admin/credits");
  return { ok: true, balanceAfter: res.balanceAfter };
}
