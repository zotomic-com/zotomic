"use server";

import { revalidateTag } from "next/cache";
import { revalidatePath } from "next/cache";
import { requireBusiness, writeAudit } from "@/lib/app-actions";

export async function moderateReview(id: string, status: "approved" | "hidden") {
  const { businessId, user, db } = await requireBusiness();
  const { error } = await db
    .from("product_reviews")
    .update({ status })
    .eq("business_id", businessId)
    .eq("id", id);
  if (error) return { error: "Could not update" };
  await writeAudit(businessId, user.id, "review.moderated", { targetType: "review", targetId: id, summary: `Review ${status}` });
  revalidateTag(`site:${businessId}`);
  revalidatePath("/app/reviews");
  return { ok: true };
}
