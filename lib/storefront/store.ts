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

export interface Store {
  businessId: string;
  name: string;
  slug: string;
  currency: string;
  published: boolean;
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

  const raw = draft ? cfg.draft_json : cfg.published_json;
  const source = raw && Object.keys(raw).length ? raw : cfg.draft_json;

  return {
    businessId: cfg.business_id as string,
    name: biz.name,
    slug: (cfg.subdomain as string) ?? biz.slug,
    currency: biz.currency ?? "BDT",
    published: !!cfg.published_at,
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
