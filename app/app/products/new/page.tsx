import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { getPlanLimits } from "@/lib/plan-limits";
import { checkProductLimit } from "@/lib/plan-limits";
import { ProductEditor } from "../ProductEditor";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");

  const overCap = await checkProductLimit(tenant.businessId, 1);
  if (overCap) redirect("/app/products");

  const db = getAdminSupabase();
  const [limits, { data: cats }] = await Promise.all([
    getPlanLimits(tenant.businessId),
    db.from("product_categories").select("*").eq("business_id", tenant.businessId).order("sort"),
  ]);
  const categories = (cats ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    slug: c.slug as string,
    sort: c.sort as number,
    imageUrl: (c.image_url as string) ?? null,
    productCount: 0,
  }));

  return (
    <div className="space-y-5">
      <Link href="/app/products" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Products
      </Link>
      <h1 className="text-xl font-extrabold text-fg">New product</h1>
      <div className="max-w-2xl">
        <ProductEditor
          currency={tenant.business.currency ?? "BDT"}
          categories={categories}
          maxImages={limits.productImages}
          plan={limits.plan}
        />
      </div>
    </div>
  );
}
