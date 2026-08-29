"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";

const CURRENCIES = ["BDT", "USD", "INR", "PKR", "EUR", "GBP"];

export async function updateBusinessSettings(formData: FormData) {
  const { businessId, business, user, db } = await requireBusiness();

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Business name is required" };

  const currency = String(formData.get("currency") ?? "BDT");
  const patch = {
    name,
    type: String(formData.get("type") ?? "") || null,
    currency: CURRENCIES.includes(currency) ? currency : "BDT",
    timezone: String(formData.get("timezone") ?? "Asia/Dhaka"),
    description: String(formData.get("description") ?? "") || null,
    telegram_chat_id: String(formData.get("telegram_chat_id") ?? "").trim().slice(0, 64) || null,
  };

  const { error } = await db.from("businesses").update(patch).eq("id", businessId);
  if (error) return { error: "Could not save settings" };

  await writeAudit(businessId, user.id, "business.settings_updated", {
    targetType: "business",
    targetId: businessId,
    summary: "Updated business settings",
    before: { name: business?.name, currency: business?.currency },
    after: { name: patch.name, currency: patch.currency },
  });

  revalidatePath("/app/settings");
  revalidatePath("/app");
  return { ok: true };
}
