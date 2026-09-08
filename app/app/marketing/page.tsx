import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { getUsdToBdt } from "@/lib/fx";
import { getCampaignAttribution, type CampaignRow } from "@/lib/marketing";
import { PageHeader } from "@/components/app/PageHeader";
import { MarketingClient } from "./MarketingClient";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");
  const businessId = tenant.businessId;

  const db = getAdminSupabase();
  const [{ data: campaigns }, { data: products }, { data: links }, fx] = await Promise.all([
    db
      .from("campaigns")
      .select("id, name, status, budget_usd, spend_usd, starts_on, ends_on, fx_rate, fx_at, notes")
      .eq("business_id", businessId)
      .order("starts_on", { ascending: false }),
    db
      .from("products")
      .select("id, name")
      .eq("business_id", businessId)
      .neq("status", "archived")
      .order("name"),
    db.from("campaign_products").select("campaign_id, product_id").eq("business_id", businessId),
    getUsdToBdt(),
  ]);

  const linkMap = new Map<string, string[]>();
  for (const l of links ?? []) {
    const arr = linkMap.get(l.campaign_id as string) ?? [];
    arr.push(l.product_id as string);
    linkMap.set(l.campaign_id as string, arr);
  }

  const rows = await Promise.all(
    ((campaigns ?? []) as CampaignRow[]).map(async (c) => ({
      campaign: c,
      productIds: linkMap.get(c.id) ?? [],
      attribution: await getCampaignAttribution(businessId, c, fx.usdToBdt),
    })),
  );

  const currency = tenant.business.currency ?? "BDT";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Marketing"
        subtitle="Track ad campaigns and what they returned — per product, from real sales."
      />
      <MarketingClient
        rows={rows}
        products={(products ?? []).map((p) => ({ id: p.id as string, name: p.name as string }))}
        currency={currency}
        fx={fx}
      />
    </div>
  );
}
