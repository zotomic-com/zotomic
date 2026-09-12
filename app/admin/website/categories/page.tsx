import { requireAdmin } from "@/lib/admin-server";
import { PageHeader } from "@/components/app/PageHeader";
import { getAllBusinessCategories } from "@/lib/business-categories";
import { CategoriesEditor } from "./CategoriesEditor";

export const dynamic = "force-dynamic";

export default async function AdminWebsiteCategoriesPage() {
  await requireAdmin();
  const categories = await getAllBusinessCategories();

  return (
    <div className="space-y-5">
      <PageHeader title="Store categories" subtitle="The business-type options a new owner picks from when registering a store." />
      <CategoriesEditor categories={categories} />
    </div>
  );
}
