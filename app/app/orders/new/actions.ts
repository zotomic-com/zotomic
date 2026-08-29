"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";
import { createOrder } from "@/lib/orders/create";

export async function createManualOrder(payload: {
  customer: { name: string; phone: string; email?: string; city?: string; address?: string; note?: string };
  items: { productId: string; qty: number }[];
  shipping: number;
  discount: number;
  paymentMethod: "cod" | "bkash" | "other";
  paymentStatus: "unpaid" | "paid";
  status: string;
}) {
  const { businessId, user, business } = await requireBusiness();

  const res = await createOrder({
    businessId,
    currency: business?.currency ?? "BDT",
    channel: "manual",
    status: payload.status,
    paymentMethod: payload.paymentMethod,
    paymentStatus: payload.paymentStatus,
    customer: payload.customer,
    items: payload.items,
    shipping: payload.shipping,
    discount: payload.discount,
  });

  if ("error" in res) return res;

  await writeAudit(businessId, user.id, "order.created_manual", {
    targetType: "order",
    targetId: res.id,
    summary: `Manual order ${res.orderNumber}`,
  });
  revalidatePath("/app/orders");
  return { ok: true, orderId: res.id };
}
