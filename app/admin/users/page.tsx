import { requireAdmin, adminDb } from "@/lib/admin-server";
import { UsersClient, type UserRow, type BlockedIp } from "./UsersClient";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireAdmin();
  const db = adminDb();

  const [{ data: users }, { data: members }, { data: ips }] = await Promise.all([
    db
      .from("users")
      .select("id, name, email, role, status, blocked, last_login, last_ip, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    db.from("business_members").select("user_id, businesses(name)"),
    db
      .from("blocked_ips")
      .select("id, ip, reason, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const bizByUser = new Map<string, string[]>();
  for (const m of members ?? []) {
    const name = ((Array.isArray(m.businesses) ? m.businesses[0] : m.businesses) as { name?: string } | null)?.name;
    if (!name) continue;
    const arr = bizByUser.get(m.user_id as string) ?? [];
    arr.push(name);
    bizByUser.set(m.user_id as string, arr);
  }

  const rows: UserRow[] = (users ?? []).map((u) => ({
    id: u.id as string,
    name: (u.name as string) ?? "—",
    email: u.email as string,
    role: u.role as string,
    state: u.blocked ? "blocked" : (u.status as string) === "suspended" ? "suspended" : "active",
    businesses: bizByUser.get(u.id as string) ?? [],
    lastLogin: u.last_login ? new Date(u.last_login as string).toLocaleDateString("en-US") : "never",
    lastIp: (u.last_ip as string) ?? "—",
    joined: new Date(u.created_at as string).toLocaleDateString("en-US"),
  }));

  const blockedIps: BlockedIp[] = (ips ?? []).map((r) => ({
    id: r.id as string,
    ip: r.ip as string,
    reason: (r.reason as string) ?? "",
    at: new Date(r.created_at as string).toLocaleDateString("en-US"),
  }));

  return <UsersClient rows={rows} blockedIps={blockedIps} />;
}
