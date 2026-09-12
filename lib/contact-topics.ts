import { unstable_cache, revalidateTag } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase";

export interface ContactTopic {
  id: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
}

function rowToTopic(r: Record<string, unknown>): ContactTopic {
  return { id: r.id as string, label: r.label as string, sortOrder: r.sort_order as number, enabled: r.enabled as boolean };
}

/** Enabled topics, in order — used by the /contact form's "Topic" dropdown. Cached. */
export const getContactTopics = unstable_cache(
  async (): Promise<ContactTopic[]> => {
    const db = getAdminSupabase();
    const { data } = await db.from("platform_contact_topics").select("*").eq("enabled", true).order("sort_order");
    return (data ?? []).map(rowToTopic);
  },
  ["contact-topics"],
  { revalidate: 300, tags: ["contact-topics"] },
);

/** Admin — every topic including disabled ones. */
export async function getAllContactTopics(): Promise<ContactTopic[]> {
  const db = getAdminSupabase();
  const { data } = await db.from("platform_contact_topics").select("*").order("sort_order");
  return (data ?? []).map(rowToTopic);
}

export async function createContactTopic(label: string) {
  const db = getAdminSupabase();
  const { data: existing } = await db.from("platform_contact_topics").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = ((existing?.sort_order as number) ?? -1) + 1;
  await db.from("platform_contact_topics").insert({ label: label.trim().slice(0, 60), sort_order: nextOrder });
  revalidateTag("contact-topics");
}

export async function updateContactTopic(id: string, patch: Partial<{ label: string; enabled: boolean }>) {
  const db = getAdminSupabase();
  const update: Record<string, unknown> = {};
  if (patch.label !== undefined) update.label = patch.label.trim().slice(0, 60);
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  await db.from("platform_contact_topics").update(update).eq("id", id);
  revalidateTag("contact-topics");
}

export async function deleteContactTopic(id: string) {
  const db = getAdminSupabase();
  await db.from("platform_contact_topics").delete().eq("id", id);
  revalidateTag("contact-topics");
}

export async function reorderContactTopic(id: string, direction: "up" | "down") {
  const db = getAdminSupabase();
  const { data: list } = await db.from("platform_contact_topics").select("id, sort_order").order("sort_order");
  const rows = list ?? [];
  const idx = rows.findIndex((r) => r.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= rows.length) return;
  const a = rows[idx];
  const b = rows[swapIdx];
  await db.from("platform_contact_topics").update({ sort_order: b.sort_order }).eq("id", a.id);
  await db.from("platform_contact_topics").update({ sort_order: a.sort_order }).eq("id", b.id);
  revalidateTag("contact-topics");
}
