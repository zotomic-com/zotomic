import { unstable_cache, revalidateTag } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase";

export interface ServiceCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  status: "live" | "coming_soon";
  href: string | null;
  sortOrder: number;
  enabled: boolean;
}

function rowToCard(r: Record<string, unknown>): ServiceCard {
  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string,
    icon: r.icon as string,
    status: r.status as "live" | "coming_soon",
    href: (r.href as string) ?? null,
    sortOrder: r.sort_order as number,
    enabled: r.enabled as boolean,
  };
}

/** Enabled cards, in order — the /services page. Cached. */
export const getServiceCards = unstable_cache(
  async (): Promise<ServiceCard[]> => {
    const db = getAdminSupabase();
    const { data } = await db.from("platform_service_cards").select("*").eq("enabled", true).order("sort_order");
    return (data ?? []).map(rowToCard);
  },
  ["service-cards"],
  { revalidate: 300, tags: ["service-cards"] },
);

/** Admin — every card including disabled ones. */
export async function getAllServiceCards(): Promise<ServiceCard[]> {
  const db = getAdminSupabase();
  const { data } = await db.from("platform_service_cards").select("*").order("sort_order");
  return (data ?? []).map(rowToCard);
}

export interface ServiceCardInput {
  title: string;
  description: string;
  icon: string;
  status: "live" | "coming_soon";
  href: string | null;
}

export async function createServiceCard(input: ServiceCardInput) {
  const db = getAdminSupabase();
  const { data: existing } = await db
    .from("platform_service_cards")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((existing?.sort_order as number) ?? -1) + 1;
  await db.from("platform_service_cards").insert({
    title: input.title.trim().slice(0, 80),
    description: input.description.trim().slice(0, 300),
    icon: input.icon,
    status: input.status,
    href: input.status === "live" ? (input.href?.trim().slice(0, 300) || null) : null,
    sort_order: nextOrder,
  });
  revalidateTag("service-cards");
}

export async function updateServiceCard(id: string, patch: Partial<ServiceCardInput & { enabled: boolean }>) {
  const db = getAdminSupabase();
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 80);
  if (patch.description !== undefined) update.description = patch.description.trim().slice(0, 300);
  if (patch.icon !== undefined) update.icon = patch.icon;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.href !== undefined) update.href = patch.href?.trim().slice(0, 300) || null;
  if (patch.status === "coming_soon") update.href = null;
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  await db.from("platform_service_cards").update(update).eq("id", id);
  revalidateTag("service-cards");
}

export async function deleteServiceCard(id: string) {
  const db = getAdminSupabase();
  await db.from("platform_service_cards").delete().eq("id", id);
  revalidateTag("service-cards");
}

export async function reorderServiceCard(id: string, direction: "up" | "down") {
  const db = getAdminSupabase();
  const { data: list } = await db.from("platform_service_cards").select("id, sort_order").order("sort_order");
  const rows = list ?? [];
  const idx = rows.findIndex((r) => r.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= rows.length) return;
  const a = rows[idx];
  const b = rows[swapIdx];
  await db.from("platform_service_cards").update({ sort_order: b.sort_order }).eq("id", a.id);
  await db.from("platform_service_cards").update({ sort_order: a.sort_order }).eq("id", b.id);
  revalidateTag("service-cards");
}
