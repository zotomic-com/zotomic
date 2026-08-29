"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";
import { normalizeConfig, type StorefrontConfig } from "@/lib/storefront/config";

export async function saveDraft(config: StorefrontConfig) {
  const { businessId, db } = await requireBusiness();
  const { data: biz } = await db.from("businesses").select("name").eq("id", businessId).single();
  const clean = normalizeConfig(config, biz?.name ?? "Store");

  const { error } = await db
    .from("storefront_config")
    .update({ draft_json: clean })
    .eq("business_id", businessId);
  if (error) return { error: "Could not save" };

  revalidatePath("/app/storefront/preview");
  return { ok: true };
}

export async function publishStorefront() {
  const { businessId, user, db } = await requireBusiness();

  const { data: row } = await db
    .from("storefront_config")
    .select("draft_json, subdomain, published_version")
    .eq("business_id", businessId)
    .single();
  if (!row) return { error: "No storefront config" };

  const { data: biz } = await db
    .from("businesses")
    .select("name, slug, currency")
    .eq("id", businessId)
    .single();

  const clean = normalizeConfig(row.draft_json, biz?.name ?? "Store");
  let subdomain = row.subdomain as string | null;
  if (!subdomain) subdomain = (biz?.slug as string) ?? `store-${businessId.slice(0, 6)}`;

  const { error } = await db
    .from("storefront_config")
    .update({
      published_json: clean,
      published_version: (row.published_version as number) + 1,
      published_at: new Date().toISOString(),
      subdomain,
    })
    .eq("business_id", businessId);
  if (error) return { error: "Could not publish" };

  await writeAudit(businessId, user.id, "storefront.published", {
    targetType: "storefront",
    targetId: businessId,
    summary: `Published storefront v${(row.published_version as number) + 1}`,
  });

  revalidateTag(`site:${businessId}`);
  revalidatePath(`/s/${subdomain}`, "layout");
  return { ok: true, subdomain };
}

export async function unpublishStorefront() {
  const { businessId, user, db } = await requireBusiness();
  const { error } = await db
    .from("storefront_config")
    .update({ published_at: null })
    .eq("business_id", businessId);
  if (error) return { error: "Could not unpublish" };
  await writeAudit(businessId, user.id, "storefront.unpublished", { targetType: "storefront", targetId: businessId });
  const { data: row } = await db.from("storefront_config").select("subdomain").eq("business_id", businessId).single();
  if (row?.subdomain) revalidatePath(`/s/${row.subdomain}`, "layout");
  return { ok: true };
}
