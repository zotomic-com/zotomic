"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-server";
import { getAdminSupabase } from "@/lib/supabase";
import { setFraudStage, clearFraudFlag } from "@/lib/fraud/flags";
import { runFraudScan, computeRisk } from "@/lib/fraud/detect";

async function audit(adminId: string, action: string, summary: string, targetId?: string) {
  await getAdminSupabase().from("audit_logs").insert({
    actor_id: adminId,
    actor_type: "admin",
    action,
    target_type: "fraud_flag",
    target_id: targetId ?? null,
    summary: `Admin: ${summary}`,
  });
}

export async function setStageAction(form: {
  flagId?: string;
  phone?: string;
  name?: string;
  email?: string;
  stage: number;
  category?: string;
  reason?: string;
}): Promise<{ ok: true; flagId: string } | { error: string }> {
  const admin = await requireAdmin();
  const stage = [1, 2, 3].includes(form.stage) ? (form.stage as 1 | 2 | 3) : 1;
  const res = await setFraudStage(
    { flagId: form.flagId, phone: form.phone, name: form.name, email: form.email },
    { stage, category: form.category, reason: form.reason?.trim().slice(0, 500), adminId: admin.id },
  );
  if ("error" in res) return res;
  await audit(admin.id, "fraud.stage_set", `${form.phone ?? form.flagId} → stage ${stage}`, res.flagId);
  revalidatePath("/admin/fraud");
  revalidatePath(`/admin/fraud/${res.flagId}`);
  return res;
}

export async function clearFlagAction(id: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const res = await clearFraudFlag(id, admin.id);
  if ("error" in res) return res;
  await audit(admin.id, "fraud.cleared", `Cleared fraud flag ${id}`, id);
  revalidatePath("/admin/fraud");
  revalidatePath(`/admin/fraud/${id}`);
  return { ok: true };
}

export async function runScanAction(): Promise<{ ok: true; scanned: number; flagged: number } | { error: string }> {
  const admin = await requireAdmin();
  const res = await runFraudScan();
  await audit(admin.id, "fraud.scan", `Ran fraud scan — ${res.flagged} flagged of ${res.scanned} scanned`);
  revalidatePath("/admin/fraud");
  return { ok: true, ...res };
}

export async function recomputeFlagAction(id: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const { data: flag } = await db.from("fraud_flags").select("phone").eq("id", id).maybeSingle();
  if (!flag?.phone) return { error: "No phone on this flag." };
  const risk = await computeRisk(flag.phone as string);
  if (!risk) return { error: "No customer history found for this phone." };
  const { upsertAutoFlag } = await import("@/lib/fraud/flags");
  await upsertAutoFlag(risk);
  void admin;
  revalidatePath(`/admin/fraud/${id}`);
  return { ok: true };
}

export async function setStoreFraudWarnings(businessId: string, enabled: boolean): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const { error } = await getAdminSupabase()
    .from("businesses")
    .update({ fraud_warnings_enabled: enabled })
    .eq("id", businessId);
  if (error) return { error: "Could not save." };
  await audit(admin.id, "fraud.store_warnings", `${businessId} fraud warnings ${enabled ? "on" : "off"}`);
  revalidatePath("/admin/fraud");
  return { ok: true };
}

/** Search stores to opt one out of fraud warnings (default is: every store on). */
export async function findStoresForFraud(
  query: string,
): Promise<{ id: string; name: string; enabled: boolean }[]> {
  await requireAdmin();
  const term = query.trim();
  if (term.length < 2) return [];
  const { data } = await getAdminSupabase()
    .from("businesses")
    .select("id, name, fraud_warnings_enabled")
    .eq("status", "active")
    .ilike("name", `%${term}%`)
    .order("name")
    .limit(10);
  return (data ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    enabled: b.fraud_warnings_enabled !== false,
  }));
}
