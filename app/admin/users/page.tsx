import { requireAdmin, adminDb } from "@/lib/admin-server";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireAdmin();
  const db = adminDb();

  const { data } = await db
    .from("users")
    .select("id, name, email, role, status, last_login, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []).map((u) => ({
    id: u.id as string,
    name: u.name as string,
    email: u.email as string,
    role: u.role as string,
    status: u.status as string,
    last: u.last_login ? new Date(u.last_login as string).toLocaleDateString("en-US") : "never",
  }));

  const cols: Column<(typeof rows)[number]>[] = [
    {
      key: "name",
      header: "User",
      render: (r) => (
        <div>
          <p className="font-medium text-fg">{r.name}</p>
          <p className="text-xs text-fg-subtle">{r.email}</p>
        </div>
      ),
    },
    { key: "role", header: "Role", render: (r) => <Badge tone={r.role === "admin" ? "primary" : "neutral"}>{r.role}</Badge> },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge tone={r.status === "active" ? "success" : "danger"}>{r.status}</Badge>,
    },
    { key: "last", header: "Last login", align: "right", render: (r) => r.last },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-fg">Users &amp; Roles</h1>
      </div>
      <Card>
        <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} empty={{ title: "No users" }} />
      </Card>
    </div>
  );
}
