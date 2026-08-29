import { redirect } from "next/navigation";
import { getSessionUser } from "./tenant-server";
import { getAdminSupabase } from "./supabase";

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
  return { id: user.id, name: user.name, email: user.email };
}

export function adminDb() {
  return getAdminSupabase();
}
