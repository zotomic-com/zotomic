import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-server";
import { listServiceAccess } from "@/lib/services/tool-access";
import { PageHeader } from "@/components/app/PageHeader";
import AccessManager from "./AccessManager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Service Access — Admin" };

export default async function AdminServiceAccessPage() {
  await requireAdmin();
  const rows = await listServiceAccess();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Service Access"
        subtitle="Control who can use Text to Audio & Online Downloader. 'Follow plan' uses the subscription price tiers (free / business / pro); explicit grants can raise limits and blocks deny outright."
      />
      <AccessManager rows={rows} />
    </div>
  );
}
