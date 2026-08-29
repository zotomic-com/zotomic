"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/app-actions";

export async function markAllNotificationsRead() {
  const { businessId, db } = await requireBusiness({ allowReadOnly: true });
  await db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .is("read_at", null);
  revalidatePath("/app/notifications");
  return { ok: true };
}

export async function markNotificationRead(id: string) {
  const { businessId, db } = await requireBusiness({ allowReadOnly: true });
  await db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", id);
  revalidatePath("/app/notifications");
  return { ok: true };
}
