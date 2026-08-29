"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/app-actions";

export async function addTask(formData: FormData) {
  const { businessId, user, db } = await requireBusiness();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title required" };
  await db.from("tasks").insert({
    business_id: businessId,
    title,
    priority: String(formData.get("priority") ?? "medium"),
    source: "user",
    created_by: user.id,
  });
  revalidatePath("/app/tasks");
  return { ok: true };
}

export async function toggleTask(id: string, done: boolean) {
  const { businessId, db } = await requireBusiness();
  await db
    .from("tasks")
    .update({ status: done ? "done" : "open" })
    .eq("business_id", businessId)
    .eq("id", id);
  revalidatePath("/app/tasks");
  return { ok: true };
}

export async function deleteTask(id: string) {
  const { businessId, db } = await requireBusiness();
  await db.from("tasks").delete().eq("business_id", businessId).eq("id", id);
  revalidatePath("/app/tasks");
  return { ok: true };
}
