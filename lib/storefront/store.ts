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

function mapProduct(r: Record<string, unknown>): StoreProduct {
  const imgs = Array.isArray(r.image_urls) ? (r.image_urls as string[]) : [];
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
  };
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
    .select("id, name, slug, description, price, sale_price, category, image_urls, stock_qty, track_inventory")
    .eq("business_id", businessId)
    .eq("status", "active")
    .eq("visible", true)
    .order("created_at", { ascending: true });
  return (data ?? []).map(mapProduct);
});

export interface StorePaymentOption {
  id: string; // 'cod' | provider id
  label: string;
}

/** COD (always) + any connected payment gateway. */
export async function getStorePaymentOptions(businessId: string): Promise<StorePaymentOption[]> {
  const db = getAdminSupabase();
  const opts: StorePaymentOption[] = [{ id: "cod", label: "Cash on delivery" }];
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
    .select("id, name, slug, description, price, sale_price, category, image_urls, stock_qty, track_inventory")
    .eq("business_id", businessId)
    .eq("slug", handle)
    .eq("status", "active")
    .maybeSingle();
  return data ? mapProduct(data) : null;
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
