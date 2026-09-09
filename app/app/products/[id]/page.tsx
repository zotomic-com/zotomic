import { notFound, redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant-server";
import { getAdminSupabase } from "@/lib/supabase";
import { getPlanLimits } from "@/lib/plan-limits";
import { money } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailShell, FactList } from "@/components/app/DetailShell";
import { Timeline, type TimelineEvent } from "@/components/app/Timeline";
import { ProductEditor, type EditorProduct } from "../ProductEditor";
import { DeleteProductButton } from "./DeleteProductButton";

export const dynamic = "force-dynamic";

const TONE = { active: "success", draft: "neutral", archived: "warning" } as const;
const d = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.businessId || !tenant.business) redirect("/onboarding");
  const currency = tenant.business.currency ?? "BDT";
  const db = getAdminSupabase();

  const { data: prod } = await db
    .from("products")
    .select(
      "id, name, slug, description, sku, category, status, price, sale_price, buying_price, marketing_cost, stock_qty, track_inventory, image_urls, options, has_variants, is_hot, hide_badges, created_at",
    )
    .eq("business_id", tenant.businessId)
    .eq("id", id)
    .maybeSingle();
  if (!prod) notFound();

  const [
    limits,
    { data: cats },
    { data: variants },
    { data: soldItems },
    { data: reviews },
    { data: sf },
    { data: audit },
  ] = await Promise.all([
    getPlanLimits(tenant.businessId),
    db.from("product_categories").select("*").eq("business_id", tenant.businessId).order("sort"),
    db
      .from("product_variants")
      .select("id, name, options, sku, price, sale_price, buying_price, stock_qty, active, position")
      .eq("business_id", tenant.businessId)
      .eq("product_id", id)
      .order("position"),
    db.from("order_items").select("qty, line_total, order_id").eq("business_id", tenant.businessId).eq("product_id", id),
    db.from("product_reviews").select("rating").eq("business_id", tenant.businessId).eq("product_id", id).eq("status", "approved"),
    db.from("storefront_config").select("subdomain").eq("business_id", tenant.businessId).maybeSingle(),
    db
      .from("audit_logs")
      .select("id, action, summary, created_at")
      .eq("business_id", tenant.businessId)
      .eq("target_id", id)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const categories = (cats ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    slug: c.slug as string,
    sort: c.sort as number,
    imageUrl: (c.image_url as string) ?? null,
    productCount: 0,
  }));

  const editorProduct: EditorProduct = {
    id: prod.id as string,
    name: prod.name as string,
    description: (prod.description as string) ?? null,
    sku: (prod.sku as string) ?? null,
    category: (prod.category as string) ?? null,
    status: prod.status as string,
    price: Number(prod.price),
    sale_price: prod.sale_price == null ? null : Number(prod.sale_price),
    buying_price: prod.buying_price == null ? null : Number(prod.buying_price),
    marketing_cost: Number(prod.marketing_cost),
    stock_qty: Number(prod.stock_qty),
    track_inventory: !!prod.track_inventory,
    image_urls: Array.isArray(prod.image_urls) ? (prod.image_urls as string[]) : [],
    options: Array.isArray(prod.options) ? (prod.options as { name: string; values: string[] }[]) : [],
    has_variants: !!prod.has_variants,
    is_hot: !!prod.is_hot,
    hide_badges: !!prod.hide_badges,
    variants: (variants ?? []).map((v) => ({
      id: v.id as string,
      name: v.name as string,
      options: (v.options as Record<string, string>) ?? {},
      sku: (v.sku as string) ?? null,
      price: v.price == null ? null : Number(v.price),
      sale_price: v.sale_price == null ? null : Number(v.sale_price),
      buying_price: v.buying_price == null ? null : Number(v.buying_price),
      stock_qty: Number(v.stock_qty),
      active: !!v.active,
    })),
  };

  const units = (soldItems ?? []).reduce((s, r) => s + Number(r.qty), 0);
  const revenue = (soldItems ?? []).reduce((s, r) => s + Number(r.line_total), 0);
  const orderCount = new Set((soldItems ?? []).map((r) => r.order_id)).size;
  const rv = reviews ?? [];
  const avgRating = rv.length ? rv.reduce((s, r) => s + Number(r.rating), 0) / rv.length : 0;

  const storeSlug = (sf?.subdomain as string) ?? tenant.business.slug ?? "";
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://zotomic.com").replace(/\/$/, "");
  const storeUrl = storeSlug ? `${site}/${storeSlug}/products/${prod.slug}` : null;

  const events: TimelineEvent[] = (audit ?? []).map((a) => ({
    id: a.id as string,
    action: a.action as string,
    summary: (a.summary as string) ?? null,
    at: a.created_at as string,
  }));

  return (
    <DetailShell
      backHref="/app/products"
      backLabel="Products"
      title={prod.name as string}
      meta={`${prod.category ?? "Uncategorised"}${prod.sku ? ` · ${prod.sku}` : ""}`}
      status={<Badge tone={TONE[prod.status as keyof typeof TONE] ?? "neutral"}>{prod.status as string}</Badge>}
      actions={
        <>
          {storeUrl && prod.status === "active" && (
            <Button href={storeUrl} variant="outline" size="sm">
              View on storefront
            </Button>
          )}
          <DeleteProductButton id={prod.id as string} name={prod.name as string} />
        </>
      }
      sidebar={
        <>
          <Card>
            <CardHeader>
              <CardTitle>Performance</CardTitle>
            </CardHeader>
            <CardBody>
              <FactList
                items={[
                  { label: "Units sold", value: units.toLocaleString("en-US") },
                  { label: "Revenue", value: money(revenue, currency) },
                  { label: "In orders", value: orderCount.toLocaleString("en-US") },
                  {
                    label: "Reviews",
                    value: rv.length ? `${avgRating.toFixed(1)} ★ (${rv.length})` : "None",
                  },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardBody>
              <FactList
                items={[
                  { label: "Created", value: d(prod.created_at as string) },
                  { label: "Handle", value: <span className="font-mono text-xs">{prod.slug as string}</span> },
                  {
                    label: "Storefront",
                    value: storeUrl ? (
                      <a href={storeUrl} className="text-primary hover:underline">
                        open
                      </a>
                    ) : (
                      "—"
                    ),
                  },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardBody>
              <Timeline events={events} />
            </CardBody>
          </Card>
        </>
      }
    >
      <ProductEditor
        product={editorProduct}
        currency={currency}
        categories={categories}
        maxImages={limits.productImages}
        plan={limits.plan}
      />
    </DetailShell>
  );
}
