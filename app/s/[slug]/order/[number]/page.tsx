import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { getAdminSupabase } from "@/lib/supabase";
import { getStoreBySlug } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { money } from "@/lib/money";
import { ClearCartOnMount } from "@/components/storefront/ClearCartOnMount";
import { TrackEvent } from "@/components/tracking/TrackEvent";

export const metadata: Metadata = { title: "Order confirmed", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ slug: string; number: string }>;
}) {
  const { slug, number } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const basePath = await storeBasePath(slug);

  const db = getAdminSupabase();
  const { data: order } = await db
    .from("orders")
    .select("order_number, total, subtotal, shipping, currency, status, placed_at, address, order_items(name, qty, unit_price)")
    .eq("business_id", store.businessId)
    .eq("order_number", number)
    .maybeSingle();

  if (!order) notFound();
  const items = (order.order_items ?? []) as { name: string; qty: number; unit_price: number }[];

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
      <ClearCartOnMount storeSlug={store.slug} />
      <TrackEvent
        event="Purchase"
        params={{ value: Number(order.total), currency: order.currency as string, transaction_id: order.order_number }}
      />
      <CheckCircle2 className="mx-auto h-10 w-10 text-[var(--sf-accent)]" />
      <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Order confirmed</h1>
      <p className="mt-1 text-sm text-[var(--sf-muted)]">
        Order <span className="font-semibold text-[var(--sf-fg)]">{order.order_number}</span> — we&apos;ll
        contact you to confirm delivery.
      </p>

      <div className="mt-8 rounded-[var(--sf-radius)] border border-[var(--sf-line)] p-5 text-left text-sm">
        <ul className="space-y-2">
          {items.map((i, idx) => (
            <li key={idx} className="flex justify-between">
              <span className="text-[var(--sf-muted)]">{i.name} × {i.qty}</span>
              <span>{money(i.unit_price * i.qty, order.currency as string)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-[var(--sf-line)] pt-3">
          <div className="flex justify-between"><span className="text-[var(--sf-muted)]">Shipping</span><span>{money(Number(order.shipping), order.currency as string)}</span></div>
          <div className="flex justify-between font-bold"><span>Total</span><span>{money(Number(order.total), order.currency as string)}</span></div>
          <p className="pt-1 text-xs text-[var(--sf-muted)]">Payment: cash on delivery</p>
        </div>
      </div>

      <Link
        href={basePath || "/"}
        className="mt-8 inline-block rounded-[var(--sf-radius)] bg-[var(--sf-accent)] px-5 py-2.5 text-sm font-semibold text-white"
      >
        Continue shopping
      </Link>
    </div>
  );
}
