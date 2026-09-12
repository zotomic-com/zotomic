import { requireAdmin } from "@/lib/admin-server";
import { PageHeader } from "@/components/app/PageHeader";
import { getAllStructuralPages, getAllCustomPages } from "@/lib/site-content";
import { PagesList } from "./PagesList";

export const dynamic = "force-dynamic";

export default async function AdminWebsitePagesPage() {
  await requireAdmin();
  const [structural, custom] = await Promise.all([getAllStructuralPages(), getAllCustomPages()]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pages"
        subtitle="The fixed pages keep their design — edit their copy. Custom pages are freeform: add one, write it, publish when ready."
      />
      <PagesList structural={structural} custom={custom} />
    </div>
  );
}
