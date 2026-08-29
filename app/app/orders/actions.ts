"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";
import { issueReviewTokens } from "@/lib/reviews";

const STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "returned", "cancelled"];

export async function setOrderStatus(orderId: string, status: string) {
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
