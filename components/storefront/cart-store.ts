"use client";

export interface CartItem {
  /** unique cart line key — variant id when a variant is chosen, else product id */
  id: string;
  productId: string;
  variantId?: string;
  variantLabel?: string;
  name: string;
  price: number;
  image: string | null;
  slug: string;
  qty: number;
}

const key = (storeSlug: string) => `zotomic_cart_${storeSlug}`;

export function readCart(storeSlug: string): CartItem[] {
  try {
    const raw = localStorage.getItem(key(storeSlug));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // backfill productId for carts saved before variants existed
    return parsed.map((i: CartItem) => ({ ...i, productId: i.productId ?? i.id }));
  } catch {
    return [];
  }
}

export function writeCart(storeSlug: string, items: CartItem[]) {
  try {
    localStorage.setItem(key(storeSlug), JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("zotomic-cart", { detail: { storeSlug } }));
  } catch {
    /* private mode / storage full — ignore */
  }
}

export function addToCart(
  storeSlug: string,
  item: Omit<CartItem, "qty" | "productId"> & { productId?: string },
  qty = 1,
) {
  const items = readCart(storeSlug);
  const existing = items.find((i) => i.id === item.id);
  if (existing) existing.qty += qty;
  else items.push({ ...item, productId: item.productId ?? item.id, qty });
  writeCart(storeSlug, items);
}

export function cartCount(storeSlug: string): number {
  return readCart(storeSlug).reduce((n, i) => n + i.qty, 0);
}
