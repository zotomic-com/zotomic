import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getStoreBySlug } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { getStoreAccount } from "@/lib/storefront/account";
import { getAdminSupabase } from "@/lib/supabase";
import { AddressBook, type Address } from "../../_components/AddressBook";

export const metadata: Metadata = { title: "Addresses", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AddressesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const basePath = await storeBasePath(slug);
  const account = await getStoreAccount(store.businessId);
  if (!account) redirect(`${basePath}/account/login`);

  const { data: addresses } = await getAdminSupabase()
    .from("store_account_addresses")
    .select("id, label, name, phone, address, city, area, is_default")
    .eq("account_id", account.id)
    .order("is_default", { ascending: false });

  return <AddressBook slug={slug} addresses={(addresses ?? []) as Address[]} />;
}
