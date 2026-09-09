import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getStoreBySlug } from "@/lib/storefront/store";
import { storeBasePath } from "@/lib/storefront/base-path";
import { getStoreAccount } from "@/lib/storefront/account";
import { getAdminSupabase } from "@/lib/supabase";
import { resolvePrefs, CUSTOMER_EVENTS, type Prefs } from "@/lib/notify-events";
import { ProfilePanel } from "../../_components/ProfilePanel";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const basePath = await storeBasePath(slug);
  const account = await getStoreAccount(store.businessId);
  if (!account) redirect(`${basePath}/account/login`);

  const { data: row } = await getAdminSupabase()
    .from("store_accounts")
    .select("notification_prefs")
    .eq("id", account.id)
    .maybeSingle();
  const prefs: Prefs = resolvePrefs(CUSTOMER_EVENTS, row?.notification_prefs);

  return (
    <ProfilePanel
      slug={slug}
      basePath={basePath}
      profile={{ name: account.name, email: account.email, phone: account.phone ?? "" }}
      prefs={prefs}
    />
  );
}
