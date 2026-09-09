import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getStoreBySlug } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { getStoreAccount } from "@/lib/storefront/account";
import { ForgotForm } from "../_components/AuthExtras";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ForgotPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const basePath = await storeBasePath(slug);
  if (await getStoreAccount(store.businessId)) redirect(`${basePath}/account`);

  return (
    <div className="mx-auto max-w-sm px-4 py-16 sm:px-6">
      <h1 className="mb-2 text-2xl font-extrabold tracking-tight">Forgot your password?</h1>
      <p className="mb-6 text-sm text-[var(--sf-muted)]">
        Enter your email and we&apos;ll send you a link to choose a new one.
      </p>
      <ForgotForm slug={slug} basePath={basePath} />
    </div>
  );
}
