import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionUser } from "./tenant-server";
import { getAdminSupabase } from "./supabase";
import { isIpBlocked } from "./admin/security";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
}

/** Guard for /admin server components + admin server actions. Redirects non-admins. */
export async function requireAdmin(): Promise<AdminUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/app");
  // re-check against the DB so a suspended/blocked/deleted admin can't keep acting
  const { data } = await getAdminSupabase()
    .from("users")
    .select("status, blocked, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!data || data.role !== "admin" || data.status === "suspended" || data.blocked) redirect("/login");

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (ip && (await isIpBlocked(ip))) redirect("/login");

  return { id: user.id, name: user.name, email: user.email };
}

export function adminDb() {
  return getAdminSupabase();
}
