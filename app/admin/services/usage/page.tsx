import type { Metadata } from "next";
import { requireAdmin, adminDb } from "@/lib/admin-server";
import { PageHeader } from "@/components/app/PageHeader";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Service Usage — Admin" };

interface UsageRow {
  id: string;
  service: string;
  action: string;
  user_email: string | null;
  ip: string | null;
  ok: boolean;
  reason: string | null;
  created_at: string;
}

export default async function AdminServiceUsagePage() {
  await requireAdmin();
  const { data } = await adminDb()
    .from("service_usage")
    .select("id, service, action, user_email, ip, ok, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as UsageRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Usage"
        subtitle="Last 200 calls across Text to Audio & Online Downloader — successes, quota rejections and blocks."
      />
      <Card>
        <CardBody>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-fg-muted">No usage yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-subtle">
                    <th className="py-2 pr-3 font-semibold">When</th>
                    <th className="py-2 pr-3 font-semibold">Service</th>
                    <th className="py-2 pr-3 font-semibold">Action</th>
                    <th className="py-2 pr-3 font-semibold">User</th>
                    <th className="py-2 pr-3 font-semibold">Result</th>
                    <th className="py-2 pr-3 font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap py-2 pr-3 text-fg-muted">
                        {new Date(r.created_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3">
                        {r.service === "downloader" ? "Downloader" : "Text to Audio"}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-fg-muted">{r.action}</td>
                      <td className="whitespace-nowrap py-2 pr-3">{r.user_email ?? <span className="text-fg-subtle">anonymous</span>}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={r.ok ? "success" : "danger"}>{r.ok ? "ok" : "blocked"}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-xs text-fg-muted">{r.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
