import { randomBytes } from "crypto";
import { getAdminSupabase } from "@/lib/supabase";
import { sendReviewInvite } from "@/lib/emails";

const ROOT = process.env.STOREFRONT_ROOT_DOMAIN ?? "zotomic.com";

/** Create one review invitation per distinct product in a delivered order,
 *  and email the customer a link for each. Returns the number of invites made. */
export async function issueReviewTokens(businessId: string, orderId: string): Promise<number> {
  const db = getAdminSupabase();

  const { data: order } = await db
    .from("orders")
    .select("id, customer_id, order_items(product_id, name), customers(email, name)")
    .eq("business_id", businessId)
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return 0;

  const seen = new Set<string>();
  const products: { id: string; name: string }[] = [];
  for (const it of (order.order_items ?? []) as { product_id: string | null; name: string }[]) {
    if (it.product_id && !seen.has(it.product_id)) {
      seen.add(it.product_id);
      products.push({ id: it.product_id, name: it.name });
    }
  }
  if (!products.length) return 0;

  const rows = products.map((p) => ({
    token: randomBytes(18).toString("base64url"),
    business_id: businessId,
    order_id: orderId,
    product_id: p.id,
    customer_id: order.customer_id,
  }));

  const { data: inserted } = await db
    .from("review_tokens")
    .upsert(rows, { onConflict: "order_id,product_id", ignoreDuplicates: true })
    .select("token, product_id");

  const cust = (Array.isArray(order.customers) ? order.customers[0] : order.customers) as
    | { email?: string; name?: string }
    | null;

  if (cust?.email && inserted?.length) {
    const { data: cfg } = await db
      .from("storefront_config")
      .select("subdomain, businesses(name)")
      .eq("business_id", businessId)
      .maybeSingle();
    const sub = cfg?.subdomain as string | undefined;
    const storeName =
      ((Array.isArray(cfg?.businesses) ? cfg?.businesses[0] : cfg?.businesses) as { name?: string } | null)
        ?.name ?? "the store";

    for (const row of inserted) {
      const p = products.find((x) => x.id === row.product_id);
      const url = sub
        ? `https://${sub}.${ROOT}/review/${row.token}`
        : `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/s/${sub ?? ""}/review/${row.token}`;
      await sendReviewInvite({
        to: cust.email,
        storeName,
        productName: p?.name ?? "your order",
        reviewUrl: url,
      }).catch(() => {});
    }
  }

  return inserted?.length ?? 0;
}
