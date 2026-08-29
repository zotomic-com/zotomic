"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/app-actions";
import { submitPayment } from "@/lib/billing";

export async function submitPaymentAction(formData: FormData) {
  const { businessId } = await requireBusiness({ allowReadOnly: true });
  const txn = String(formData.get("txn_id") ?? "").trim();
  const amount = Number(formData.get("amount"));
  if (txn.length < 4) return { error: "Enter the bKash transaction ID." };
  if (!(amount > 0)) return { error: "Enter the amount you paid." };

  const res = await submitPayment(businessId, txn, amount);
  if ("error" in res) return res;

  revalidatePath("/app/billing");
  return { ok: true };
}
