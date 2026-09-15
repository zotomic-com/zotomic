import { unstable_cache, revalidateTag } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase";

export type ContactNumberType = "phone" | "whatsapp";

export interface ContactNumber {
  id: string;
  type: ContactNumberType;
  label: string;
  number: string;
  sortOrder: number;
}

function rowToContact(r: Record<string, unknown>): ContactNumber {
  return {
    id: r.id as string,
    type: r.type as ContactNumberType,
    label: r.label as string,
    number: r.number as string,
    sortOrder: r.sort_order as number,
  };
}

/** Every phone/WhatsApp contact number, in order — shown in the public footer. Cached. */
export const getContactNumbers = unstable_cache(
  async (): Promise<ContactNumber[]> => {
    const db = getAdminSupabase();
    const { data } = await db.from("platform_contact_numbers").select("*").order("sort_order");
    return (data ?? []).map(rowToContact);
  },
  ["contact-numbers"],
  { revalidate: 300, tags: ["contact-numbers"] },
);

export interface ContactNumberInput {
  type: ContactNumberType;
  label: string;
  number: string;
}

export async function createContactNumber(input: ContactNumberInput) {
  const db = getAdminSupabase();
  const { data: existing } = await db
    .from("platform_contact_numbers")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((existing?.sort_order as number) ?? -1) + 1;
  await db.from("platform_contact_numbers").insert({
    type: input.type,
    label: input.label.trim().slice(0, 60),
    number: input.number.trim().slice(0, 40),
    sort_order: nextOrder,
  });
  revalidateTag("contact-numbers");
}

export async function updateContactNumber(id: string, patch: Partial<ContactNumberInput>) {
  const db = getAdminSupabase();
  const update: Record<string, unknown> = {};
  if (patch.type !== undefined) update.type = patch.type;
  if (patch.label !== undefined) update.label = patch.label.trim().slice(0, 60);
  if (patch.number !== undefined) update.number = patch.number.trim().slice(0, 40);
  await db.from("platform_contact_numbers").update(update).eq("id", id);
  revalidateTag("contact-numbers");
}

export async function deleteContactNumber(id: string) {
  const db = getAdminSupabase();
  await db.from("platform_contact_numbers").delete().eq("id", id);
  revalidateTag("contact-numbers");
}

export async function reorderContactNumber(id: string, direction: "up" | "down") {
  const db = getAdminSupabase();
  const { data: list } = await db.from("platform_contact_numbers").select("id, sort_order").order("sort_order");
  const rows = list ?? [];
  const idx = rows.findIndex((r) => r.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= rows.length) return;
  const a = rows[idx];
  const b = rows[swapIdx];
  await db.from("platform_contact_numbers").update({ sort_order: b.sort_order }).eq("id", a.id);
  await db.from("platform_contact_numbers").update({ sort_order: a.sort_order }).eq("id", b.id);
  revalidateTag("contact-numbers");
}
