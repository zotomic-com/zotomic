import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { UserActions } from "./UserActions";

export const dynamic = "force-dynamic";

const dt = (s: string | null) => (s ? new Date(s).toLocaleString("en-US") : "—");

const OUTCOME_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  success: "success",
  bad_password: "warning",
  suspended: "danger",
  blocked: "danger",
  ip_blocked: "danger",
  not_found: "neutral",
};

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const db = adminDb();

  const { data: u } = await db
    .from("users")
    .select("id, name, email, role, status, blocked, blocked_reason, notes, last_login, last_ip, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!u) notFound();

  const [{ data: members }, { data: events }, { data: activity }] = await Promise.all([
    db.from("business_members").select("business_id, role, is_default, businesses(name)").eq("user_id", id),
    db
      .from("user_login_events")
      .select("outcome, ip, user_agent, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(40),
    db
      .from("audit_logs")
      .select("action, summary, created_at, actor_type")
      .eq("target_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const state = u.blocked ? "blocked" : (u.status as string) === "suspended" ? "suspended" : "active";
  const stores = (members ?? []).map((m) => ({
    id: m.business_id as string,
    name: ((Array.isArray(m.businesses) ? m.businesses[0] : m.businesses) as { name?: string } | null)?.name ?? "—",
    role: m.role as string,
  }));

  const eventRows = (events ?? []).map((e, i) => ({
    id: `${e.created_at}-${i}`,
    outcome: e.outcome as string,
    ip: (e.ip as string) ?? "—",
    ua: (e.user_agent as string) ?? "",
    at: new Date(e.created_at as string).toLocaleString("en-US"),
  }));

  const eventCols: Column<(typeof eventRows)[number]>[] = [
    { key: "at", header: "When", render: (r) => <span className="text-xs">{r.at}</span> },
    { key: "outcome", header: "Result", render: (r) => <Badge tone={OUTCOME_TONE[r.outcome] ?? "neutral"}>{r.outcome}</Badge> },
    { key: "ip", header: "IP", render: (r) => <span className="font-mono text-xs">{r.ip}</span> },
    { key: "ua", header: "Device", render: (r) => <span className="text-xs text-fg-subtle">{r.ua.slice(0, 60)}</span> },
  ];

  return (
    <div className="space-y-5">
      <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Users
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-extrabold text-fg">
            {u.name as string}
            <Badge tone={u.role === "admin" ? "primary" : "neutral"}>{u.role as string}</Badge>
            <Badge tone={state === "active" ? "success" : state === "suspended" ? "warning" : "danger"}>{state}</Badge>
          </h1>
          <p className="mt-1 text-sm text-fg-muted">{u.email as string}</p>
        </div>
        <UserActions
          user={{
            id: u.id as string,
            name: u.name as string,
            email: u.email as string,
            role: u.role as string,
            status: u.status as string,
            blocked: !!u.blocked,
            lastIp: (u.last_ip as string) ?? null,
          }}
          isSelf={u.id === admin.id}
        />
      </div>

      {u.blocked && u.blocked_reason && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          Blocked: {u.blocked_reason as string}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <dl className="divide-y divide-border px-4 text-sm">
            {[
              ["Role", u.role as string],
              ["Joined", dt(u.created_at as string)],
              ["Last login", dt(u.last_login as string)],
              ["Last IP", (u.last_ip as string) ?? "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 py-2.5">
                <dt className="text-fg-subtle">{k}</dt>
                <dd className="text-right font-medium text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Stores ({stores.length})</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-border px-4 text-sm">
              {stores.length === 0 && <li className="py-3 text-fg-subtle">Not a member of any store.</li>}
              {stores.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2.5">
                  <Link href={`/admin/tenants/${s.id}`} className="font-medium text-primary hover:underline">
                    {s.name}
                  </Link>
                  <Badge tone="neutral">{s.role}</Badge>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Login history</CardTitle>
            </CardHeader>
            <DataTable columns={eventCols} rows={eventRows} rowKey={(r) => r.id} empty={{ title: "No login events" }} />
          </Card>

          {(activity ?? []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Admin activity on this account</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-border px-4 text-sm">
                {(activity ?? []).map((a, i) => (
                  <li key={i} className="flex justify-between gap-3 py-2.5">
                    <span className="text-fg-muted">{a.summary as string}</span>
                    <span className="shrink-0 text-xs text-fg-subtle">
                      {new Date(a.created_at as string).toLocaleDateString("en-US")}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
