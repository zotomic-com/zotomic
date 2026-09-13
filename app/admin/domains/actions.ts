"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-server";
import { getAdminSupabase } from "@/lib/supabase";
import { setPlatformSetting } from "@/lib/platform-settings";
import { fulfillOrder, renewOrder } from "@/lib/domains/orders";

async function audit(adminId: string, action: string, summary: string, targetId?: string) {
  await getAdminSupabase()
    .from("audit_logs")
    .insert({ actor_id: adminId, actor_type: "admin", action, target_type: "domain_order", target_id: targetId ?? null, summary });
}

export async function regenerateWebhookSecretAction(): Promise<{ ok: true; secret: string }> {
  const admin = await requireAdmin();
  const secret = randomBytes(24).toString("hex");
  await setPlatformSetting("domain_sms_webhook_secret", secret, admin.id);
  await audit(admin.id, "domains.webhook_secret_regenerated", "Regenerated the SMS webhook secret");
  revalidatePath("/admin/domains/settings");
  return { ok: true, secret };
}

/** Fallback for when the SMS listener misses a payment — admin confirms it manually. */
export async function markOrderPaidAction(orderId: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const { data: order } = await db.from("domain_orders").select("status, domain_name").eq("id", orderId).maybeSingle();
  if (!order) return { error: "Order not found." };
  if (order.status !== "pending_payment") return { error: "This order isn't awaiting payment." };

  await db.from("domain_orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", orderId);
  await audit(admin.id, "domains.marked_paid", `Manually marked ${order.domain_name} paid`, orderId);
  await fulfillOrder(orderId);
  revalidatePath("/admin/domains");
  return { ok: true };
}

/** Retry after a failed step — e.g. Cloudflare/Dynadot hiccup, or credentials were just added. */
export async function retryFulfillmentAction(orderId: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const { data: order } = await db.from("domain_orders").select("status, domain_name").eq("id", orderId).maybeSingle();
  if (!order) return { error: "Order not found." };
  if (order.status !== "failed") return { error: "This order isn't in a failed state." };

  await db.from("domain_orders").update({ status: "paid", last_error: null }).eq("id", orderId);
  await audit(admin.id, "domains.fulfillment_retried", `Retried fulfillment for ${order.domain_name}`, orderId);
  await fulfillOrder(orderId);
  revalidatePath("/admin/domains");
  return { ok: true };
}

export async function cancelOrderAction(orderId: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const { data: order } = await db.from("domain_orders").select("domain_name, status").eq("id", orderId).maybeSingle();
  if (!order) return { error: "Order not found." };
  if (order.status === "active") return { error: "This domain is already registered — cancel through Dynadot directly if needed." };

  await db.from("domain_orders").update({ status: "cancelled" }).eq("id", orderId);
  await audit(admin.id, "domains.order_cancelled", `Cancelled order for ${order.domain_name}`, orderId);
  revalidatePath("/admin/domains");
  return { ok: true };
}

export async function renewOrderAction(orderId: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const res = await renewOrder(orderId);
  if ("ok" in res) {
    await audit(admin.id, "domains.renewed", "Renewed a domain from the float", orderId);
    revalidatePath("/admin/domains");
  }
  return res;
}
