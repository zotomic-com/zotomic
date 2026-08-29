import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { PageHeader } from "@/components/app/PageHeader";
import { TasksClient, type Task } from "./TasksClient";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId) redirect("/onboarding");

  const db = getAdminSupabase();
  const { data } = await db
    .from("tasks")
    .select("id, title, priority, status, source")
    .eq("business_id", tenant.businessId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-5">
      <PageHeader title="Tasks" subtitle="Your list — plus anything the assistant or a report suggests." />
      <TasksClient tasks={(data ?? []) as Task[]} />
    </div>
  );
}
