"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-server";
import { generateReport } from "@/lib/reports/generate";

export async function retryReport(businessId: string) {
  await requireAdmin();
  const res = await generateReport(businessId, { force: true });
  revalidatePath("/admin/reports");
  return res.status === "ready" ? { ok: true } : { error: "Still failed — check logs." };
}
