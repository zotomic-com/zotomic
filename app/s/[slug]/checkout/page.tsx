import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreBySlug } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { CheckoutClient } from "./CheckoutClient";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store || !store.published) notFound();
  const basePath = await storeBasePath(slug);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="mb-8 text-2xl font-extrabold tracking-tight">Checkout</h1>
      <CheckoutClient
        storeSlug={store.slug}
        basePath={basePath}
        currency={store.currency}
        shipping={store.config.commerce.shippingFlatRate}
        freeOver={store.config.commerce.freeShippingOver}
        codEnabled={store.config.commerce.codEnabled}
      />
    </div>
  );
}
