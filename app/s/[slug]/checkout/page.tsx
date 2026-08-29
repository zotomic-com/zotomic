import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreBySlug, getStorePaymentOptions } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { getStoreAccount } from "@/lib/storefront/account";
import { getAdminSupabase } from "@/lib/supabase";
import { CheckoutClient } from "./CheckoutClient";
import { StorefrontEvent } from "@/components/storefront/StorefrontTracker";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store || !store.published) notFound();
  const basePath = await storeBasePath(slug);
  const paymentOptions = await getStorePaymentOptions(store.businessId);
  const account = await getStoreAccount(store.businessId);

  let prefill = account
    ? { name: account.name, phone: account.phone ?? "", email: account.email, address: "", city: "", note: "" }
    : null;
  if (account) {
    const { data: addr } = await getAdminSupabase()
      .from("store_account_addresses")
      .select("name, phone, address, city, area")
      .eq("account_id", account.id)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (addr && prefill) {
      prefill = {
        ...prefill,
        name: (addr.name as string) || prefill.name,
        phone: (addr.phone as string) || prefill.phone,
        address: (addr.address as string) ?? "",
        city: [addr.area, addr.city].filter(Boolean).join(", "),
      };
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <StorefrontEvent storeSlug={store.slug} type="begin_checkout" />
      <h1 className="mb-8 text-2xl font-extrabold tracking-tight">Checkout</h1>
      {!account && (
        <p className="mb-4 text-sm text-[var(--sf-muted)]">
          <a href={`${basePath}/account/login`} className="font-semibold underline">
            Sign in
          </a>{" "}
          for faster checkout, or continue as a guest below.
        </p>
      )}
      <CheckoutClient
        storeSlug={store.slug}
        basePath={basePath}
        currency={store.currency}
        shipping={store.config.commerce.shippingFlatRate}
        freeOver={store.config.commerce.freeShippingOver}
        paymentOptions={paymentOptions}
        prefill={prefill}
      />
    </div>
  );
}
