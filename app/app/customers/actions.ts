"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";

export async function updateCustomer(
  id: string,
  patch: { name?: string; phone?: string; email?: string; city?: string; notes?: string },
): Promise<{ error: string } | { ok: true }> {
  const { businessId, user, db } = await requireBusiness();

  const { data: c } = await db
    .from("customers")
    .select("id")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
  if (!c) return { error: "Customer not found" };

  const clean: Record<string, unknown> = {};
  const s = (v?: string, len = 200) => (v == null ? undefined : String(v).trim().slice(0, len) || null);
  if (patch.name !== undefined) {
    const n = s(patch.name);
    if (n) clean.name = n;
  }
  if (patch.phone !== undefined) clean.phone = s(patch.phone, 40);
  if (patch.email !== undefined) clean.email = s(patch.email, 160);
  if (patch.city !== undefined) clean.city = s(patch.city, 120);
  if (patch.notes !== undefined) clean.notes = s(patch.notes, 2000);
  if (!Object.keys(clean).length) return { ok: true };

  const { error } = await db.from("customers").update(clean).eq("business_id", businessId).eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Another customer already uses that phone number." };
    return { error: "Could not save." };
  }

  await writeAudit(businessId, user.id, "customer.updated", {
    targetType: "customer",
    targetId: id,
    summary: `Edited ${Object.keys(clean).join(", ")}`,
  });
  revalidatePath("/app/customers");
  revalidatePath(`/app/customers/${id}`);
  return { ok: true };
}
