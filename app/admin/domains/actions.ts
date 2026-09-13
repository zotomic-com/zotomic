"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-server";
import { getAdminSupabase } from "@/lib/supabase";
import { setPlatformSetting } from "@/lib/platform-settings";
import { fulfillCartOrder, renewItem } from "@/lib/domains/orders";
import { createPricingRule, updatePricingRule, deletePricingRule, type PricingRuleInput } from "@/lib/domains/pricing-rules";

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

// ---------- per-TLD pricing rules ----------

export async function createPricingRuleAction(input: PricingRuleInput): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  if (!input.tld.trim()) return { error: "TLD is required." };
  const res = await createPricingRule(input);
  if ("ok" in res) {
    await audit(admin.id, "domains.pricing_rule_created", `Added pricing rule for ${input.provider}/.${input.tld}`);
    revalidatePath("/admin/domains");
  }
  return res;
}

export async function updatePricingRuleAction(id: string, patch: Partial<PricingRuleInput & { enabled: boolean }>) {
  const admin = await requireAdmin();
  await updatePricingRule(id, patch);
  await audit(admin.id, "domains.pricing_rule_updated", "Updated a pricing rule", id);
  revalidatePath("/admin/domains");
  return { ok: true };
}

export async function deletePricingRuleAction(id: string) {
  const admin = await requireAdmin();
  await deletePricingRule(id);
  await audit(admin.id, "domains.pricing_rule_deleted", "Deleted a pricing rule", id);
  revalidatePath("/admin/domains");
  return { ok: true };
}

// ---------- manual domain records (add / edit / delete) ----------

export interface DomainRecordInput {
  domainName: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  pointTo: "self" | "zotomic";
  paymentMethod: "bkash" | "nagad";
  retailPrice: number;
  wholesaleCost?: number;
  status: string;
  expiresAt?: string;
}

const ITEM_STATUSES = ["pending", "registering", "transferring", "active", "grace", "dropped", "failed", "cancelled"];

/** For sales made outside the automated /domains checkout — e.g. an offline/phone customer, or a pre-existing domain being tracked. */
export async function createManualDomainAction(input: DomainRecordInput): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  if (!input.domainName.trim()) return { error: "Domain name is required." };
  if (!input.customerName.trim() || !input.customerPhone.trim()) return { error: "Customer name and phone are required." };
  if (!ITEM_STATUSES.includes(input.status)) return { error: "Invalid status." };

  const db = getAdminSupabase();
  const orderNumber = `DC-M${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const { data: order, error } = await db
    .from("domain_cart_orders")
    .insert({
      order_number: orderNumber,
      user_id: null,
      customer_name: input.customerName.slice(0, 120),
      customer_phone: input.customerPhone.slice(0, 32),
      customer_email: input.customerEmail?.slice(0, 200) || null,
      payment_method: input.paymentMethod,
      subtotal: input.retailPrice,
      invoice_amount: input.retailPrice,
      status: "paid",
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !order) return { error: "Could not create the order." };

  const { error: itemError } = await db.from("domain_cart_items").insert({
    cart_order_id: order.id,
    item_type: "register",
    domain_name: input.domainName.trim().toLowerCase(),
    point_to: input.pointTo,
    wholesale_cost: input.wholesaleCost ?? 0,
    retail_price: input.retailPrice,
    status: input.status,
    expires_at: input.expiresAt || null,
    registered_at: new Date().toISOString(),
  });
  if (itemError) {
    await db.from("domain_cart_orders").delete().eq("id", order.id);
    return { error: "Could not create the domain record." };
  }

  await audit(admin.id, "domains.manual_entry_created", `Manually added ${input.domainName} for ${input.customerName}`, order.id);
  revalidatePath("/admin/domains");
  return { ok: true };
}

export async function updateDomainRecordAction(
  itemId: string,
  patch: Partial<DomainRecordInput>,
): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const { data: item } = await db.from("domain_cart_items").select("cart_order_id, domain_name").eq("id", itemId).maybeSingle();
  if (!item) return { error: "Domain not found." };
  if (patch.status !== undefined && !ITEM_STATUSES.includes(patch.status)) return { error: "Invalid status." };

  const itemUpdate: Record<string, unknown> = {};
  if (patch.domainName !== undefined) itemUpdate.domain_name = patch.domainName.trim().toLowerCase();
  if (patch.pointTo !== undefined) itemUpdate.point_to = patch.pointTo;
  if (patch.retailPrice !== undefined) itemUpdate.retail_price = patch.retailPrice;
  if (patch.wholesaleCost !== undefined) itemUpdate.wholesale_cost = patch.wholesaleCost;
  if (patch.status !== undefined) itemUpdate.status = patch.status;
  if (patch.expiresAt !== undefined) itemUpdate.expires_at = patch.expiresAt || null;
  if (Object.keys(itemUpdate).length) await db.from("domain_cart_items").update(itemUpdate).eq("id", itemId);

  const orderUpdate: Record<string, unknown> = {};
  if (patch.customerName !== undefined) orderUpdate.customer_name = patch.customerName.slice(0, 120);
  if (patch.customerPhone !== undefined) orderUpdate.customer_phone = patch.customerPhone.slice(0, 32);
  if (patch.customerEmail !== undefined) orderUpdate.customer_email = patch.customerEmail.slice(0, 200) || null;
  if (patch.paymentMethod !== undefined) orderUpdate.payment_method = patch.paymentMethod;
  // The displayed price is the order's invoice_amount, not the item's retail_price — for a
  // single-item order (true for every manual entry, and most real ones) keep them in sync,
  // rather than silently editing a number nothing else reads.
  if (patch.retailPrice !== undefined) {
    const { count } = await db.from("domain_cart_items").select("id", { count: "exact", head: true }).eq("cart_order_id", item.cart_order_id);
    if (count === 1) {
      orderUpdate.subtotal = patch.retailPrice;
      orderUpdate.invoice_amount = patch.retailPrice;
    }
  }
  if (Object.keys(orderUpdate).length) await db.from("domain_cart_orders").update(orderUpdate).eq("id", item.cart_order_id);

  await audit(admin.id, "domains.record_edited", `Edited ${patch.domainName ?? item.domain_name}`, itemId);
  revalidatePath("/admin/domains");
  return { ok: true };
}

/** Permanently removes the record — for cleaning up test/erroneous entries. Also removes the parent order if this was its only item. */
export async function deleteDomainRecordAction(itemId: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const { data: item } = await db.from("domain_cart_items").select("cart_order_id, domain_name").eq("id", itemId).maybeSingle();
  if (!item) return { error: "Domain not found." };

  await db.from("domain_cart_items").delete().eq("id", itemId);
  const { count } = await db.from("domain_cart_items").select("id", { count: "exact", head: true }).eq("cart_order_id", item.cart_order_id);
  if (!count) await db.from("domain_cart_orders").delete().eq("id", item.cart_order_id);

  await audit(admin.id, "domains.record_deleted", `Deleted ${item.domain_name}`, itemId);
  revalidatePath("/admin/domains");
  return { ok: true };
}
