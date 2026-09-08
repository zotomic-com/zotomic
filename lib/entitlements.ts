import { getAdminSupabase } from "@/lib/supabase";

/**
 * Effective feature access for a business = plan gating OR an admin override
 * on `businesses.feature_overrides`.
 *
 *  payment_gateway  — paid plans only (business/pro), or admin-granted
 *  courier          — all plans
 *  server_tracking  — paid plans only, or admin-granted
 *  custom_domain    — paid plans only, or admin-granted
 */
export type Feature =
  | "payment_gateway"
  | "courier"
  | "server_tracking"
  | "custom_domain"
  | "branded_invoice"
  | "weekly_report";

const PAID_ONLY: Feature[] = ["payment_gateway", "server_tracking", "custom_domain", "branded_invoice"];

export interface Entitlements {
  plan: string;
  payment_gateway: boolean;
  courier: boolean;
  server_tracking: boolean;
  custom_domain: boolean;
  /** paid plans: put the store's own logo on customer invoices and drop "Powered by Zotomic" */
  branded_invoice: boolean;
  /**
   * Weekly Intelligence report generation. Granted to everyone today; the flag
   * exists so an admin can later make it a paid add-on (set
   * `feature_overrides.weekly_report = false` to revoke for a tenant).
   */
  weekly_report: boolean;
}

export function deriveEntitlements(
  plan: string,
  overrides: Record<string, unknown> = {},
): Entitlements {
  const paid = plan === "business" || plan === "pro";
  const has = (f: Feature) => {
    if (overrides[f] === true) return true;
    if (overrides[f] === false) return false;
    return PAID_ONLY.includes(f) ? paid : true;
  };
  return {
    plan,
    payment_gateway: has("payment_gateway"),
    courier: has("courier"),
    server_tracking: has("server_tracking"),
    custom_domain: has("custom_domain"),
    branded_invoice: has("branded_invoice"),
    weekly_report: has("weekly_report"),
  };
}

export async function getEntitlements(businessId: string): Promise<Entitlements> {
  const db = getAdminSupabase();
  const [{ data: sub }, { data: biz }] = await Promise.all([
    db.from("subscriptions").select("plan").eq("business_id", businessId).maybeSingle(),
    db.from("businesses").select("feature_overrides").eq("id", businessId).maybeSingle(),
  ]);
  return deriveEntitlements(
    sub?.plan ?? "free",
    (biz?.feature_overrides as Record<string, unknown>) ?? {},
  );
}
