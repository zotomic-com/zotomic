"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-server";
import { listAnims, setAnimStatus, deleteAnim } from "@/lib/videos/anim-library";

export async function approveAnim(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setAnimStatus(id, "approved", admin.id);
  revalidatePath("/admin/services/anims");
}

export async function rejectAnim(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setAnimStatus(id, "rejected", admin.id);
  revalidatePath("/admin/services/anims");
}

export async function removeAnim(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteAnim(id);
  revalidatePath("/admin/services/anims");
}

export async function getAnims() {
  await requireAdmin();
  return listAnims();
}
