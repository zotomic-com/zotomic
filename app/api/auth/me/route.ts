import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-server";
import { getAdminSupabase } from "@/lib/supabase";

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

  return NextResponse.json({ user, businesses });
}
