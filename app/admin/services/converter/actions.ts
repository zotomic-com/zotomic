"use server";

import { revalidatePath } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-server";
import { SERVICE_PLAN_LIMITS } from "@/lib/services/tools";
import { ConvType } from "@/lib/services/converter";

export interface ConvAdminRow {
  id: string;
  convType: ConvType;
  status: "pending" | "approved" | "rejected";
  checks: {
    authored: number;
    rejected: string[];
    sceneTitle?: string;
    visual?: string;
  };
  created_by: string | null;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

/** List all converter admin entries (pending/approved/rejected). */
export async function listConvAnims(status?: "pending" | "approved" | "rejected"): Promise<ConvAdminRow[]> {
  const db = getAdminSupabase();
  let q = db.from("conv_library").select("*").order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  return error ? [] : (data as ConvAdminRow[]);
}

/** Insert (or refresh) a pending converter animation after a successful author+debug pass. */
export async function savePendingConvAnim(input: {
  convType: ConvType;
  definition: {
    convType: ConvType;
    keywords: string[];
    loop: boolean;
    cycle?: number;
    frames: { u: number; pose: Record<string, unknown> }[];
  };
  checks: {
    authored: number;
    rejected: string[];
    sceneTitle?: string;
    visual?: string;
  };
  createdBy: string | null;
}): Promise<void> {
  const db = getAdminSupabase();
  await db.from("conv_library").upsert(
    {
      convType: input.convType,
      keywords: input.definition.keywords,
      definition: input.definition,
      status: "pending",
      checks: input.checks,
      created_by: input.createdBy,
      decided_at: null,
      decided_by: null,
    },
    { onConflict: "convType" },
  );
}

/** Admin queue listing. */
export async function getConvAnims() {
  await requireAdmin();
  return listConvAnims();
}

/** Admin: approve a converter animation into the permanent library. */
export async function approveConvAnim(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  // Mark as approved
  const db = getAdminSupabase();
  await db.from("conv_library").update({ status: "approved", decided_at: new Date().toISOString(), decided_by: admin.id }).eq("id", id);
  revalidatePath("/admin/services/converter");
}

/** Admin: reject a converter animation. */
export async function rejectConvAnim(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const db = getAdminSupabase();
  await db.from("conv_library").update({ status: "rejected", decided_at: new Date().toISOString(), decided_by: admin.id }).eq("id", id);
  revalidatePath("/admin/services/converter");
}

/** Admin: delete a converter animation entry. */
export async function removeConvAnim(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const db = getAdminSupabase();
  await db.from("conv_library").delete().eq("id", id);
  revalidatePath("/admin/services/converter");
}