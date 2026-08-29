"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";

export interface NewReturnItem {
  orderItemId: string;
  qty: number;
}

const RETURN_STATUSES = ["requested", "approved", "received", "refunded", "rejected", "cancelled"] as const;
type ReturnStatus = (typeof RETURN_STATUSES)[number];

export async function createReturn(input: {
  orderId: string;
  reason: string;
  refundAmount: number;
  restock: boolean;
  note?: string;
  items: NewReturnItem[];
}): Promise<{ error: string } | { ok: true; id: string }> {
  const { businessId, user, db } = await requireBusiness();

  const { data: order } = await db
    .from("orders")
    .select("id, order_number")
    .eq("business_id", businessId)
    .eq("id", input.orderId)
    .maybeSingle();
  if (!order) return { error: "Order not found" };

  const wanted = input.items.filter((i) => i.qty > 0);
  if (!wanted.length) return { error: "Select at least one item to return." };

  const { data: orderItems } = await db
    .from("order_items")
    .select("id, product_id, variant_id, name, qty, unit_price")
    .eq("business_id", businessId)
    .eq("order_id", input.orderId);
  const oiMap = new Map((orderItems ?? []).map((o) => [o.id as string, o]));

  const returnNumber = `RMA-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const { data: ret, error } = await db
    .from("returns")
    .insert({
      business_id: businessId,
      order_id: input.orderId,
      return_number: returnNumber,
      status: "requested",
      reason: input.reason?.slice(0, 300) || null,
      refund_amount: Math.max(0, Number(input.refundAmount) || 0),
      restock: input.restock !== false,
      note: input.note?.slice(0, 500) || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !ret) return { error: "Could not create the return." };

  const rows = wanted
    .map((w) => {
      const oi = oiMap.get(w.orderItemId);
      if (!oi) return null;
      return {
        return_id: ret.id,
        business_id: businessId,
        order_item_id: oi.id,
        product_id: oi.product_id,
        variant_id: oi.variant_id,
        name: oi.name,
        qty: Math.min(Number(w.qty), Number(oi.qty)),
        unit_price: oi.unit_price,
      };
    })
    .filter(Boolean) as Record<string, unknown>[];
  if (rows.length) await db.from("return_items").insert(rows);

  await writeAudit(businessId, user.id, "return.created", {
    targetType: "return",
    targetId: ret.id as string,
    summary: `${returnNumber} for order ${order.order_number}`,
  });

  revalidatePath("/app/returns");
  revalidatePath(`/app/orders/${input.orderId}`);
  return { ok: true, id: ret.id as string };
}

export async function setReturnStatus(
  returnId: string,
  status: ReturnStatus,
): Promise<{ error: string } | { ok: true }> {
  const { businessId, user, db } = await requireBusiness();
  if (!RETURN_STATUSES.includes(status)) return { error: "Bad status" };

  const { data: ret } = await db
    .from("returns")
    .select("id, order_id, status, restock, refund_amount, return_number")
    .eq("business_id", businessId)
    .eq("id", returnId)
    .maybeSingle();
  if (!ret) return { error: "Return not found" };

  const patch: Record<string, unknown> = { status };
  if (status === "refunded" || status === "received" || status === "rejected") {
    patch.processed_at = new Date().toISOString();
  }
  await db.from("returns").update(patch).eq("id", returnId).eq("business_id", businessId);

  // restock once, when the goods are marked received
  if (status === "received" && ret.restock && ret.status !== "received") {
    const { data: items } = await db
      .from("return_items")
      .select("product_id, variant_id, qty")
      .eq("return_id", returnId)
      .eq("business_id", businessId);
    for (const it of items ?? []) {
      const qty = Number(it.qty) || 0;
      if (!qty) continue;
      if (it.variant_id) {
        const { data: v } = await db
          .from("product_variants")
          .select("stock_qty, product_id")
          .eq("id", it.variant_id)
          .maybeSingle();
        if (v) {
          const bal = Number(v.stock_qty) + qty;
          await db.from("product_variants").update({ stock_qty: bal }).eq("id", it.variant_id);
          const { data: sib } = await db
            .from("product_variants")
            .select("stock_qty")
            .eq("business_id", businessId)
            .eq("product_id", v.product_id)
            .eq("active", true);
          await db
            .from("products")
            .update({ stock_qty: (sib ?? []).reduce((s, r) => s + Number(r.stock_qty), 0) })
            .eq("id", v.product_id);
          await db.from("inventory_adjustments").insert({
            business_id: businessId,
            product_id: v.product_id,
            variant_id: it.variant_id,
            delta: qty,
            balance: bal,
            reason: "return",
            note: `Return ${ret.return_number}`,
            created_by: user.id,
          });
        }
      } else if (it.product_id) {
        const { data: p } = await db.from("products").select("stock_qty").eq("id", it.product_id).maybeSingle();
        if (p) {
          const bal = Number(p.stock_qty) + qty;
          await db
            .from("products")
            .update({ stock_qty: bal, track_inventory: true })
            .eq("id", it.product_id);
          await db.from("inventory_adjustments").insert({
            business_id: businessId,
            product_id: it.product_id,
            delta: qty,
            balance: bal,
            reason: "return",
            note: `Return ${ret.return_number}`,
            created_by: user.id,
          });
        }
      }
    }
  }

  // reflect a refunded return on the order
  if (status === "refunded") {
    await db.from("orders").update({ status: "returned", payment_status: "refunded" }).eq("id", ret.order_id);
  }

  await writeAudit(businessId, user.id, "return.status", {
    targetType: "return",
    targetId: returnId,
    summary: `${ret.return_number} → ${status}`,
  });

  revalidatePath("/app/returns");
  revalidatePath(`/app/orders/${ret.order_id}`);
  return { ok: true };
}
