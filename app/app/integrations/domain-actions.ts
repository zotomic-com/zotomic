"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";
import { getEntitlements } from "@/lib/entitlements";
import { normalizeDomain } from "@/lib/storefront/domain";
import { addProjectDomain, getDomainState, removeProjectDomain } from "@/lib/vercel-domains";

type Res = { error: string } | { ok: true };

export async function connectCustomDomain(input: string): Promise<Res> {
  const { businessId, user, db } = await requireBusiness();

  const ent = await getEntitlements(businessId);
  if (!ent.custom_domain) {
    return { error: "Custom domains are available on the Business plan. Upgrade to connect one." };
  }

  const domain = normalizeDomain(input);
  if (!domain) return { error: "Enter a valid domain, e.g. shop.yourbrand.com" };

  // not already claimed by another store
  const { data: taken } = await db
    .from("storefront_config")
    .select("business_id")
    .ilike("custom_domain", domain)
    .neq("business_id", businessId)
    .maybeSingle();
  if (taken) return { error: "That domain is already connected to another store." };

  const vercel = await addProjectDomain(domain);
  if (!vercel.ok) return { error: vercel.error ?? "Could not register the domain." };

  const { error } = await db
    .from("storefront_config")
    .update({
      custom_domain: domain,
      custom_domain_status: "pending",
      custom_domain_added_at: new Date().toISOString(),
    })
    .eq("business_id", businessId);
  if (error) return { error: "Could not save the domain." };

  await writeAudit(businessId, user.id, "storefront.domain_connected", {
    targetType: "storefront",
    summary: domain,
  });
  revalidatePath("/app/integrations");
  return { ok: true };
}

export async function checkCustomDomain(): Promise<{ error: string } | { ok: true; active: boolean; misconfigured: boolean }> {
  const { businessId, db } = await requireBusiness();
  const { data: cfg } = await db
    .from("storefront_config")
    .select("custom_domain, custom_domain_status")
    .eq("business_id", businessId)
    .maybeSingle();
  if (!cfg?.custom_domain) return { error: "No custom domain set." };

  const state = await getDomainState(cfg.custom_domain as string);
  const active = state.configured;
  if (active && cfg.custom_domain_status !== "active") {
    await db.from("storefront_config").update({ custom_domain_status: "active" }).eq("business_id", businessId);
  } else if (!active && cfg.custom_domain_status === "active") {
    await db.from("storefront_config").update({ custom_domain_status: "pending" }).eq("business_id", businessId);
  }
  revalidatePath("/app/integrations");
  return { ok: true, active, misconfigured: state.misconfigured };
}

export async function removeCustomDomain(): Promise<Res> {
  const { businessId, user, db } = await requireBusiness();
  const { data: cfg } = await db
    .from("storefront_config")
    .select("custom_domain")
    .eq("business_id", businessId)
    .maybeSingle();
  if (cfg?.custom_domain) await removeProjectDomain(cfg.custom_domain as string);

  await db
    .from("storefront_config")
    .update({ custom_domain: null, custom_domain_status: "none", custom_domain_added_at: null })
    .eq("business_id", businessId);

  await writeAudit(businessId, user.id, "storefront.domain_removed", { targetType: "storefront" });
  revalidatePath("/app/integrations");
  return { ok: true };
}
