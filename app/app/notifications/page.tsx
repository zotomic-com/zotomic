import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { PageHeader } from "@/components/app/PageHeader";
import { NotificationsClient, type NotifRow } from "./NotificationsClient";

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
    .limit(100);

  const rows: NotifRow[] = (data ?? []).map((n) => ({
    id: n.id as string,
    title: n.title as string,
    body: (n.body as string) ?? null,
    href: (n.href as string) ?? null,
    read: !!n.read_at,
    createdAt: n.created_at as string,
  }));

  return (
    <div className="space-y-5">
      <PageHeader title="Notifications" subtitle="Report deliveries, alerts, and system messages." />
      <NotificationsClient notifications={rows} />
    </div>
  );
}
