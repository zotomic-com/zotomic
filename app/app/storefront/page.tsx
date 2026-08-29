import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { normalizeConfig } from "@/lib/storefront/config";
import { PageHeader } from "@/components/app/PageHeader";
import { StorefrontEditor } from "./StorefrontEditor";

export const dynamic = "force-dynamic";

export default async function StorefrontPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");

  const db = getAdminSupabase();
  const { data: row } = await db
    .from("storefront_config")
    .select("draft_json, published_at, subdomain")
    .eq("business_id", tenant.businessId)
    .single();

  const config = normalizeConfig(row?.draft_json, tenant.business.name);
  const published = !!row?.published_at;
  const root = process.env.STOREFRONT_ROOT_DOMAIN ?? "zotomic.com";
  const storeUrl = row?.subdomain ? `https://${row.subdomain}.${root}` : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Storefront"
        subtitle="One universal theme — configure it, preview it, publish it."
      />
      <StorefrontEditor initialConfig={config} published={published} storeUrl={storeUrl} />
    </div>
  );
}
