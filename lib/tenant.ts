import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, type AuthUser } from "./auth-server";
import { getAdminSupabase } from "./supabase";

/**
 * Tenant context. `businessId` is resolved server-side from the authenticated
 * session ONLY — never from a client- or model-supplied value. Every
 * business-scoped query and every Zotomic tool call must go through this.
 */
export interface TenantContext {
  user: AuthUser;
  businessId: string;
  /** the user's role within this business */
  role: "owner" | "staff";
}

export const TENANT_HEADER = "x-zotomic-business-id";

/**
 * Resolve the active business for the authenticated user.
 *
 * If the request carries an `x-zotomic-business-id` header (set by the app shell
 * for users who belong to more than one business) it is validated against the
 * user's memberships. Otherwise the user's default/first business is used.
 */
export async function resolveTenant(
  req: NextRequest,
): Promise<TenantContext | NextResponse> {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminSupabase();
  const { data: memberships, error } = await db
    .from("business_members")
    .select("business_id, role, is_default, created_at")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Could not resolve business" }, { status: 500 });
  }
  if (!memberships || memberships.length === 0) {
    return NextResponse.json(
      { error: "No business", code: "NO_BUSINESS" },
      { status: 409 },
    );
  }

  const requested = req.headers.get(TENANT_HEADER);
  const chosen = requested
    ? memberships.find((m) => m.business_id === requested)
    : memberships[0];

  if (!chosen) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return {
    user,
    businessId: chosen.business_id,
    role: chosen.role === "owner" ? "owner" : "staff",
  };
}

export function isTenantError(v: TenantContext | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}
