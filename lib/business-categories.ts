import { unstable_cache, revalidateTag } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase";

export interface BusinessCategory {
  id: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
}

function rowToCategory(r: Record<string, unknown>): BusinessCategory {
  return { id: r.id as string, label: r.label as string, sortOrder: r.sort_order as number, enabled: r.enabled as boolean };
}

/** Enabled categories, in order — used by the store-registration (onboarding) form. Cached. */
export const getBusinessCategories = unstable_cache(
  async (): Promise<BusinessCategory[]> => {
    const db = getAdminSupabase();
    const { data } = await db.from("platform_business_categories").select("*").eq("enabled", true).order("sort_order");
    return (data ?? []).map(rowToCategory);
  },
  ["business-categories"],
  { revalidate: 300, tags: ["business-categories"] },
);

/** Admin — every category including disabled ones. */
export async function getAllBusinessCategories(): Promise<BusinessCategory[]> {
  const db = getAdminSupabase();
  const { data } = await db.from("platform_business_categories").select("*").order("sort_order");
  return (data ?? []).map(rowToCategory);
}

export async function createBusinessCategory(label: string) {
  const db = getAdminSupabase();
  const { data: existing } = await db.from("platform_business_categories").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = ((existing?.sort_order as number) ?? -1) + 1;
  await db.from("platform_business_categories").insert({ label: label.trim().slice(0, 80), sort_order: nextOrder });
  revalidateTag("business-categories");
}

export async function updateBusinessCategory(id: string, patch: Partial<{ label: string; enabled: boolean }>) {
  const db = getAdminSupabase();
  const update: Record<string, unknown> = {};
  if (patch.label !== undefined) update.label = patch.label.trim().slice(0, 80);
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  await db.from("platform_business_categories").update(update).eq("id", id);
  revalidateTag("business-categories");
}

export async function deleteBusinessCategory(id: string) {
  const db = getAdminSupabase();
  await db.from("platform_business_categories").delete().eq("id", id);
  revalidateTag("business-categories");
}

export async function reorderBusinessCategory(id: string, direction: "up" | "down") {
  const db = getAdminSupabase();
  const { data: list } = await db.from("platform_business_categories").select("id, sort_order").order("sort_order");
  const rows = list ?? [];
  const idx = rows.findIndex((r) => r.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= rows.length) return;
  const a = rows[idx];
  const b = rows[swapIdx];
  await db.from("platform_business_categories").update({ sort_order: b.sort_order }).eq("id", a.id);
  await db.from("platform_business_categories").update({ sort_order: a.sort_order }).eq("id", b.id);
  revalidateTag("business-categories");
}
