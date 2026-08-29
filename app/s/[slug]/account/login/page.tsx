import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getStoreBySlug } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { getStoreAccount } from "@/lib/storefront/account";
import { AccountAuthClient } from "../AccountAuthClient";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function StoreLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const basePath = await storeBasePath(slug);
  if (await getStoreAccount(store.businessId)) redirect(`${basePath}/account`);

  return (
    <div className="mx-auto max-w-sm px-4 py-16 sm:px-6">
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight">Sign in</h1>
      <AccountAuthClient slug={slug} basePath={basePath} mode="login" />
    </div>
  );
}
