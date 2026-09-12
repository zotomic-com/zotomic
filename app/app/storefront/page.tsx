import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { normalizeConfig } from "@/lib/storefront/config";
import { getPlanLimits } from "@/lib/plan-limits";
import { getStoreVideos, getVideoAccess } from "@/lib/storefront/videos";
import { youtubeChannelConfigured } from "@/lib/youtube";
import { listIntegrations, COURIER_PROVIDERS } from "@/lib/adapters/registry";
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
  const [planLimits, videos, videoAccess, integrations] = await Promise.all([
    getPlanLimits(tenant.businessId),
    getStoreVideos(tenant.businessId),
    getVideoAccess(tenant.businessId),
    listIntegrations(tenant.businessId),
  ]);
  const connectedCouriers = integrations
    .filter((i) => i.category === "courier" && i.status === "connected")
    .map((i) => COURIER_PROVIDERS[i.provider]?.name ?? i.provider);
  const published = !!row?.published_at;
  const root = process.env.STOREFRONT_ROOT_DOMAIN ?? "zotomic.com";
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const storeUrl = row?.subdomain && site ? `${site}/${row.subdomain}` : null;
  // The <slug>.zotomic.com form activates once a wildcard domain is added in Vercel.
  const subdomainUrl = row?.subdomain ? `https://${row.subdomain}.${root}` : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Storefront"
        subtitle="One universal theme — configure it, preview it, publish it."
      />
      <StorefrontEditor
        initialConfig={config}
        published={published}
        storeUrl={storeUrl}
        subdomainUrl={subdomainUrl}
        heroImageLimit={planLimits.heroImages}
        videos={videos}
        videoAccess={videoAccess}
        channelConnectAvailable={youtubeChannelConfigured()}
        connectedCouriers={connectedCouriers}
      />
    </div>
  );
}
