import { randomBytes } from "crypto";
import { getAdminSupabase } from "@/lib/supabase";

/** Create one review invitation per distinct product in a delivered order. */
export async function issueReviewTokens(businessId: string, orderId: string): Promise<number> {
  const db = getAdminSupabase();
  const { data: order } = await db
    .from("orders")
    .select("id, customer_id, order_items(product_id)")
    .eq("business_id", businessId)
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return 0;

  const productIds = [
    ...new Set(
      ((order.order_items ?? []) as { product_id: string | null }[])
        .map((i) => i.product_id)
        .filter(Boolean) as string[],
    ),
  ];
  if (!productIds.length) return 0;

  const rows = productIds.map((pid) => ({
    token: randomBytes(18).toString("base64url"),
    business_id: businessId,
    order_id: orderId,
    product_id: pid,
    customer_id: order.customer_id,
  }));

  const { data } = await db
    .from("review_tokens")
    .upsert(rows, { onConflict: "order_id,product_id", ignoreDuplicates: true })
    .select("token");

  return data?.length ?? 0;
}
