import { getTenant } from "./tenant-server";
import { getAdminSupabase } from "./supabase";

/**
 * Guard for server actions / server components that mutate tenant data.
 * Returns the business id + a service-role client, or throws.
 * Pass { allowReadOnly: true } for billing/support actions that must work while
 * the account is soft/hard locked.
 */
export async function requireBusiness(opts: { allowReadOnly?: boolean } = {}) {
  const tenant = await getTenant();
  if (!tenant?.businessId) throw new Error("No active business");
  if (!opts.allowReadOnly && tenant.billing.readOnly) {
    throw new Error(
      tenant.billing.hardLocked
        ? "Your account is locked. Reactivate on the Billing page."
        : "Your account is read-only until payment is confirmed.",
    );
  }
  return { ...tenant, businessId: tenant.businessId, db: getAdminSupabase() };
}

/**
 * Guard for server actions / server components that only need a signed-in
 * user, not a business — e.g. the storeless domain-buying dashboard. Unlike
 * requireBusiness(), this never throws on a missing business.
 */
export async function requireUser() {
  const tenant = await getTenant();
  if (!tenant?.user) throw new Error("Not authenticated");
  return { user: tenant.user, businessId: tenant.businessId, db: getAdminSupabase() };
}

export async function writeAudit(
  businessId: string | null,
  actorId: string,
  action: string,
  opts: { targetType?: string; targetId?: string; summary?: string; before?: unknown; after?: unknown } = {},
) {
  const db = getAdminSupabase();
  await db.from("audit_logs").insert({
    business_id: businessId,
    actor_id: actorId,
    action,
    target_type: opts.targetType ?? null,
    target_id: opts.targetId ?? null,
    summary: opts.summary ?? null,
    before: opts.before ?? null,
    after: opts.after ?? null,
  });
}
