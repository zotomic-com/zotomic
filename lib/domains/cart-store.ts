"use client";

export interface DomainCartItem {
  /** unique cart line key */
  id: string;
  type: "register" | "transfer";
  domainName: string;
  authCode?: string;
  pointTo: "zotomic" | "self";
  forwardToEmail?: string;
  /** display only — always re-verified server-side at checkout */
  priceBDT: number | null;
}

const KEY = "zotomic_domain_cart";

export function readCart(): DomainCartItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeCart(items: DomainCartItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("zotomic-domain-cart"));
  } catch {
    /* private mode / storage full — ignore */
  }
}

export function addToCart(item: DomainCartItem) {
  const items = readCart();
  if (items.some((i) => i.id === item.id)) return;
  items.push(item);
  writeCart(items);
}

export function removeFromCart(id: string) {
  writeCart(readCart().filter((i) => i.id !== id));
}

export function clearCart() {
  writeCart([]);
}

export function cartCount(): number {
  return readCart().length;
}
