import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getStoreBySlug } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { getStoreAccount } from "@/lib/storefront/account";
import { getServerWishlist } from "@/lib/storefront/wishlist";
import { WishlistView } from "../../_components/WishlistView";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function WishlistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const basePath = await storeBasePath(slug);
  const account = await getStoreAccount(store.businessId);
  if (!account) redirect(`${basePath}/account/login`);

  const items = await getServerWishlist(account.id);

  return <WishlistView slug={slug} basePath={basePath} currency={store.currency} items={items} />;
}
