import { cookies } from "next/headers";
import { verifyToken } from "./jwt";
import { getAdminSupabase } from "./supabase";
import { deriveBilling, type BillingState } from "./billing";

export interface ServerBusiness {
  id: string;
  name: string;
  slug: string | null;
  type: string | null;
  currency: string;
  timezone: string;
}

export interface ServerTenant {
  user: { id: string; name: string; email: string; role: string };
  business: ServerBusiness | null;
  businessId: string | null;
  memberRole: "owner" | "staff" | null;
  billing: BillingState;
}

export async function getSessionUser() {
  const token = (await cookies()).get("auth_token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Tenant context for server components under /app. Resolves the active business
 * from the session only. Returns null when not signed in.
 */
export async function getTenant(): Promise<ServerTenant | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const db = getAdminSupabase();
  const { data } = await db
    .from("business_members")
    .select("business_id, role, businesses(id, name, slug, type, currency, timezone)")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return { user, business: null, businessId: null, memberRole: null, billing: deriveBilling(null) };
  }

  const b = (Array.isArray(data.businesses) ? data.businesses[0] : data.businesses) as
    | ServerBusiness
    | undefined;

  const { data: sub } = await db
    .from("subscriptions")
    .select("plan, status, current_period_end, price, currency")
    .eq("business_id", data.business_id)
    .maybeSingle();

  return {
    user,
    business: b ?? null,
    businessId: data.business_id,
    memberRole: data.role === "owner" ? "owner" : "staff",
    billing: deriveBilling(sub),
  };
}
