import { unstable_cache, revalidateTag } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase";

export interface NavLink {
  id: string;
  location: "header" | "footer";
  section: string;
  label: string;
  href: string;
  icon: string | null;
  sortOrder: number;
  enabled: boolean;
}

function rowToLink(r: Record<string, unknown>): NavLink {
  return {
    id: r.id as string,
    location: r.location as "header" | "footer",
    section: r.section as string,
    label: r.label as string,
    href: r.href as string,
    icon: (r.icon as string) ?? null,
    sortOrder: r.sort_order as number,
    enabled: r.enabled as boolean,
  };
}

/** Public, enabled-only nav links for a location — cached. */
export const getNavLinks = unstable_cache(
  async (location: "header" | "footer"): Promise<NavLink[]> => {
    const db = getAdminSupabase();
    const { data } = await db
      .from("platform_nav_links")
      .select("*")
      .eq("location", location)
      .eq("enabled", true)
      .order("section")
      .order("sort_order");
    return (data ?? []).map(rowToLink);
  },
  ["nav-links"],
  { revalidate: 300, tags: ["website-nav"] },
);

/** Admin — every row (including disabled), for the editor. */
export async function getAllNavLinks(location: "header" | "footer"): Promise<NavLink[]> {
  const db = getAdminSupabase();
  const { data } = await db.from("platform_nav_links").select("*").eq("location", location).order("section").order("sort_order");
  return (data ?? []).map(rowToLink);
}

export async function createNavLink(input: { location: "header" | "footer"; section: string; label: string; href: string; icon: string | null }) {
  const db = getAdminSupabase();
  const { data: existing } = await db
    .from("platform_nav_links")
    .select("sort_order")
    .eq("location", input.location)
    .eq("section", input.section)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((existing?.sort_order as number) ?? -1) + 1;
  await db.from("platform_nav_links").insert({
    location: input.location,
    section: input.section,
    label: input.label.slice(0, 60),
    href: input.href.slice(0, 300),
    icon: input.icon,
    sort_order: nextOrder,
  });
  revalidateTag("website-nav");
}

export async function updateNavLink(id: string, patch: Partial<{ label: string; href: string; icon: string | null; enabled: boolean; section: string }>) {
  const db = getAdminSupabase();
  const update: Record<string, unknown> = {};
  if (patch.label !== undefined) update.label = patch.label.slice(0, 60);
  if (patch.href !== undefined) update.href = patch.href.slice(0, 300);
  if (patch.icon !== undefined) update.icon = patch.icon;
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  if (patch.section !== undefined) update.section = patch.section;
  await db.from("platform_nav_links").update(update).eq("id", id);
  revalidateTag("website-nav");
}

export async function deleteNavLink(id: string) {
  const db = getAdminSupabase();
  await db.from("platform_nav_links").delete().eq("id", id);
  revalidateTag("website-nav");
}

export async function reorderNavLink(id: string, direction: "up" | "down") {
  const db = getAdminSupabase();
  const { data: row } = await db.from("platform_nav_links").select("*").eq("id", id).maybeSingle();
  if (!row) return;
  const { data: siblings } = await db
    .from("platform_nav_links")
    .select("id, sort_order")
    .eq("location", row.location)
    .eq("section", row.section)
    .order("sort_order");
  const list = siblings ?? [];
  const idx = list.findIndex((s) => s.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= list.length) return;
  const a = list[idx];
  const b = list[swapIdx];
  await db.from("platform_nav_links").update({ sort_order: b.sort_order }).eq("id", a.id);
  await db.from("platform_nav_links").update({ sort_order: a.sort_order }).eq("id", b.id);
  revalidateTag("website-nav");
}
