"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-server";
import { getAdminSupabase } from "@/lib/supabase";
import { signToken } from "@/lib/auth";
import { AUTH_COOKIE } from "@/lib/auth-server";

async function audit(businessId: string, adminId: string, action: string, summary: string) {
  const db = getAdminSupabase();
  await db.from("audit_logs").insert({
    business_id: businessId,
    actor_id: adminId,
    actor_type: "admin",
    action,
    target_type: "business",
    target_id: businessId,
    summary,
  });
}

export async function adminUpdateBusiness(businessId: string, form: FormData) {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const patch = {
    name: String(form.get("name") ?? "").trim().slice(0, 120),
    type: String(form.get("type") ?? "").trim() || null,
    currency: String(form.get("currency") ?? "BDT").toUpperCase().slice(0, 3),
    timezone: String(form.get("timezone") ?? "Asia/Dhaka"),
    status: String(form.get("status") ?? "active") === "suspended" ? "suspended" : "active",
  };
  if (patch.name.length < 2) return { error: "Name required" };
  await db.from("businesses").update(patch).eq("id", businessId);
  await audit(businessId, admin.id, "admin.business_updated", `Updated ${patch.name} (${patch.status})`);
  revalidatePath(`/admin/tenants/${businessId}`);
  return { ok: true };
}

export async function adminSetFeature(businessId: string, feature: string, enabled: boolean) {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const { data: biz } = await db.from("businesses").select("feature_overrides").eq("id", businessId).single();
  const overrides = { ...((biz?.feature_overrides as Record<string, unknown>) ?? {}) };
  if (enabled) overrides[feature] = true;
  else delete overrides[feature];
  await db.from("businesses").update({ feature_overrides: overrides }).eq("id", businessId);
  await audit(businessId, admin.id, "admin.feature_toggled", `${feature} = ${enabled}`);
  revalidatePath(`/admin/tenants/${businessId}`);
  return { ok: true };
}

export async function adminSetSubscription(businessId: string, form: FormData) {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const plan = String(form.get("plan") ?? "free");
  const status = String(form.get("status") ?? "active");
  const extendDays = Number(form.get("extendDays") ?? 0);

  const { data: sub } = await db.from("subscriptions").select("id, current_period_end").eq("business_id", businessId).maybeSingle();
  const base = sub?.current_period_end ? new Date(sub.current_period_end + "T00:00:00Z") : new Date();
  if (extendDays > 0) base.setDate(base.getDate() + extendDays);

  const values = {
    plan: ["free", "business", "pro"].includes(plan) ? plan : "free",
    status: ["active", "grace", "soft_lock", "hard_lock", "cancelled"].includes(status) ? status : "active",
    current_period_end: extendDays > 0 ? base.toISOString().slice(0, 10) : sub?.current_period_end ?? null,
    updated_at: new Date().toISOString(),
  };

  if (sub) await db.from("subscriptions").update(values).eq("id", sub.id);
  else await db.from("subscriptions").insert({ business_id: businessId, ...values, current_period_start: new Date().toISOString().slice(0, 10) });

  await audit(businessId, admin.id, "admin.subscription_updated", `plan=${values.plan} status=${values.status}${extendDays ? ` +${extendDays}d` : ""}`);
  revalidatePath(`/admin/tenants/${businessId}`);
  revalidatePath("/admin/subscriptions");
  return { ok: true };
}

export async function adminUnpublishStore(businessId: string) {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  await db.from("storefront_config").update({ published_at: null }).eq("business_id", businessId);
  await audit(businessId, admin.id, "admin.storefront_unpublished", "Storefront taken offline by admin");
  revalidatePath(`/admin/tenants/${businessId}`);
  return { ok: true };
}

/** Sign in as the business owner for support. Heavily audited. */
export async function adminImpersonate(businessId: string) {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const { data: member } = await db
    .from("business_members")
    .select("users(id, name, email, role)")
    .eq("business_id", businessId)
    .eq("role", "owner")
    .maybeSingle();
  const owner = (Array.isArray(member?.users) ? member?.users[0] : member?.users) as
    | { id: string; name: string; email: string; role: string }
    | null;
  if (!owner) return { error: "No owner found for this business" };

  const token = await signToken({ id: owner.id, email: owner.email, role: owner.role, name: owner.name });
  (await cookies()).set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 2, // short session
    path: "/",
  });

  await audit(businessId, admin.id, "admin.impersonation_started", `${admin.email} signed in as ${owner.email}`);
  return { ok: true, redirect: "/app" };
}

export async function adminDeleteBusiness(businessId: string, confirmName: string) {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const { data: biz } = await db.from("businesses").select("name").eq("id", businessId).single();
  if (!biz || confirmName.trim() !== biz.name) return { error: "Type the exact business name to confirm." };
  await audit(businessId, admin.id, "admin.business_deleted", `Deleted "${biz.name}"`);
  await db.from("businesses").delete().eq("id", businessId); // cascades
  revalidatePath("/admin/tenants");
  return { ok: true, deleted: true };
}
