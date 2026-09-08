"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";
import { getUsdToBdt } from "@/lib/fx";

interface CampaignInput {
  id?: string;
  name: string;
  budgetUsd: number;
  spendUsd: number | null;
  startsOn: string;
  endsOn: string;
  status: string;
  notes: string;
  productIds: string[];
}

export async function saveCampaign(input: CampaignInput): Promise<{ ok: true; id: string } | { error: string }> {
  const { businessId, user, db } = await requireBusiness();

  const name = input.name.trim().slice(0, 120);
  if (name.length < 2) return { error: "Give the campaign a name." };
  if (!input.startsOn || !input.endsOn) return { error: "Set a start and end date." };
  if (input.endsOn < input.startsOn) return { error: "End date must be after the start date." };
  const status = ["planned", "running", "ended"].includes(input.status) ? input.status : "planned";

  const fx = await getUsdToBdt();

  const row: Record<string, unknown> = {
    business_id: businessId,
    name,
    status,
    budget_usd: Math.max(0, Number(input.budgetUsd) || 0),
    spend_usd: input.spendUsd == null || input.spendUsd === ("" as unknown) ? null : Math.max(0, Number(input.spendUsd)),
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    notes: input.notes.trim().slice(0, 500) || null,
  };
  // capture the FX rate the first time (keeps historical reports reproducible)
  if (!input.id) {
    row.fx_rate = fx.usdToBdt;
    row.fx_at = fx.fetchedAt;
  }

  let campaignId = input.id;
  if (campaignId) {
    const { error } = await db.from("campaigns").update(row).eq("business_id", businessId).eq("id", campaignId);
    if (error) return { error: "Could not save the campaign." };
  } else {
    const { data, error } = await db.from("campaigns").insert(row).select("id").single();
    if (error || !data) return { error: "Could not create the campaign." };
    campaignId = data.id as string;
  }

  // rewrite product links
  await db.from("campaign_products").delete().eq("business_id", businessId).eq("campaign_id", campaignId);
  const ids = [...new Set(input.productIds)].slice(0, 100);
  if (ids.length) {
    await db.from("campaign_products").insert(
      ids.map((product_id) => ({ business_id: businessId, campaign_id: campaignId, product_id })),
    );
  }

  await writeAudit(businessId, user.id, input.id ? "campaign.updated" : "campaign.created", {
    summary: `${input.id ? "Updated" : "Created"} campaign "${name}" (${ids.length} product(s))`,
  });
  revalidatePath("/app/marketing");
  return { ok: true, id: campaignId! };
}

export async function deleteCampaign(id: string): Promise<{ ok: true } | { error: string }> {
  const { businessId, user, db } = await requireBusiness();
  const { data: c } = await db.from("campaigns").select("name").eq("business_id", businessId).eq("id", id).maybeSingle();
  if (!c) return { error: "Campaign not found." };
  await db.from("campaigns").delete().eq("business_id", businessId).eq("id", id);
  await writeAudit(businessId, user.id, "campaign.deleted", { summary: `Deleted campaign "${c.name}"` });
  revalidatePath("/app/marketing");
  return { ok: true };
}
