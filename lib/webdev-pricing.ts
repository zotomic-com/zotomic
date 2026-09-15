import { unstable_cache, revalidateTag } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase";

/**
 * Admin-editable pricing packages for the /web-development page. Deliberately
 * separate from lib/plan-cards.ts (Zotomic's own subscription pricing, which
 * drives real billing) — every package here is plain marketing content, no
 * system/custom split, no lock-in, fully add/edit/delete-able.
 */
export interface WebDevPricingPackage {
  id: string;
  name: string;
  priceBDT: number | null;
  priceLabel: string;
  tagline: string;
  badge: string;
  features: string[];
  buttonText: string;
  buttonHref: string;
  featured: boolean;
  enabled: boolean;
  sortOrder: number;
}

function priceLabel(priceBDT: number | null): string {
  if (priceBDT === null) return "Custom";
  return `৳${priceBDT.toLocaleString("en-US")}`;
}

function rowToPackage(r: Record<string, unknown>): WebDevPricingPackage {
  const priceBDT = r.price_bdt === null || r.price_bdt === undefined ? null : Number(r.price_bdt);
  return {
    id: r.id as string,
    name: r.name as string,
    priceBDT,
    priceLabel: priceLabel(priceBDT),
    tagline: r.tagline as string,
    badge: r.badge as string,
    features: Array.isArray(r.features) ? (r.features as string[]) : [],
    buttonText: r.button_text as string,
    buttonHref: r.button_href as string,
    featured: r.featured as boolean,
    enabled: r.enabled as boolean,
    sortOrder: r.sort_order as number,
  };
}

/** Enabled packages, in order — the /web-development pricing section. Cached. */
export const getWebDevPricingPackages = unstable_cache(
  async (): Promise<WebDevPricingPackage[]> => {
    const db = getAdminSupabase();
    const { data } = await db.from("webdev_pricing_packages").select("*").eq("enabled", true).order("sort_order");
    return (data ?? []).map(rowToPackage);
  },
  ["webdev-pricing"],
  { revalidate: 300, tags: ["webdev-pricing"] },
);

/** Admin — every package including disabled ones. */
export async function getAllWebDevPricingPackages(): Promise<WebDevPricingPackage[]> {
  const db = getAdminSupabase();
  const { data } = await db.from("webdev_pricing_packages").select("*").order("sort_order");
  return (data ?? []).map(rowToPackage);
}

export interface WebDevPricingPackageInput {
  name: string;
  priceBDT: number | null;
  tagline: string;
  badge: string;
  features: string[];
  buttonText: string;
  buttonHref: string;
  featured: boolean;
}

export async function createWebDevPricingPackage(input: WebDevPricingPackageInput) {
  const db = getAdminSupabase();
  const { data: existing } = await db
    .from("webdev_pricing_packages")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((existing?.sort_order as number) ?? -1) + 1;
  await db.from("webdev_pricing_packages").insert({
    name: input.name.trim().slice(0, 60),
    price_bdt: input.priceBDT,
    tagline: input.tagline.trim().slice(0, 200),
    badge: input.badge.trim().slice(0, 30),
    features: input.features.filter(Boolean).slice(0, 20).map((f) => f.trim().slice(0, 200)),
    button_text: input.buttonText.trim().slice(0, 40) || "Get a quote",
    button_href: input.buttonHref.trim().slice(0, 300) || "/web-development#inquiry",
    featured: input.featured,
    sort_order: nextOrder,
  });
  revalidateTag("webdev-pricing");
}

export async function updateWebDevPricingPackage(id: string, patch: Partial<WebDevPricingPackageInput & { enabled: boolean }>) {
  const db = getAdminSupabase();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim().slice(0, 60);
  if (patch.priceBDT !== undefined) update.price_bdt = patch.priceBDT;
  if (patch.tagline !== undefined) update.tagline = patch.tagline.trim().slice(0, 200);
  if (patch.badge !== undefined) update.badge = patch.badge.trim().slice(0, 30);
  if (patch.features !== undefined) update.features = patch.features.filter(Boolean).slice(0, 20).map((f) => f.trim().slice(0, 200));
  if (patch.buttonText !== undefined) update.button_text = patch.buttonText.trim().slice(0, 40);
  if (patch.buttonHref !== undefined) update.button_href = patch.buttonHref.trim().slice(0, 300);
  if (patch.featured !== undefined) update.featured = patch.featured;
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  await db.from("webdev_pricing_packages").update(update).eq("id", id);
  revalidateTag("webdev-pricing");
}

export async function deleteWebDevPricingPackage(id: string) {
  const db = getAdminSupabase();
  await db.from("webdev_pricing_packages").delete().eq("id", id);
  revalidateTag("webdev-pricing");
}

export async function reorderWebDevPricingPackage(id: string, direction: "up" | "down") {
  const db = getAdminSupabase();
  const { data: list } = await db.from("webdev_pricing_packages").select("id, sort_order").order("sort_order");
  const rows = list ?? [];
  const idx = rows.findIndex((r) => r.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= rows.length) return;
  const a = rows[idx];
  const b = rows[swapIdx];
  await db.from("webdev_pricing_packages").update({ sort_order: b.sort_order }).eq("id", a.id);
  await db.from("webdev_pricing_packages").update({ sort_order: a.sort_order }).eq("id", b.id);
  revalidateTag("webdev-pricing");
}
