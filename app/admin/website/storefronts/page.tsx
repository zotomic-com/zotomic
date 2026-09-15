import { requireAdmin } from "@/lib/admin-server";
import { PageHeader } from "@/components/app/PageHeader";
import { getPublishedStorefronts } from "@/lib/storefront/directory";
import { StorefrontsEditor } from "./StorefrontsEditor";

export const dynamic = "force-dynamic";

export default async function AdminWebsiteStorefrontsPage() {
  await requireAdmin();
  const stores = await getPublishedStorefronts();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Storefronts"
        subtitle="Every published store shown in the homepage carousel. Hot and New are computed automatically from real activity — Featured is yours to set."
      />
      <StorefrontsEditor stores={stores} />
    </div>
  );
}
