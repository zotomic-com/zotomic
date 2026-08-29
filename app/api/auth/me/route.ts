import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-server";
import { getAdminSupabase } from "@/lib/supabase";
import { deriveBilling } from "@/lib/billing";

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminSupabase();

  const { data: user } = await db
    .from("users")
    .select("id, name, email, role, status, created_at, last_login")
    .eq("id", authUser.id)
    .single();

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Businesses this user belongs to (for the app shell's switcher).
  const { data: memberships } = await db
    .from("business_members")
    .select("role, is_default, businesses(id, name, type, slug, currency)")
    .eq("user_id", authUser.id)
    .order("is_default", { ascending: false });

  const businesses = (memberships ?? []).map((m) => {
    const b = (Array.isArray(m.businesses) ? m.businesses[0] : m.businesses) ?? {};
    return { ...(b as Record<string, unknown>), membershipRole: m.role, isDefault: m.is_default };
  });

  let billing = deriveBilling(null);
  let unreadNotifications = 0;
  const primary = businesses[0] as { id?: string } | undefined;
  if (primary?.id) {
    const [{ data: sub }, { count }] = await Promise.all([
      db
        .from("subscriptions")
        .select("plan, status, current_period_end, price, currency")
        .eq("business_id", primary.id)
        .maybeSingle(),
      db
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("business_id", primary.id)
        .is("read_at", null),
    ]);
    billing = deriveBilling(sub);
    unreadNotifications = count ?? 0;
  }

  return NextResponse.json({ user, businesses, billing, unreadNotifications });
}
