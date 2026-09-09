"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";
import { getAdminSupabase } from "@/lib/supabase";
import { creditPack } from "@/lib/credits";

/** Owner submits a bKash/Nagad payment for a credit pack. Admin confirms it. */
export async function submitCreditPurchase(form: FormData): Promise<{ ok: true } | { error: string }> {
  const { businessId, user } = await requireBusiness({ allowReadOnly: true });

  const packId = String(form.get("pack") ?? "");
  const method = String(form.get("method") ?? "");
  const txnId = String(form.get("txn_id") ?? "").trim().slice(0, 64);

  const pack = creditPack(packId);
  if (!pack) return { error: "Pick a credit pack." };
  if (method !== "bkash" && method !== "nagad") return { error: "Choose bKash or Nagad." };
  if (txnId.length < 4) return { error: "Enter the transaction ID from your payment." };

  const db = getAdminSupabase();

  // guard against an accidental double-submit of the same txn
  const { data: dupe } = await db
    .from("credit_purchases")
    .select("id")
    .eq("business_id", businessId)
    .eq("txn_id", txnId)
    .maybeSingle();
  if (dupe) return { error: "That transaction ID has already been submitted." };

  const { error } = await db.from("credit_purchases").insert({
    business_id: businessId,
    pack_id: pack.id,
    credits: pack.credits,
    amount: pack.price,
    currency: "BDT",
    method,
    txn_id: txnId,
    submitted_by: user.id,
  });
  if (error) return { error: "Could not submit — try again." };

  const { data: biz } = await db.from("businesses").select("name").eq("id", businessId).maybeSingle();

  await writeAudit(businessId, user.id, "credits.purchase_submitted", {
    summary: `Submitted ${method} payment for ${pack.credits} credits (৳${pack.price}), txn ${txnId}`,
  });

  const { notifyAdmins } = await import("@/lib/notify");
  await notifyAdmins("payment_pending", {
    title: `Credit top-up to confirm — ${biz?.name ?? "a store"}`,
    body: `${pack.credits} credits · ৳${pack.price} · ${method} · txn ${txnId}`,
    href: "/admin/credits",
    businessId,
  });

  revalidatePath("/app/billing");
  return { ok: true };
}
