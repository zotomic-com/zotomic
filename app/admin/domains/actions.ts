"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-server";
import { getAdminSupabase } from "@/lib/supabase";
import { setPlatformSetting } from "@/lib/platform-settings";
import { fulfillCartOrder, renewItem } from "@/lib/domains/orders";

async function audit(adminId: string, action: string, summary: string, targetId?: string) {
  await getAdminSupabase()
    .from("audit_logs")
    .insert({ actor_id: adminId, actor_type: "admin", action, target_type: "domain_cart_item", target_id: targetId ?? null, summary });
}

export async function regenerateWebhookSecretAction(): Promise<{ ok: true; secret: string }> {
  const admin = await requireAdmin();
  const secret = randomBytes(24).toString("hex");
  await setPlatformSetting("domain_sms_webhook_secret", secret, admin.id);
  await audit(admin.id, "domains.webhook_secret_regenerated", "Regenerated the SMS webhook secret");
  revalidatePath("/admin/domains/settings");
  return { ok: true, secret };
}

/** Fallback for when the SMS listener misses a payment — admin confirms it manually. Order-scoped, since payment is combined. */
export async function markOrderPaidAction(cartOrderId: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const { data: order } = await db.from("domain_cart_orders").select("status, order_number").eq("id", cartOrderId).maybeSingle();
  if (!order) return { error: "Order not found." };
  if (order.status !== "pending_payment") return { error: "This order isn't awaiting payment." };

  await db.from("domain_cart_orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", cartOrderId);
  await audit(admin.id, "domains.marked_paid", `Manually marked ${order.order_number} paid`, cartOrderId);
  await fulfillCartOrder(cartOrderId);
  revalidatePath("/admin/domains");
  return { ok: true };
}

/** Retry after a failed step — e.g. Cloudflare/Dynadot hiccup, or credentials were just added. Item-scoped. */
export async function retryFulfillmentAction(itemId: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const { data: item } = await db.from("domain_cart_items").select("status, domain_name, cart_order_id").eq("id", itemId).maybeSingle();
  if (!item) return { error: "Domain not found." };
  if (item.status !== "failed") return { error: "This domain isn't in a failed state." };

  await db.from("domain_cart_items").update({ status: "pending", last_error: null }).eq("id", itemId);
  await audit(admin.id, "domains.fulfillment_retried", `Retried fulfillment for ${item.domain_name}`, itemId);
  await fulfillCartOrder(item.cart_order_id as string);
  revalidatePath("/admin/domains");
  return { ok: true };
}

export async function cancelItemAction(itemId: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const { data: item } = await db.from("domain_cart_items").select("domain_name, status").eq("id", itemId).maybeSingle();
  if (!item) return { error: "Domain not found." };
  if (item.status === "active") return { error: "This domain is already registered — cancel through Dynadot directly if needed." };

  await db.from("domain_cart_items").update({ status: "cancelled" }).eq("id", itemId);
  await audit(admin.id, "domains.item_cancelled", `Cancelled ${item.domain_name}`, itemId);
  revalidatePath("/admin/domains");
  return { ok: true };
}

export async function renewItemAction(itemId: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const res = await renewItem(itemId);
  if ("ok" in res) {
    await audit(admin.id, "domains.renewed", "Renewed a domain from the float", itemId);
    revalidatePath("/admin/domains");
  }
  return res;
}
