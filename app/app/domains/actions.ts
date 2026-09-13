"use server";

import { revalidatePath } from "next/cache";
import { requireUser, writeAudit } from "@/lib/app-actions";
import { getAdminSupabase } from "@/lib/supabase";
import { renewItem } from "@/lib/domains/orders";

/** Confirms the item belongs to the signed-in user before any mutation — orders join through cart_order_id. */
async function ownedItem(userId: string, itemId: string) {
  const db = getAdminSupabase();
  const { data } = await db
    .from("domain_cart_items")
    .select("id, domain_name, domain_cart_orders!inner(user_id)")
    .eq("id", itemId)
    .eq("domain_cart_orders.user_id", userId)
    .maybeSingle();
  return data;
}

export async function toggleAutoRenewAction(itemId: string, autoRenew: boolean): Promise<{ ok: true } | { error: string }> {
  const { user, businessId, db } = await requireUser();
  const item = await ownedItem(user.id, itemId);
  if (!item) return { error: "Domain not found." };

  await db.from("domain_cart_items").update({ auto_renew: autoRenew }).eq("id", itemId);
  await writeAudit(businessId, user.id, "domains.auto_renew_toggled", {
    targetType: "domain_cart_item",
    targetId: itemId,
    summary: `${autoRenew ? "Enabled" : "Disabled"} auto-renew for ${item.domain_name}`,
  });
  revalidatePath("/app/domains");
  return { ok: true };
}

export async function renewNowAction(itemId: string): Promise<{ ok: true } | { error: string }> {
  const { user } = await requireUser();
  const item = await ownedItem(user.id, itemId);
  if (!item) return { error: "Domain not found." };

  const res = await renewItem(itemId);
  if ("ok" in res) revalidatePath("/app/domains");
  return res;
}
