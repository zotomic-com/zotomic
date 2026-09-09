import "server-only";
import { getAdminSupabase } from "@/lib/supabase";
import type { StoreAccount } from "./account";
import type { OrderStatus } from "./order-status";

export interface CustomerOrderItem {
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  image: string | null;
  productId: string | null;
  productSlug: string | null;
  variantId: string | null;
}

export interface CustomerOrderSummary {
  id: string;
  number: string;
  status: OrderStatus;
  total: number;
  subtotal: number;
  shipping: number;
  discount: number;
  currency: string;
  placedAt: string;
  deliveredAt: string | null;
  itemCount: number;
  thumb: string | null;
  titleLine: string;
}

export interface CustomerOrderDetail extends CustomerOrderSummary {
  paymentMethod: string;
  paymentStatus: string;
  cancelReason: string | null;
  address: { line: string; city: string; note: string } | null;
  items: CustomerOrderItem[];
  shipment: {
    provider: string;
    trackingCode: string | null;
    consignmentId: string | null;
    status: string;
  } | null;
  activeReturn: { number: string; status: string; createdAt: string } | null;
  reviewable: { productId: string; name: string; token: string | null }[];
}

/** OR-filter that scopes orders to a shopper: their account OR their linked CRM customer. */
function scopeFilter(account: StoreAccount): string {
  return account.customerId
    ? `store_account_id.eq.${account.id},customer_id.eq.${account.customerId}`
    : `store_account_id.eq.${account.id}`;
}

async function imagesFor(businessId: string, productIds: string[]): Promise<Map<string, { image: string | null; slug: string | null }>> {
  const ids = [...new Set(productIds.filter(Boolean))];
  const map = new Map<string, { image: string | null; slug: string | null }>();
  if (!ids.length) return map;
  const { data } = await getAdminSupabase()
    .from("products")
    .select("id, slug, image_urls")
    .eq("business_id", businessId)
    .in("id", ids);
  for (const p of data ?? []) {
    const imgs = Array.isArray(p.image_urls) ? (p.image_urls as string[]) : [];
    map.set(p.id as string, { image: imgs[0] ?? null, slug: (p.slug as string) ?? null });
  }
  return map;
}

export async function listCustomerOrders(
  businessId: string,
  account: StoreAccount,
): Promise<CustomerOrderSummary[]> {
  const db = getAdminSupabase();
  const { data: orders } = await db
    .from("orders")
    .select("id, order_number, status, total, subtotal, shipping, discount, currency, placed_at, delivered_at, order_items(name, qty, product_id)")
    .eq("business_id", businessId)
    .or(scopeFilter(account))
    .order("placed_at", { ascending: false })
    .limit(100);

  const rows = orders ?? [];
  const allPids = rows.flatMap((o) => ((o.order_items ?? []) as { product_id: string | null }[]).map((i) => i.product_id ?? ""));
  const imgMap = await imagesFor(businessId, allPids);

  return rows.map((o) => {
    const items = (o.order_items ?? []) as { name: string; qty: number; product_id: string | null }[];
    const itemCount = items.reduce((n, i) => n + Number(i.qty), 0);
    const firstWithImg = items.find((i) => i.product_id && imgMap.get(i.product_id)?.image);
    const thumb = firstWithImg?.product_id ? imgMap.get(firstWithImg.product_id)?.image ?? null : null;
    const titleLine =
      items.length === 0
        ? "—"
        : items.length === 1
          ? items[0].name
          : `${items[0].name} + ${items.length - 1} more`;
    return {
      id: o.id as string,
      number: o.order_number as string,
      status: o.status as OrderStatus,
      total: Number(o.total),
      subtotal: Number(o.subtotal),
      shipping: Number(o.shipping),
      discount: Number(o.discount),
      currency: o.currency as string,
      placedAt: o.placed_at as string,
      deliveredAt: (o.delivered_at as string) ?? null,
      itemCount,
      thumb,
      titleLine,
    };
  });
}

export async function getCustomerOrder(
  businessId: string,
  account: StoreAccount,
  orderNumber: string,
): Promise<CustomerOrderDetail | null> {
  const db = getAdminSupabase();
  const { data: o } = await db
    .from("orders")
    .select(
      "id, order_number, status, total, subtotal, shipping, discount, currency, placed_at, delivered_at, payment_method, payment_status, cancel_reason, address, store_account_id, customer_id, order_items(name, qty, unit_price, line_total, product_id, variant_id)",
    )
    .eq("business_id", businessId)
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (!o) return null;
  // scope guard — must belong to this shopper
  const mine =
    o.store_account_id === account.id ||
    (account.customerId != null && o.customer_id === account.customerId);
  if (!mine) return null;

  const rawItems = (o.order_items ?? []) as {
    name: string;
    qty: number;
    unit_price: number;
    line_total: number;
    product_id: string | null;
    variant_id: string | null;
  }[];
  const imgMap = await imagesFor(businessId, rawItems.map((i) => i.product_id ?? ""));

  const items: CustomerOrderItem[] = rawItems.map((i) => {
    const meta = i.product_id ? imgMap.get(i.product_id) : undefined;
    return {
      name: i.name,
      qty: Number(i.qty),
      unitPrice: Number(i.unit_price),
      lineTotal: Number(i.line_total),
      image: meta?.image ?? null,
      productId: i.product_id ?? null,
      productSlug: meta?.slug ?? null,
      variantId: i.variant_id ?? null,
    };
  });

  const [{ data: ship }, { data: returns }] = await Promise.all([
    db
      .from("shipments")
      .select("provider, tracking_code, consignment_id, status")
      .eq("order_id", o.id)
      .maybeSingle(),
    db
      .from("returns")
      .select("return_number, status, created_at")
      .eq("business_id", businessId)
      .eq("order_id", o.id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const activeRet = (returns ?? [])[0];
  const status = o.status as OrderStatus;

  // reviewable products (delivered orders only) — surface unused review tokens
  let reviewable: CustomerOrderDetail["reviewable"] = [];
  if (status === "delivered") {
    const { data: toks } = await db
      .from("review_tokens")
      .select("token, product_id, used_at")
      .eq("business_id", businessId)
      .eq("order_id", o.id);
    const tokMap = new Map((toks ?? []).map((t) => [t.product_id as string, t]));
    const seen = new Set<string>();
    for (const it of items) {
      if (!it.productId || seen.has(it.productId)) continue;
      seen.add(it.productId);
      const t = tokMap.get(it.productId);
      reviewable.push({ productId: it.productId, name: it.name, token: t && !t.used_at ? (t.token as string) : null });
    }
  }

  const addr = (o.address ?? null) as { line?: string; city?: string; note?: string } | null;

  return {
    id: o.id as string,
    number: o.order_number as string,
    status,
    total: Number(o.total),
    subtotal: Number(o.subtotal),
    shipping: Number(o.shipping),
    discount: Number(o.discount),
    currency: o.currency as string,
    placedAt: o.placed_at as string,
    deliveredAt: (o.delivered_at as string) ?? null,
    itemCount: items.reduce((n, i) => n + i.qty, 0),
    thumb: items.find((i) => i.image)?.image ?? null,
    titleLine: items.length === 1 ? items[0].name : `${items.length} items`,
    paymentMethod: o.payment_method as string,
    paymentStatus: o.payment_status as string,
    cancelReason: (o.cancel_reason as string) ?? null,
    address: addr ? { line: addr.line ?? "", city: addr.city ?? "", note: addr.note ?? "" } : null,
    items,
    shipment: ship
      ? {
          provider: ship.provider as string,
          trackingCode: (ship.tracking_code as string) ?? null,
          consignmentId: (ship.consignment_id as string) ?? null,
          status: ship.status as string,
        }
      : null,
    activeReturn: activeRet
      ? {
          number: activeRet.return_number as string,
          status: activeRet.status as string,
          createdAt: activeRet.created_at as string,
        }
      : null,
    reviewable,
  };
}

export interface CustomerStats {
  total: number;
  inProgress: number;
  delivered: number;
}

export async function customerOrderStats(
  businessId: string,
  account: StoreAccount,
): Promise<CustomerStats> {
  const { data } = await getAdminSupabase()
    .from("orders")
    .select("status")
    .eq("business_id", businessId)
    .or(scopeFilter(account))
    .limit(500);
  const rows = data ?? [];
  return {
    total: rows.length,
    inProgress: rows.filter((r) => ["pending", "confirmed", "processing", "shipped"].includes(r.status as string)).length,
    delivered: rows.filter((r) => r.status === "delivered").length,
  };
}
