"use client";

export interface CartItem {
  id: string;
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
    return Array.isArray(parsed) ? parsed : [];
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

export function addToCart(storeSlug: string, item: Omit<CartItem, "qty">, qty = 1) {
  const items = readCart(storeSlug);
  const existing = items.find((i) => i.id === item.id);
  if (existing) existing.qty += qty;
  else items.push({ ...item, qty });
  writeCart(storeSlug, items);
}

export function cartCount(storeSlug: string): number {
  return readCart(storeSlug).reduce((n, i) => n + i.qty, 0);
}
