import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { getStoreBySlug } from "@/lib/storefront/store";
import { loadIntegration, paymentProvider } from "@/lib/adapters/registry";
import { sendOrderConfirmation } from "@/lib/emails";

const ROOT = process.env.STOREFRONT_ROOT_DOMAIN ?? "zotomic.com";

async function handle(req: NextRequest, providerId: string) {
  const url = new URL(req.url);
  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (params[k] = v));
  // include POST body params for gateways that POST back
  if (req.method === "POST") {
    try {
      const form = await req.formData();
      form.forEach((v, k) => (params[k] = String(v)));
    } catch {
      /* not form-encoded */
    }
  }

  const orderNumber = params.order;
  const storeSlug = params.store;
  if (!orderNumber || !storeSlug) return NextResponse.json({ error: "Bad callback" }, { status: 400 });

  const store = await getStoreBySlug(storeSlug);
  const db = getAdminSupabase();
  const { data: order } = await db
    .from("orders")
    .select("id, order_number, total, currency, business_id, customers(email), order_items(name, qty, line_total)")
    .eq("order_number", orderNumber)
    .maybeSingle();

  const done = (state: "confirmed" | "failed") =>
    NextResponse.redirect(
      new URL(
        state === "confirmed"
          ? `/order/${orderNumber}`
          : `/checkout?payment=failed`,
        `https://${storeSlug}.${ROOT}`,
      ),
    );

  if (!store || !order) return done("failed");

  const integ = await loadIntegration(order.business_id as string, providerId);
  const provider = paymentProvider(providerId);
  if (!integ || !provider) return done("failed");

  const result = await provider.verify(integ.creds, integ.mode, params);

  const { data: payment } = await db
    .from("payments")
    .select("id")
    .eq("order_id", order.id)
    .eq("provider", providerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.status === "paid") {
    await db.from("orders").update({ status: "confirmed", payment_status: "paid" }).eq("id", order.id);
    if (payment) await db.from("payments").update({ status: "paid", provider_ref: result.providerRef, raw: result.raw }).eq("id", payment.id);

    await db.from("storefront_events").insert({
      business_id: order.business_id,
      type: "purchase",
      path: "/checkout",
      value: Number(order.total),
      meta: { order_number: orderNumber, method: providerId },
    });

    const email = ((Array.isArray(order.customers) ? order.customers[0] : order.customers) as { email?: string } | null)?.email;
    if (email) {
      const items = (order.order_items ?? []) as { name: string; qty: number; line_total: number }[];
      await sendOrderConfirmation({
        to: email,
        storeName: store.name,
        orderNumber,
        currency: order.currency as string,
        items: items.map((i) => ({ name: i.name, qty: i.qty, lineTotal: Number(i.line_total) })),
        shipping: 0,
        total: Number(order.total),
      }).catch(() => {});
    }
    return done("confirmed");
  }

  await db.from("orders").update({ status: "cancelled" }).eq("id", order.id);
  if (payment) await db.from("payments").update({ status: result.status === "cancelled" ? "cancelled" : "failed", raw: result.raw }).eq("id", payment.id);
  return done("failed");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  return handle(req, (await params).provider);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  return handle(req, (await params).provider);
}
