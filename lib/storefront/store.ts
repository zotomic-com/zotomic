import { cache } from "react";
import { getAdminSupabase } from "@/lib/supabase";
import { normalizeConfig, type StorefrontConfig } from "./config";

export interface StoreProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  salePrice: number | null;
  category: string | null;
  imageUrls: string[];
  stockQty: number;
  trackInventory: boolean;
  hasVariants: boolean;
  /** social-proof + badge inputs (populated by getStoreProducts / getStoreProduct) */
  rating: number;
  reviewCount: number;
  sold: number;
  isNew: boolean;
  isHot: boolean;
  isBest: boolean;
  hideBadges: boolean;
}

/** Which single badge (if any) a card shows. Priority: sale → hot → best → new. */
export type ProductBadge = "sale" | "hot" | "best" | "new" | null;
export function badgeFor(p: StoreProduct): ProductBadge {
  if (p.hideBadges) return null;
  const onSale = p.salePrice != null && p.salePrice < p.price;
  if (onSale) return "sale";
  if (p.isHot) return "hot";
  if (p.isBest) return "best";
  if (p.isNew) return "new";
  return null;
}

export interface StoreVariant {
  id: string;
  name: string;
  options: Record<string, string>;
  price: number;
  salePrice: number | null;
  stockQty: number;
  soldOut: boolean;
}

export async function getStoreProductVariants(
  businessId: string,
  productId: string,
  fallbackPrice: number,
): Promise<{ options: { name: string; values: string[] }[]; variants: StoreVariant[] }> {
  const db = getAdminSupabase();
  const [{ data: prod }, { data: rows }] = await Promise.all([
    db.from("products").select("options, has_variants").eq("id", productId).maybeSingle(),
    db
      .from("product_variants")
      .select("id, name, options, price, sale_price, stock_qty, active")
      .eq("business_id", businessId)
      .eq("product_id", productId)
      .eq("active", true)
      .order("position"),
  ]);
  if (!prod?.has_variants) return { options: [], variants: [] };
  const options = Array.isArray(prod.options)
    ? (prod.options as { name: string; values: string[] }[])
    : [];
  const variants: StoreVariant[] = (rows ?? []).map((v) => {
    const price = v.price == null ? fallbackPrice : Number(v.price);
    const salePrice = v.sale_price == null ? null : Number(v.sale_price);
    return {
      id: v.id as string,
      name: v.name as string,
      options: (v.options as Record<string, string>) ?? {},
      price,
      salePrice: salePrice != null && salePrice < price ? salePrice : null,
      stockQty: Number(v.stock_qty),
      soldOut: Number(v.stock_qty) <= 0,
    };
  });
  return { options, variants };
}

export interface Store {
  businessId: string;
  name: string;
  slug: string;
  currency: string;
  published: boolean;
  offline?: boolean;
  config: StorefrontConfig;
}

const NEW_DAYS = 14;

function mapProduct(r: Record<string, unknown>): StoreProduct {
  const imgs = Array.isArray(r.image_urls) ? (r.image_urls as string[]) : [];
  const created = r.created_at ? new Date(r.created_at as string).getTime() : 0;
  return {
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    description: (r.description as string) ?? null,
    price: Number(r.price ?? 0),
    salePrice: r.sale_price == null ? null : Number(r.sale_price),
    category: (r.category as string) ?? null,
    imageUrls: imgs,
    stockQty: Number(r.stock_qty ?? 0),
    trackInventory: Boolean(r.track_inventory),
    hasVariants: Boolean(r.has_variants),
    rating: 0,
    reviewCount: 0,
    sold: 0,
    isNew: created > 0 && Date.now() - created < NEW_DAYS * 86_400_000,
    isHot: Boolean(r.is_hot),
    isBest: false,
    hideBadges: Boolean(r.hide_badges),
  };
}

const PRODUCT_COLS =
  "id, name, slug, description, price, sale_price, category, image_urls, stock_qty, track_inventory, has_variants, is_hot, hide_badges, created_at";

/** Attach ratings + lifetime units sold, and (for a full catalogue) flag the top sellers as "Best". */
async function enrichProducts(
  businessId: string,
  products: StoreProduct[],
  rankBest = true,
): Promise<StoreProduct[]> {
  if (!products.length) return products;
  const db = getAdminSupabase();
  const ids = products.map((p) => p.id);

  const [{ data: reviews }, { data: items }] = await Promise.all([
    db.from("product_reviews").select("product_id, rating").eq("business_id", businessId).eq("status", "approved").in("product_id", ids),
    db.from("order_items").select("product_id, qty").eq("business_id", businessId).in("product_id", ids),
  ]);

  const rAgg = new Map<string, { sum: number; n: number }>();
  for (const r of reviews ?? []) {
    const a = rAgg.get(r.product_id as string) ?? { sum: 0, n: 0 };
    a.sum += Number(r.rating);
    a.n += 1;
    rAgg.set(r.product_id as string, a);
  }
  const soldAgg = new Map<string, number>();
  for (const it of items ?? []) {
    soldAgg.set(it.product_id as string, (soldAgg.get(it.product_id as string) ?? 0) + Number(it.qty));
  }

  for (const p of products) {
    const a = rAgg.get(p.id);
    p.rating = a && a.n ? a.sum / a.n : 0;
    p.reviewCount = a?.n ?? 0;
    p.sold = soldAgg.get(p.id) ?? 0;
  }

  if (rankBest) {
    const topIds = new Set(
      [...products].filter((p) => p.sold > 0).sort((a, b) => b.sold - a.sold).slice(0, 5).map((p) => p.id),
    );
    for (const p of products) p.isBest = topIds.has(p.id);
  }

  return products;
}

/** For the PDP: rating/sold are real, but "Best" needs the whole catalogue. */
async function enrichSingle(businessId: string, product: StoreProduct): Promise<StoreProduct> {
  const [enriched, all] = await Promise.all([
    enrichProducts(businessId, [product], false),
    getStoreProducts(businessId),
  ]);
  const inTop = all.find((p) => p.id === product.id)?.isBest ?? false;
  enriched[0].isBest = inTop;
  return enriched[0];
}

/** Resolve a store by its subdomain slug. `draft` loads the unpublished config (editor preview). */
export const getStoreBySlug = cache(async function getStoreBySlug(
  slug: string,
  draft = false,
): Promise<Store | null> {
  const db = getAdminSupabase();
  const { data: cfg } = await db
    .from("storefront_config")
    .select("business_id, subdomain, draft_json, published_json, published_at, businesses(id, name, slug, currency, status)")
    .eq("subdomain", slug)
    .maybeSingle();

  if (!cfg) return null;
  const biz = (Array.isArray(cfg.businesses) ? cfg.businesses[0] : cfg.businesses) as
    | { id: string; name: string; slug: string; currency: string; status: string }
    | undefined;
  if (!biz || biz.status !== "active") return null;

  // A hard-locked subscription takes the storefront offline (soft-lock keeps it live).
  const { data: sub } = await db
    .from("subscriptions")
    .select("status")
    .eq("business_id", cfg.business_id)
    .maybeSingle();
  const hardLocked = sub?.status === "hard_lock";

  const raw = draft ? cfg.draft_json : cfg.published_json;
  const source = raw && Object.keys(raw).length ? raw : cfg.draft_json;

  return {
    businessId: cfg.business_id as string,
    name: biz.name,
    slug: (cfg.subdomain as string) ?? biz.slug,
    currency: biz.currency ?? "BDT",
    published: !!cfg.published_at && !hardLocked,
    offline: hardLocked,
    config: normalizeConfig(source, biz.name),
  };
});

export const getStoreProducts = cache(async function getStoreProducts(
  businessId: string,
): Promise<StoreProduct[]> {
  const db = getAdminSupabase();
  const { data } = await db
    .from("products")
    .select(PRODUCT_COLS)
    .eq("business_id", businessId)
    .eq("status", "active")
    .eq("visible", true)
    .order("created_at", { ascending: true });
  return enrichProducts(businessId, (data ?? []).map(mapProduct));
});

export interface StoreCategory {
  name: string;
  slug: string;
  imageUrl: string | null;
  count: number;
}

/** Categories that have at least one visible product, ordered by the owner's sort
 *  then by name. Falls back to distinct free-text values when the table is empty. */
export const getStoreCategories = cache(async function getStoreCategories(
  businessId: string,
): Promise<StoreCategory[]> {
  const db = getAdminSupabase();
  // select("*") so a not-yet-applied `image_url` migration can't break the storefront
  const [{ data: cats }, products] = await Promise.all([
    db.from("product_categories").select("*").eq("business_id", businessId).order("sort"),
    getStoreProducts(businessId),
  ]);

  const counts = new Map<string, number>();
  for (const p of products) if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);

  if (cats?.length) {
    return cats
      .map((c) => ({
        name: c.name as string,
        slug: c.slug as string,
        imageUrl: (c.image_url as string) ?? null,
        count: counts.get(c.name as string) ?? 0,
      }))
      .filter((c) => c.count > 0);
  }

  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), imageUrl: null, count }));
});

export interface StorePaymentOption {
  id: string; // 'cod' | provider id
  label: string;
}

/** COD (unless the owner turned it off) + any connected payment gateway. */
export async function getStorePaymentOptions(businessId: string, codEnabled = true): Promise<StorePaymentOption[]> {
  const db = getAdminSupabase();
  const opts: StorePaymentOption[] = codEnabled ? [{ id: "cod", label: "Cash on delivery" }] : [];
  const { data } = await db
    .from("integrations")
    .select("provider, mode")
    .eq("business_id", businessId)
    .eq("category", "payment")
    .eq("status", "connected");
  const names: Record<string, string> = { bkash: "bKash", nagad: "Nagad", sslcommerz: "Card / SSLCommerz" };
  for (const row of data ?? []) {
    opts.push({
      id: row.provider as string,
      label: `${names[row.provider as string] ?? row.provider}${row.mode === "sandbox" ? " (test)" : ""}`,
    });
  }
  return opts;
}

export async function getStoreProduct(businessId: string, handle: string): Promise<StoreProduct | null> {
  const db = getAdminSupabase();
  const { data } = await db
    .from("products")
    .select(PRODUCT_COLS)
    .eq("business_id", businessId)
    .eq("slug", handle)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;
  return enrichSingle(businessId, mapProduct(data));
}

export interface StoreReview {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  reviewerName: string;
  createdAt: string;
}

export async function getProductReviews(
  businessId: string,
  productId: string,
): Promise<{ reviews: StoreReview[]; average: number; count: number }> {
  const db = getAdminSupabase();
  const { data } = await db
    .from("product_reviews")
    .select("id, rating, title, body, reviewer_name, created_at")
    .eq("business_id", businessId)
    .eq("product_id", productId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(50);

  const reviews = (data ?? []).map((r) => ({
    id: r.id as string,
    rating: Number(r.rating),
    title: (r.title as string) ?? null,
    body: (r.body as string) ?? null,
    reviewerName: (r.reviewer_name as string) ?? "Verified buyer",
    createdAt: r.created_at as string,
  }));
  const count = reviews.length;
  const average = count ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;
  return { reviews, average, count };
}
