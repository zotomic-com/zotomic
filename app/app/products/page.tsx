import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { PageHeader } from "@/components/app/PageHeader";
import { ProductsClient, type ProductRow } from "./ProductsClient";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");

  const db = getAdminSupabase();
  const { data } = await db
    .from("products")
    .select("id, name, category, status, price, buying_price, marketing_cost, stock_qty, image_urls")
    .eq("business_id", tenant.businessId)
    .order("created_at", { ascending: true });

  const products = (data ?? []).map((p) => ({
    ...p,
    image_urls: Array.isArray(p.image_urls) ? p.image_urls : [],
  })) as ProductRow[];

  return (
    <div className="space-y-5">
      <PageHeader title="Products" subtitle={`${products.length} product${products.length === 1 ? "" : "s"}`} />
      <ProductsClient products={products} currency={tenant.business.currency ?? "BDT"} />
    </div>
  );
}
