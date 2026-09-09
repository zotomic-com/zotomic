import { notFound, redirect } from "next/navigation";
import { getStoreBySlug } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { getStoreAccount } from "@/lib/storefront/account";
import { AccountShell } from "../_components/AccountShell";

export const dynamic = "force-dynamic";

export default async function AccountDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const basePath = await storeBasePath(slug);

  const account = await getStoreAccount(store.businessId);
  if (!account) redirect(`${basePath}/account/login`);

  return (
    <AccountShell basePath={basePath} name={account.name}>
      {children}
    </AccountShell>
  );
}
