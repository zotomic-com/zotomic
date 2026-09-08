import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { getPlanLimits } from "@/lib/plan-limits";
import { PageHeader } from "@/components/app/PageHeader";
import { ProductsClient, type ProductRow } from "./ProductsClient";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");

  const db = getAdminSupabase();
  const [{ data }, { data: variants }, { data: cats }] = await Promise.all([
    db
      .from("products")
      .select("id, name, category, status, price, buying_price, marketing_cost, stock_qty, track_inventory, image_urls, options, has_variants, is_hot, hide_badges")
      .eq("business_id", tenant.businessId)
      .order("created_at", { ascending: true }),
    db
      .from("product_variants")
      .select("id, product_id, name, options, sku, price, sale_price, buying_price, stock_qty, active, position")
      .eq("business_id", tenant.businessId)
      .order("position"),
    db
      .from("product_categories")
      .select("*")
      .eq("business_id", tenant.businessId)
      .order("sort"),
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

  const planLimits = await getPlanLimits(tenant.businessId);
  const activeCount = products.filter((p) => p.status !== "archived").length;

  const catCounts = new Map<string, number>();
  for (const p of products) if (p.category) catCounts.set(p.category, (catCounts.get(p.category) ?? 0) + 1);
  const categories = (cats ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    slug: c.slug as string,
    sort: c.sort as number,
    imageUrl: (c.image_url as string) ?? null,
    productCount: catCounts.get(c.name as string) ?? 0,
  }));

  return (
    <div className="space-y-5">
      <PageHeader title="Products" subtitle={`${products.length} product${products.length === 1 ? "" : "s"}`} />
      <ProductsClient
        products={products}
        currency={tenant.business.currency ?? "BDT"}
        categories={categories}
        limits={{
          products: planLimits.products,
          productImages: planLimits.productImages,
          plan: planLimits.plan,
          grandfathered: planLimits.grandfathered,
          activeCount,
        }}
      />
    </div>
  );
}
