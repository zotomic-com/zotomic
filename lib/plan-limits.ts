/**
 * Plan-limit resolution and enforcement (Phase 9B).
 *
 *  - product count      free 10 · paid 100
 *  - images per product  free 3 · paid 5
 *  - hero banner images  free 1 · paid 3
 *
 * Grandfathering: stores that existed before the limits tightened carry
 * `businesses.limits_grandfathered_at`. Their existing data is never hidden or
 * archived — the cap only blocks *adding* past it. A grandfathered store that is
 * already over the product cap simply can't add more until it upgrades or prunes.
 */
import { getAdminSupabase } from "@/lib/supabase";
import { PLANS, type PlanId } from "@/lib/plans";

export interface PlanLimits {
  plan: PlanId;
  grandfathered: boolean;
  products: number;
  productImages: number;
  heroImages: number;
}

function limitsForPlan(plan: PlanId) {
  const p = PLANS.find((x) => x.id === plan) ?? PLANS[0];
  return { products: p.limits.products, productImages: p.limits.productImages, heroImages: p.limits.heroImages };
}

export async function getPlanLimits(businessId: string): Promise<PlanLimits> {
  const db = getAdminSupabase();
  const [{ data: sub }, { data: biz }] = await Promise.all([
    db.from("subscriptions").select("plan").eq("business_id", businessId).maybeSingle(),
    db.from("businesses").select("limits_grandfathered_at").eq("id", businessId).maybeSingle(),
  ]);
  const plan = (sub?.plan ?? "free") as PlanId;
  return {
    plan,
    grandfathered: !!biz?.limits_grandfathered_at,
    ...limitsForPlan(plan),
  };
}

export interface LimitError {
  error: string;
  code: "product_limit" | "image_limit" | "hero_limit";
}

/**
 * Check whether `adding` new products is allowed given the current count.
 * Returns null when OK, or a { error, code } to hand straight back to the UI.
 */
export async function checkProductLimit(
  businessId: string,
  adding = 1,
): Promise<LimitError | null> {
  const db = getAdminSupabase();
  const limits = await getPlanLimits(businessId);
  const { count } = await db
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .neq("status", "archived");

  const current = count ?? 0;
  if (current + adding <= limits.products) return null;

  const remaining = Math.max(0, limits.products - current);
  const planName = limits.plan === "free" ? "Free" : limits.plan === "business" ? "Business" : "Pro";
  return {
    code: "product_limit",
    error:
      remaining > 0
        ? `Your ${planName} plan allows ${limits.products} products — you can add ${remaining} more. Upgrade for a higher limit.`
        : `You've reached your ${planName} plan's limit of ${limits.products} products. Upgrade or archive a product to add another.`,
  };
}

/** How many more products this store may add right now (0 = at/over cap). */
export async function remainingProductBudget(businessId: string): Promise<number> {
  const db = getAdminSupabase();
  const limits = await getPlanLimits(businessId);
  const { count } = await db
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .neq("status", "archived");
  return Math.max(0, limits.products - (count ?? 0));
}

/** Clamp an image URL list to the plan's per-product cap. */
export function clampProductImages(urls: string[], limit: number): string[] {
  return urls.slice(0, Math.max(0, limit));
}
