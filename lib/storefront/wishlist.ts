import "server-only";
import { getAdminSupabase } from "@/lib/supabase";

export interface WishlistRow {
  productId: string;
  name: string;
  slug: string;
  price: number;
  salePrice: number | null;
  image: string | null;
  inStock: boolean;
  addedAt: string;
}

/** Signed-in shopper's saved products, newest first, with current pricing/stock. */
export async function getServerWishlist(accountId: string): Promise<WishlistRow[]> {
  const db = getAdminSupabase();
  const { data: rows } = await db
    .from("store_account_wishlist")
    .select("product_id, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(200);
  const ids = (rows ?? []).map((r) => r.product_id as string);
  if (!ids.length) return [];

  const { data: products } = await db
    .from("products")
    .select("id, name, slug, price, sale_price, image_urls, stock_qty, track_inventory, status, visible")
    .in("id", ids);
  const pMap = new Map((products ?? []).map((p) => [p.id as string, p]));

  const out: WishlistRow[] = [];
  for (const r of rows ?? []) {
    const p = pMap.get(r.product_id as string);
    if (!p || p.status !== "active" || p.visible === false) continue;
    const imgs = Array.isArray(p.image_urls) ? (p.image_urls as string[]) : [];
    const price = Number(p.price ?? 0);
    const sale = p.sale_price == null ? null : Number(p.sale_price);
    out.push({
      productId: p.id as string,
      name: p.name as string,
      slug: p.slug as string,
      price,
      salePrice: sale != null && sale < price ? sale : null,
      image: imgs[0] ?? null,
      inStock: !p.track_inventory || Number(p.stock_qty) > 0,
      addedAt: r.created_at as string,
    });
  }
  return out;
}

/** Just the product ids (for the storefront to reconcile localStorage on load). */
export async function getServerWishlistIds(accountId: string): Promise<string[]> {
  const { data } = await getAdminSupabase()
    .from("store_account_wishlist")
    .select("product_id")
    .eq("account_id", accountId)
    .limit(200);
  return (data ?? []).map((r) => r.product_id as string);
}

async function ownsProduct(businessId: string, productId: string): Promise<boolean> {
  const { data } = await getAdminSupabase()
    .from("products")
    .select("id")
    .eq("business_id", businessId)
    .eq("id", productId)
    .maybeSingle();
  return !!data;
}

export async function addServerWishlist(businessId: string, accountId: string, productId: string): Promise<void> {
  if (!productId || !(await ownsProduct(businessId, productId))) return;
  await getAdminSupabase()
    .from("store_account_wishlist")
    .upsert(
      { business_id: businessId, account_id: accountId, product_id: productId },
      { onConflict: "account_id,product_id", ignoreDuplicates: true },
    );
}

export async function removeServerWishlist(accountId: string, productId: string): Promise<void> {
  await getAdminSupabase()
    .from("store_account_wishlist")
    .delete()
    .eq("account_id", accountId)
    .eq("product_id", productId);
}

/** Fold a guest's localStorage wishlist into the account on login/signup. */
export async function mergeServerWishlist(
  businessId: string,
  accountId: string,
  productIds: string[],
): Promise<void> {
  const ids = [...new Set(productIds.filter(Boolean))].slice(0, 100);
  if (!ids.length) return;
  const { data: owned } = await getAdminSupabase()
    .from("products")
    .select("id")
    .eq("business_id", businessId)
    .in("id", ids);
  const valid = new Set((owned ?? []).map((p) => p.id as string));
  const rows = ids
    .filter((id) => valid.has(id))
    .map((id) => ({ business_id: businessId, account_id: accountId, product_id: id }));
  if (!rows.length) return;
  await getAdminSupabase()
    .from("store_account_wishlist")
    .upsert(rows, { onConflict: "account_id,product_id", ignoreDuplicates: true });
}
