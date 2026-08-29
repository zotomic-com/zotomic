import { redirect } from "next/navigation";
import Link from "next/link";
import { Bell } from "lucide-react";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId) redirect("/onboarding");

  const db = getAdminSupabase();
  const { data } = await db
    .from("notifications")
    .select("id, type, title, body, href, read_at, created_at")
    .eq("business_id", tenant.businessId)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader title="Notifications" subtitle="Report deliveries, alerts, and system messages." />
      {rows.length === 0 ? (
        <EmptyState icon={Bell} title="You're all caught up" description="New notifications will show here." />
      ) : (
        <Card className="divide-y divide-border">
          {rows.map((n) => (
            <div key={n.id as string} className={`px-4 py-3 ${n.read_at ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-fg">{n.title as string}</p>
                <span className="text-xs text-fg-subtle">
                  {new Date(n.created_at as string).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
              {n.body && <p className="mt-0.5 text-sm text-fg-muted">{n.body as string}</p>}
              {n.href && (
                <Link href={n.href as string} className="mt-1 inline-block text-xs font-semibold text-primary">
                  Open →
                </Link>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
