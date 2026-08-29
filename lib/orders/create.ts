import { getAdminSupabase } from "@/lib/supabase";

export interface OrderInput {
  businessId: string;
  currency: string;
  channel: "storefront" | "manual" | "import";
  status?: string;
  paymentMethod?: string;
  paymentStatus?: "unpaid" | "paid";
  customer: { name: string; phone: string; email?: string | null; city?: string | null; address?: string | null; note?: string | null };
  items: { productId: string; qty: number }[];
  shipping?: number;
  discount?: number;
  orderNumber?: string;
  placedAt?: string;
}

export interface CreatedOrder {
  id: string;
  orderNumber: string;
  total: number;
  subtotal: number;
  shipping: number;
  lineItems: { productId: string; name: string; qty: number; unitPrice: number; lineTotal: number }[];
  customerId: string;
}

const clean = (s: unknown, n = 200) => String(s ?? "").trim().slice(0, n);

/** Shared order creation: validates prices server-side, upserts the customer,
 *  writes Order + OrderItems, decrements tracked stock, refreshes rollups. */
export async function createOrder(input: OrderInput): Promise<CreatedOrder | { error: string }> {
  const db = getAdminSupabase();
  const name = clean(input.customer.name);
  const phone = clean(input.customer.phone, 32);
  if (!name || !phone) return { error: "Customer name and phone are required." };
  if (!input.items?.length) return { error: "Add at least one product." };

  const ids = [...new Set(input.items.map((i) => i.productId))].slice(0, 100);
  const { data: products } = await db
    .from("products")
    .select("id, name, price, sale_price, buying_price, stock_qty, track_inventory")
    .eq("business_id", input.businessId)
    .in("id", ids);
  const pmap = new Map((products ?? []).map((p) => [p.id as string, p]));

  type LineItem = CreatedOrder["lineItems"][number] & { buyingPrice: number | null };
  const lineItems: LineItem[] = [];
  for (const it of input.items) {
    const p = pmap.get(it.productId);
    if (!p) continue;
    const qty = Math.max(1, Math.min(999, Math.floor(Number(it.qty) || 1)));
    const unit =
      p.sale_price != null && Number(p.sale_price) < Number(p.price) ? Number(p.sale_price) : Number(p.price);
    lineItems.push({
      productId: p.id as string,
      name: p.name as string,
      qty,
      unitPrice: unit,
      lineTotal: unit * qty,
      buyingPrice: p.buying_price == null ? null : Number(p.buying_price),
    });
  }
  if (!lineItems.length) return { error: "None of the selected products exist." };

  const subtotal = lineItems.reduce((s, i) => s + i.lineTotal, 0);
  const shipping = Math.max(0, Number(input.shipping ?? 0));
  const discount = Math.max(0, Number(input.discount ?? 0));
  const total = Math.max(0, subtotal + shipping - discount);

  // upsert customer by phone
  const { data: existing } = await db
    .from("customers")
    .select("id")
    .eq("business_id", input.businessId)
    .eq("phone", phone)
    .maybeSingle();
  let customerId = existing?.id as string | undefined;
  const custFields = {
    name,
    email: clean(input.customer.email, 200) || null,
    city: clean(input.customer.city, 80) || null,
  };
  if (customerId) {
    await db.from("customers").update(custFields).eq("id", customerId);
  } else {
    const { data: nc } = await db
      .from("customers")
      .insert({ business_id: input.businessId, phone, ...custFields })
      .select("id")
      .single();
    customerId = nc?.id as string;
  }

  const orderNumber = input.orderNumber || `ZM-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const { data: order, error } = await db
    .from("orders")
    .insert({
      business_id: input.businessId,
      order_number: orderNumber,
      customer_id: customerId,
      channel: input.channel,
      status: input.status ?? "pending",
      payment_method: input.paymentMethod ?? "cod",
      payment_status: input.paymentStatus ?? "unpaid",
      subtotal,
      shipping,
      discount,
      total,
      currency: input.currency,
      address: {
        line: clean(input.customer.address, 500),
        city: clean(input.customer.city, 80),
        note: clean(input.customer.note, 300),
      },
      placed_at: input.placedAt ?? new Date().toISOString(),
    })
    .select("id, order_number")
    .single();
  if (error || !order) return { error: "Could not create the order." };

  await db.from("order_items").insert(
    lineItems.map((li) => ({
      order_id: order.id,
      business_id: input.businessId,
      product_id: li.productId,
      name: li.name,
      qty: li.qty,
      unit_price: li.unitPrice,
      buying_price: li.buyingPrice,
      line_total: li.lineTotal,
    })),
  );

  for (const li of lineItems) {
    const p = pmap.get(li.productId);
    if (p?.track_inventory) {
      await db
        .from("products")
        .update({ stock_qty: Math.max(0, Number(p.stock_qty) - li.qty) })
        .eq("id", li.productId);
    }
  }

  // customer rollups
  const { data: agg } = await db
    .from("orders")
    .select("total, placed_at")
    .eq("business_id", input.businessId)
    .eq("customer_id", customerId);
  const rows = agg ?? [];
  await db
    .from("customers")
    .update({
      total_orders: rows.length,
      total_spent: rows.reduce((s, o) => s + Number(o.total), 0),
      first_order_at: rows.reduce<string | null>((m, o) => (!m || o.placed_at < m ? (o.placed_at as string) : m), null),
      last_order_at: new Date().toISOString(),
    })
    .eq("id", customerId);

  return {
    id: order.id as string,
    orderNumber: order.order_number as string,
    total,
    subtotal,
    shipping,
    lineItems: lineItems.map(({ productId, name: n, qty, unitPrice, lineTotal }) => ({
      productId,
      name: n,
      qty,
      unitPrice,
      lineTotal,
    })),
    customerId: customerId!,
  };
}
