import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getStoreBySlug } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { getStoreAccount } from "@/lib/storefront/account";
import { listCustomerOrders } from "@/lib/storefront/customer-orders";
import { OrdersList } from "../../_components/OrdersList";

export const metadata: Metadata = { title: "Orders", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { slug } = await params;
  const { filter } = await searchParams;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const basePath = await storeBasePath(slug);
  const account = await getStoreAccount(store.businessId);
  if (!account) redirect(`${basePath}/account/login`);

  const orders = await listCustomerOrders(store.businessId, account);

  return <OrdersList basePath={basePath} orders={orders} initialFilter={filter ?? "all"} />;
}
