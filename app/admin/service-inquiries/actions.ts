"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, adminDb } from "@/lib/admin-server";

export async function updateServiceInquiryStatusAction(
  id: string,
  status: "new" | "contacted" | "closed",
): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  const { error } = await adminDb().from("service_inquiries").update({ status }).eq("id", id);
  if (error) return { error: "Could not update the inquiry." };
  revalidatePath("/admin/service-inquiries");
  revalidatePath("/admin/orders");
  return { ok: true };
}
