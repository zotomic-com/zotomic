import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { normalizeConfig } from "@/lib/storefront/config";
import { getStoreProducts } from "@/lib/storefront/store";
import { StoreShell } from "@/components/storefront/StoreShell";
import { SectionRenderer } from "@/components/storefront/Sections";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Storefront preview", robots: { index: false } };

/** Renders the DRAFT storefront config exactly as the public store would.
 *  Loaded in the editor's preview iframe. Owner-only, no app chrome. */
export default async function StorefrontPreviewPage() {
  const tenant = await getTenant();
  if (!tenant?.businessId || !tenant.business) redirect("/login");

  const db = getAdminSupabase();
  const { data: row } = await db
    .from("storefront_config")
    .select("draft_json")
    .eq("business_id", tenant.businessId)
    .single();

  const config = normalizeConfig(row?.draft_json, tenant.business.name);
  const products = await getStoreProducts(tenant.businessId);
  const ctx = { products, currency: tenant.business.currency ?? "BDT", basePath: "/storefront-preview" };

  return (
    <StoreShell config={config} basePath="/storefront-preview">
      {config.sections.map((s) => (
        <SectionRenderer key={s.id} section={s} ctx={ctx} />
      ))}
    </StoreShell>
  );
}
