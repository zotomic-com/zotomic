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
  const [{ data }, { data: variants }] = await Promise.all([
    db
      .from("products")
      .select("id, name, category, status, price, buying_price, marketing_cost, stock_qty, image_urls, options, has_variants")
      .eq("business_id", tenant.businessId)
      .order("created_at", { ascending: true }),
    db
      .from("product_variants")
      .select("id, product_id, name, options, sku, price, sale_price, buying_price, stock_qty, active, position")
      .eq("business_id", tenant.businessId)
      .order("position"),
  ]);

  const variantsByProduct: Record<string, unknown[]> = {};
  for (const v of variants ?? []) {
    (variantsByProduct[v.product_id as string] ??= []).push(v);
  }

  const products = (data ?? []).map((p) => ({
    ...p,
    image_urls: Array.isArray(p.image_urls) ? p.image_urls : [],
    options: Array.isArray(p.options) ? p.options : [],
    variants: variantsByProduct[p.id as string] ?? [],
  })) as ProductRow[];

  return (
    <div className="space-y-5">
      <PageHeader title="Products" subtitle={`${products.length} product${products.length === 1 ? "" : "s"}`} />
      <ProductsClient products={products} currency={tenant.business.currency ?? "BDT"} />
    </div>
  );
}
