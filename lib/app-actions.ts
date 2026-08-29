import { getTenant } from "./tenant-server";
import { getAdminSupabase } from "./supabase";

/**
 * Guard for server actions / server components that mutate tenant data.
 * Returns the business id + a service-role client, or throws.
 */
export async function requireBusiness() {
  const tenant = await getTenant();
  if (!tenant?.businessId) throw new Error("No active business");
  return { ...tenant, businessId: tenant.businessId, db: getAdminSupabase() };
}

export async function writeAudit(
  businessId: string,
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
