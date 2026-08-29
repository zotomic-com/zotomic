"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";
import { issueReviewTokens } from "@/lib/reviews";
import { courierProvider, loadIntegration } from "@/lib/adapters/registry";

const STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "returned", "cancelled"];

export async function setOrderStatus(orderId: string, status: string, reason?: string) {
  if (!STATUSES.includes(status)) return { error: "Invalid status" };
  const { businessId, user, db } = await requireBusiness();

  const { data: before } = await db
    .from("orders")
    .select("status, order_number")
    .eq("business_id", businessId)
    .eq("id", orderId)
    .maybeSingle();
  if (!before) return { error: "Order not found" };

  const patch: Record<string, unknown> = { status };
  if (status === "delivered") patch.delivered_at = new Date().toISOString();
  if (status === "delivered" && before.status !== "delivered") patch.payment_status = "paid";
  if (status === "cancelled") {
    patch.cancelled_at = new Date().toISOString();
    if (reason && reason.trim()) patch.cancel_reason = reason.trim().slice(0, 500);
  }

  const { error } = await db.from("orders").update(patch).eq("business_id", businessId).eq("id", orderId);
  if (error) return { error: "Could not update" };

  await writeAudit(businessId, user.id, "order.status_changed", {
    targetType: "order",
    targetId: orderId,
    summary: `${before.order_number}: ${before.status} → ${status}`,
  });

  let reviewInvites = 0;
  if (status === "delivered" && before.status !== "delivered") {
    reviewInvites = await issueReviewTokens(businessId, orderId);
  }

  revalidatePath(`/app/orders/${orderId}`);
  revalidatePath("/app/orders");
  return { ok: true, reviewInvites };
}

export async function bookCourier(orderId: string, provider: string) {
  const { businessId, user, db } = await requireBusiness();

  const integ = await loadIntegration(businessId, provider);
  if (!integ || integ.category !== "courier" || integ.status !== "connected") {
    return { error: "Connect this courier in Integrations first." };
  }
  const adapter = courierProvider(provider);
  if (!adapter) return { error: "Unknown courier" };

  const { data: order } = await db
    .from("orders")
    .select("id, order_number, total, payment_method, payment_status, address, customers(name, phone), order_items(qty)")
    .eq("business_id", businessId)
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { error: "Order not found" };

  const { data: existing } = await db.from("shipments").select("id").eq("order_id", orderId).maybeSingle();
  if (existing) return { error: "A shipment already exists for this order." };

  const cust = (Array.isArray(order.customers) ? order.customers[0] : order.customers) as { name?: string; phone?: string } | null;
  const addr = (order.address ?? {}) as { line?: string; city?: string; note?: string };
  const cod = order.payment_status === "paid" ? 0 : Number(order.total);

  const res = await adapter.createShipment(integ.creds, integ.mode, {
    orderNumber: order.order_number as string,
    customerName: cust?.name ?? "Customer",
    customerPhone: cust?.phone ?? "",
    address: addr.line ?? "",
    city: addr.city ?? "",
    amountToCollect: cod,
    itemCount: (order.order_items ?? []).reduce((n: number, i: { qty: number }) => n + Number(i.qty), 0),
    note: addr.note,
  });

  if (!res.ok) {
    return { error: res.error ?? "Courier rejected the booking" };
  }

  await db.from("shipments").insert({
    business_id: businessId,
    order_id: orderId,
    provider,
    consignment_id: res.consignmentId ?? null,
    tracking_code: res.trackingCode ?? null,
    cost: res.cost ?? null,
    label_url: res.labelUrl ?? null,
    raw: res.raw ?? null,
    status: "created",
  });
  await db.from("orders").update({ status: "shipped" }).eq("id", orderId);
  await writeAudit(businessId, user.id, "shipment.created", {
    targetType: "order",
    targetId: orderId,
    summary: `${provider} · ${res.trackingCode ?? res.consignmentId}`,
  });

  revalidatePath(`/app/orders/${orderId}`);
  return { ok: true, tracking: res.trackingCode ?? res.consignmentId };
}
