import { unstable_cache, revalidateTag } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase";

export interface PortfolioItem {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  projectUrl: string | null;
  sortOrder: number;
}

function rowToItem(r: Record<string, unknown>): PortfolioItem {
  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string,
    imageUrl: r.image_url as string,
    projectUrl: (r.project_url as string) ?? null,
    sortOrder: r.sort_order as number,
  };
}

/** Every portfolio item, in order — the /web-development client carousel. Cached. */
export const getPortfolioItems = unstable_cache(
  async (): Promise<PortfolioItem[]> => {
    const db = getAdminSupabase();
    const { data } = await db.from("platform_portfolio_items").select("*").order("sort_order");
    return (data ?? []).map(rowToItem);
  },
  ["portfolio-items"],
  { revalidate: 300, tags: ["portfolio"] },
);

/** Admin — same list, unfiltered (no disabled flag on this table, so identical to the public one). */
export async function getAllPortfolioItems(): Promise<PortfolioItem[]> {
  const db = getAdminSupabase();
  const { data } = await db.from("platform_portfolio_items").select("*").order("sort_order");
  return (data ?? []).map(rowToItem);
}

export interface PortfolioItemInput {
  title: string;
  description: string;
  imageUrl: string;
  projectUrl: string | null;
}

export async function createPortfolioItem(input: PortfolioItemInput) {
  const db = getAdminSupabase();
  const { data: existing } = await db
    .from("platform_portfolio_items")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((existing?.sort_order as number) ?? -1) + 1;
  await db.from("platform_portfolio_items").insert({
    title: input.title.trim().slice(0, 80),
    description: input.description.trim().slice(0, 300),
    image_url: input.imageUrl,
    project_url: input.projectUrl?.trim().slice(0, 300) || null,
    sort_order: nextOrder,
  });
  revalidateTag("portfolio");
}

export async function updatePortfolioItem(id: string, patch: Partial<PortfolioItemInput>) {
  const db = getAdminSupabase();
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 80);
  if (patch.description !== undefined) update.description = patch.description.trim().slice(0, 300);
  if (patch.imageUrl !== undefined) update.image_url = patch.imageUrl;
  if (patch.projectUrl !== undefined) update.project_url = patch.projectUrl?.trim().slice(0, 300) || null;
  await db.from("platform_portfolio_items").update(update).eq("id", id);
  revalidateTag("portfolio");
}

export async function deletePortfolioItem(id: string) {
  const db = getAdminSupabase();
  await db.from("platform_portfolio_items").delete().eq("id", id);
  revalidateTag("portfolio");
}

export async function reorderPortfolioItem(id: string, direction: "up" | "down") {
  const db = getAdminSupabase();
  const { data: list } = await db.from("platform_portfolio_items").select("id, sort_order").order("sort_order");
  const rows = list ?? [];
  const idx = rows.findIndex((r) => r.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= rows.length) return;
  const a = rows[idx];
  const b = rows[swapIdx];
  await db.from("platform_portfolio_items").update({ sort_order: b.sort_order }).eq("id", a.id);
  await db.from("platform_portfolio_items").update({ sort_order: a.sort_order }).eq("id", b.id);
  revalidateTag("portfolio");
}
