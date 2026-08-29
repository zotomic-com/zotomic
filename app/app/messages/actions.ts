"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/app-actions";

export async function markThreadRead(provider: string, threadKey: string) {
  const { businessId, db } = await requireBusiness({ allowReadOnly: true });
  await db
    .from("messaging_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("provider", provider)
    .eq("thread_key", threadKey)
    .is("read_at", null);
  revalidatePath("/app/messages");
  return { ok: true };
}
