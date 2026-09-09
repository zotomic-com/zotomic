import "server-only";
import { getAdminSupabase } from "@/lib/supabase";
import { normalizePhone, normalizeEmail } from "./phone";
import type { RiskResult } from "./detect";

export interface FraudFlag {
  id: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  stage: number;
  category: string;
  reason: string | null;
  evidence: Record<string, unknown>;
  stores: { businessId: string; name: string; orders?: number; cancelled?: number; returned?: number; deliveryFailures?: number }[];
  autoScore: number | null;
  source: "auto" | "manual" | "report";
  status: "active" | "cleared";
  lastActivityAt: string | null;
  createdAt: string;
}

function rowToFlag(r: Record<string, unknown>): FraudFlag {
  return {
    id: r.id as string,
    phone: (r.phone as string) ?? null,
    email: (r.email as string) ?? null,
    name: (r.name as string) ?? null,
    stage: Number(r.stage ?? 1),
    category: (r.category as string) ?? "other",
    reason: (r.reason as string) ?? null,
    evidence: (r.evidence as Record<string, unknown>) ?? {},
    stores: Array.isArray(r.stores) ? (r.stores as FraudFlag["stores"]) : [],
    autoScore: r.auto_score != null ? Number(r.auto_score) : null,
    source: (r.source as FraudFlag["source"]) ?? "auto",
    status: (r.status as FraudFlag["status"]) ?? "active",
    lastActivityAt: (r.last_activity_at as string) ?? null,
    createdAt: r.created_at as string,
  };
}

export async function getActiveFlagByPhone(phoneRaw: string): Promise<FraudFlag | null> {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return null;
  const { data } = await getAdminSupabase()
    .from("fraud_flags")
    .select("*")
    .eq("phone", phone)
    .eq("status", "active")
    .maybeSingle();
  return data ? rowToFlag(data) : null;
}

export async function getActiveFlagByEmail(emailRaw: string): Promise<FraudFlag | null> {
  const email = normalizeEmail(emailRaw);
  if (!email) return null;
  const { data } = await getAdminSupabase()
    .from("fraud_flags")
    .select("*")
    .ilike("email", email)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return data ? rowToFlag(data) : null;
}

/** Scanner path — create/refresh an auto flag; never override a manual one. */
export async function upsertAutoFlag(risk: RiskResult): Promise<void> {
  const db = getAdminSupabase();
  const { data: existing } = await db
    .from("fraud_flags")
    .select("id, source, stage, status")
    .eq("phone", risk.phone)
    .maybeSingle();

  const category = risk.signals.includes("cross_store")
    ? "cross_store"
    : risk.signals.includes("cancellations")
      ? "cancellations"
      : risk.signals.includes("returns")
        ? "returns"
        : risk.signals.includes("delivery_failures")
          ? "delivery_failures"
          : "other";
  const reason =
    `Auto: ${risk.cancellationRate}% cancelled of ${risk.totalOrders} orders` +
    (risk.returnRate ? `, ${risk.returnRate}% returned` : "") +
    (risk.deliveryFailures ? `, ${risk.deliveryFailures} failed deliveries` : "") +
    (risk.storeCount >= 2 ? `, across ${risk.storeCount} stores` : "");

  const evidence = {
    totalOrders: risk.totalOrders,
    cancelled: risk.cancelled,
    returned: risk.returned,
    deliveryFailures: risk.deliveryFailures,
    cancellationRate: risk.cancellationRate,
    returnRate: risk.returnRate,
    storeCount: risk.storeCount,
    signals: risk.signals,
  };

  if (existing) {
    const patch: Record<string, unknown> = {
      evidence,
      stores: risk.stores,
      auto_score: risk.score,
      last_activity_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    // only the scanner may move an auto flag's stage; leave manual ones alone
    if (existing.source === "auto" && existing.status === "active") {
      patch.stage = Math.max(Number(existing.stage), risk.suggestedStage);
      patch.category = category;
      patch.reason = reason;
      if (risk.name) patch.name = risk.name;
      if (risk.email) patch.email = risk.email;
    }
    await db.from("fraud_flags").update(patch).eq("id", existing.id);
    return;
  }

  await db.from("fraud_flags").insert({
    phone: risk.phone,
    email: risk.email,
    name: risk.name,
    stage: risk.suggestedStage,
    category,
    reason,
    evidence,
    stores: risk.stores,
    auto_score: risk.score,
    source: "auto",
    first_seen_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
  });
}

interface SetStageInput {
  stage: 1 | 2 | 3;
  reason?: string;
  category?: string;
  adminId: string;
}

/** Admin path — mark a person Watch / Suspect / Blacklist (creates if new). */
export async function setFraudStage(
  ref: { flagId?: string; phone?: string; email?: string; name?: string },
  input: SetStageInput,
): Promise<{ ok: true; flagId: string } | { error: string }> {
  const db = getAdminSupabase();
  let flag: { id: string } | null = null;

  if (ref.flagId) {
    const { data } = await db.from("fraud_flags").select("id").eq("id", ref.flagId).maybeSingle();
    flag = data ?? null;
  } else if (ref.phone) {
    const phone = normalizePhone(ref.phone);
    if (!phone) return { error: "Invalid phone number." };
    const { data } = await db.from("fraud_flags").select("id").eq("phone", phone).eq("status", "active").maybeSingle();
    flag = data ?? null;
    if (!flag) {
      const { data: created, error } = await db
        .from("fraud_flags")
        .insert({
          phone,
          email: normalizeEmail(ref.email),
          name: ref.name ?? null,
          stage: input.stage,
          category: input.category ?? "other",
          reason: input.reason ?? null,
          source: "manual",
          created_by: input.adminId,
          first_seen_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error || !created) return { error: "Could not create the flag." };
      return { ok: true, flagId: created.id as string };
    }
  } else {
    return { error: "Give a phone number or an existing flag id." };
  }
  if (!flag) return { error: "Flag not found." };

  const patch: Record<string, unknown> = {
    stage: input.stage,
    source: "manual",
    status: "active",
    created_by: input.adminId,
    updated_at: new Date().toISOString(),
  };
  if (input.reason !== undefined) patch.reason = input.reason;
  if (input.category !== undefined) patch.category = input.category;
  await db.from("fraud_flags").update(patch).eq("id", flag.id);
  return { ok: true, flagId: flag.id };
}

export async function clearFraudFlag(flagId: string, adminId: string): Promise<{ ok: true } | { error: string }> {
  const { error } = await getAdminSupabase()
    .from("fraud_flags")
    .update({ status: "cleared", cleared_by: adminId, updated_at: new Date().toISOString() })
    .eq("id", flagId);
  return error ? { error: "Could not clear." } : { ok: true };
}

export { rowToFlag };
