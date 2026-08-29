import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { getStoreBySlug } from "@/lib/storefront/store";
import { revalidatePath } from "next/cache";
import { sendNewOrderAlert, sendOrderConfirmation } from "@/lib/emails";
import { loadIntegration, paymentProvider } from "@/lib/adapters/registry";

interface Body {
  storeSlug: string;
  items: { id: string; qty: number }[];
  customer: { name: string; phone: string; email?: string; address: string; city?: string; note?: string };
  paymentMethod?: string;
}

const clean = (s: unknown, max = 200) => String(s ?? "").trim().slice(0, max);

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const store = await getStoreBySlug(body.storeSlug);
  if (!store || !store.published) {
    return NextResponse.json({ error: "Store unavailable" }, { status: 404 });
  }

  const name = clean(body.customer?.name);
  const phone = clean(body.customer?.phone, 32);
  const address = clean(body.customer?.address, 500);
  if (!name || !phone || !address) {
    return NextResponse.json({ error: "Name, phone and address are required." }, { status: 400 });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "Cart is empty." }, { status: 400 });
  }

  const db = getAdminSupabase();
  const ids = [...new Set(body.items.map((i) => String(i.id)))].slice(0, 50);

  // Server-authoritative prices — never trust the client.
  const { data: products } = await db
    .from("products")
    .select("id, name, price, sale_price, buying_price, marketing_cost, stock_qty, track_inventory")
    .eq("business_id", store.businessId)
    .in("id", ids)
    .eq("status", "active");

  const priceMap = new Map((products ?? []).map((p) => [p.id as string, p]));
  const lineItems: {
    product_id: string;
    name: string;
    qty: number;
    unit_price: number;
    buying_price: number | null;
    line_total: number;
  }[] = [];

  for (const item of body.items) {
    const p = priceMap.get(String(item.id));
    if (!p) continue;
    const qty = Math.max(1, Math.min(99, Math.floor(Number(item.qty) || 1)));
    if (p.track_inventory && Number(p.stock_qty) < qty) {
      return NextResponse.json({ error: `${p.name} is out of stock.` }, { status: 409 });
    }
    const unit = p.sale_price != null && Number(p.sale_price) < Number(p.price) ? Number(p.sale_price) : Number(p.price);
    lineItems.push({
      product_id: p.id as string,
      name: p.name as string,
      qty,
      unit_price: unit,
      buying_price: p.buying_price == null ? null : Number(p.buying_price),
      line_total: unit * qty,
    });
  }

  if (lineItems.length === 0) {
    return NextResponse.json({ error: "None of the cart items are available." }, { status: 409 });
  }

  const subtotal = lineItems.reduce((s, i) => s + i.line_total, 0);
  const c = store.config.commerce;
  if (c.minOrder && subtotal < c.minOrder) {
    return NextResponse.json({ error: `Minimum order is ${c.minOrder}.` }, { status: 400 });
  }
  const shipping = c.freeShippingOver && subtotal >= c.freeShippingOver ? 0 : c.shippingFlatRate;
  const total = subtotal + shipping;

  // Upsert customer by phone.
  const { data: existingCust } = await db
    .from("customers")
    .select("id")
    .eq("business_id", store.businessId)
    .eq("phone", phone)
    .maybeSingle();

  let customerId = existingCust?.id as string | undefined;
  if (customerId) {
    await db
      .from("customers")
      .update({ name, email: clean(body.customer.email, 200) || null, city: clean(body.customer.city, 80) || null })
      .eq("id", customerId);
  } else {
    const { data: newCust } = await db
      .from("customers")
      .insert({
        business_id: store.businessId,
        name,
        phone,
        email: clean(body.customer.email, 200) || null,
        city: clean(body.customer.city, 80) || null,
      })
      .select("id")
      .single();
    customerId = newCust?.id as string;
  }

  const orderNumber = `ZF-${Date.now().toString(36).toUpperCase().slice(-6)}`;

  // Resolve a gateway if one was chosen and is actually connected.
  const chosenMethod = clean(body.paymentMethod, 20) || "cod";
  let gateway: { provider: string; mode: "sandbox" | "live"; creds: Record<string, string> } | null = null;
  if (chosenMethod !== "cod") {
    const integ = await loadIntegration(store.businessId, chosenMethod);
    if (integ && integ.category === "payment" && integ.status === "connected") {
      gateway = { provider: chosenMethod, mode: integ.mode, creds: integ.creds };
    }
  }

  const { data: order, error: orderErr } = await db
    .from("orders")
    .insert({
      business_id: store.businessId,
      order_number: orderNumber,
      customer_id: customerId,
      channel: "storefront",
      status: "pending",
      payment_method: gateway ? gateway.provider : "cod",
      payment_status: "unpaid",
      subtotal,
      shipping,
      discount: 0,
      total,
      currency: store.currency,
      address: { line: address, city: clean(body.customer.city, 80), note: clean(body.customer.note, 300) },
      placed_at: new Date().toISOString(),
    })
    .select("id, order_number")
    .single();

  if (orderErr || !order) {
    console.error("checkout order insert", orderErr);
    return NextResponse.json({ error: "Could not place the order. Please try again." }, { status: 500 });
  }

  await db.from("order_items").insert(
    lineItems.map((li) => ({ ...li, order_id: order.id, business_id: store.businessId })),
  );

  // Decrement tracked stock.
  for (const li of lineItems) {
    const p = priceMap.get(li.product_id);
    if (p?.track_inventory) {
      await db
        .from("products")
        .update({ stock_qty: Math.max(0, Number(p.stock_qty) - li.qty) })
        .eq("id", li.product_id);
    }
  }

  // Bump customer rollups (full recompute happens in the weekly report).
  {
    const { data: agg } = await db
      .from("orders")
      .select("total, placed_at")
      .eq("business_id", store.businessId)
      .eq("customer_id", customerId);
    const rows = agg ?? [];
    await db
      .from("customers")
      .update({
        total_orders: rows.length,
        total_spent: rows.reduce((s, o) => s + Number(o.total), 0),
        first_order_at: rows.reduce<string | null>(
          (m, o) => (!m || o.placed_at < m ? (o.placed_at as string) : m),
          null,
        ),
        last_order_at: new Date().toISOString(),
      })
      .eq("id", customerId);
  }

  // Storefront purchase event → feeds the intelligence layer.
  await db.from("storefront_events").insert({
    business_id: store.businessId,
    type: "purchase",
    path: "/checkout",
    value: total,
    meta: { order_number: order.order_number, items: lineItems.length },
  });

  await db.from("notifications").insert({
    business_id: store.businessId,
    type: "new_order",
    title: `New order ${order.order_number}`,
    body: `${name} · ${lineItems.length} item(s) · ${total} ${store.currency}`,
    href: "/app/orders",
  });

  revalidatePath(`/s/${body.storeSlug}`);

  // ── gateway payment: start it and hand back a redirect URL ────────────────
  if (gateway) {
    const provider = paymentProvider(gateway.provider);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const callbackUrl = `${siteUrl}/api/storefront/payment/callback/${gateway.provider}?order=${order.order_number}&store=${encodeURIComponent(
      store.slug,
    )}`;

    const { data: pay } = await db
      .from("payments")
      .insert({
        business_id: store.businessId,
        order_id: order.id,
        provider: gateway.provider,
        mode: gateway.mode,
        amount: total,
        currency: store.currency,
        status: "initiated",
      })
      .select("id")
      .single();

    const init = provider
      ? await provider.init(gateway.creds, gateway.mode, {
          amount: total,
          currency: store.currency,
          orderNumber: order.order_number as string,
          callbackUrl,
          customerName: name,
          customerPhone: phone,
        })
      : { ok: false, error: "Provider unavailable" };

    if (!init.ok || !init.redirectUrl) {
      await db.from("orders").update({ status: "cancelled" }).eq("id", order.id);
      await db.from("payments").update({ status: "failed", raw: { error: init.error } }).eq("id", pay?.id);
      return NextResponse.json(
        { error: init.error ?? "Could not start the payment. Try cash on delivery." },
        { status: 502 },
      );
    }

    await db.from("payments").update({ status: "pending", provider_ref: init.providerRef ?? null }).eq("id", pay?.id);
    return NextResponse.json({ ok: true, redirectUrl: init.redirectUrl, orderNumber: order.order_number });
  }

  // Emails — best effort, never block the response.
  const emailItems = lineItems.map((li) => ({ name: li.name, qty: li.qty, lineTotal: li.line_total }));
  const custEmail = clean(body.customer.email, 200);
  const { data: owner } = await db
    .from("business_members")
    .select("users(email)")
    .eq("business_id", store.businessId)
    .eq("role", "owner")
    .maybeSingle();
  const ownerEmail =
    ((Array.isArray(owner?.users) ? owner?.users[0] : owner?.users) as { email?: string } | null)?.email ?? "";

  await Promise.allSettled([
    custEmail
      ? sendOrderConfirmation({
          to: custEmail,
          storeName: store.name,
          orderNumber: order.order_number as string,
          currency: store.currency,
          items: emailItems,
          shipping,
          total,
        })
      : Promise.resolve(),
    sendNewOrderAlert({
      to: ownerEmail,
      orderNumber: order.order_number as string,
      customerName: name,
      total,
      currency: store.currency,
    }),
  ]);

  return NextResponse.json({ ok: true, orderNumber: order.order_number });
}
