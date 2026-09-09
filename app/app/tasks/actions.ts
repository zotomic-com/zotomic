"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/app-actions";

const PRIORITIES = ["low", "medium", "high"];

export async function addTask(formData: FormData) {
  const { businessId, user, db } = await requireBusiness();
  const title = String(formData.get("title") ?? "").trim().slice(0, 300);
  if (!title) return { error: "Title required" };
  const priority = PRIORITIES.includes(String(formData.get("priority"))) ? String(formData.get("priority")) : "medium";
  const { error } = await db.from("tasks").insert({
    business_id: businessId,
    title,
    priority,
    source: "user",
    created_by: user.id,
  });
  if (error) return { error: "Could not add the task." };
  revalidatePath("/app/tasks");
  return { ok: true };
}

/** Turn a weekly-report recommendation into an open task (no duplicates). */
export async function addRecommendationTask(
  title: string,
  impact?: string | null,
): Promise<{ error: string } | { ok: true; already?: boolean }> {
  const { businessId, user, db } = await requireBusiness();
  const t = (title || "").trim().slice(0, 300);
  if (!t) return { error: "Nothing to add." };

  const { data: dupe } = await db
    .from("tasks")
    .select("id")
    .eq("business_id", businessId)
    .eq("status", "open")
    .ilike("title", t)
    .maybeSingle();
  if (dupe) return { ok: true, already: true };

  const priority = impact === "high" ? "high" : impact === "low" ? "low" : "medium";
  const { error } = await db.from("tasks").insert({
    business_id: businessId,
    title: t,
    priority,
    source: "system",
    created_by: user.id,
  });
  if (error) return { error: "Could not add the task." };
  revalidatePath("/app/tasks");
  revalidatePath("/app");
  return { ok: true };
}

export async function toggleTask(id: string, done: boolean) {
  const { businessId, db } = await requireBusiness();
  const { error } = await db
    .from("tasks")
    .update({ status: done ? "done" : "open", updated_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", id);
  if (error) return { error: "Could not update the task." };
  revalidatePath("/app/tasks");
  revalidatePath("/app");
  return { ok: true };
}

export async function deleteTask(id: string) {
  const { businessId, db } = await requireBusiness();
  const { error } = await db.from("tasks").delete().eq("business_id", businessId).eq("id", id);
  if (error) return { error: "Could not delete the task." };
  revalidatePath("/app/tasks");
  revalidatePath("/app");
  return { ok: true };
}
