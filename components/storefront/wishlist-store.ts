"use client";

export interface WishItem {
  id: string;
  name: string;
  price: number;
  image: string | null;
  slug: string;
}

const key = (s: string) => `zotomic_wish_${s}`;

export function readWishlist(storeSlug: string): WishItem[] {
  try {
    const raw = localStorage.getItem(key(storeSlug));
    const p = raw ? JSON.parse(raw) : [];
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function write(storeSlug: string, items: WishItem[]) {
  try {
    localStorage.setItem(key(storeSlug), JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("zotomic-wishlist", { detail: { storeSlug } }));
  } catch {
    /* ignore */
  }
}

export function inWishlist(storeSlug: string, id: string): boolean {
  return readWishlist(storeSlug).some((i) => i.id === id);
}

export function toggleWishlist(storeSlug: string, item: WishItem): boolean {
  const items = readWishlist(storeSlug);
  const idx = items.findIndex((i) => i.id === item.id);
  if (idx >= 0) {
    items.splice(idx, 1);
    write(storeSlug, items);
    return false;
  }
  items.push(item);
  write(storeSlug, items);
  return true;
}

export function removeWish(storeSlug: string, id: string) {
  write(
    storeSlug,
    readWishlist(storeSlug).filter((i) => i.id !== id),
  );
}
