"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { requireAdmin } from "@/lib/admin-server";
import { getAdminSupabase } from "@/lib/supabase";
import { hashPassword, signToken } from "@/lib/auth";
import { AUTH_COOKIE } from "@/lib/auth-server";
import { invalidateBlockedIpCache } from "@/lib/admin/security";

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const ROLES = ["owner", "staff", "admin"] as const;

function tempPassword(): string {
  return "Zt-" + randomBytes(6).toString("base64url");
}

async function audit(adminId: string, action: string, summary: string, targetId?: string) {
  await getAdminSupabase().from("audit_logs").insert({
    actor_id: adminId,
    actor_type: "admin",
    action,
    target_type: "user",
    target_id: targetId ?? null,
    summary: `Admin: ${summary}`,
  });
}

export async function createUser(form: {
  name: string;
  email: string;
  role: string;
  password?: string;
}): Promise<{ ok: true; password: string } | { error: string }> {
  const admin = await requireAdmin();
  const name = form.name.trim().slice(0, 120);
  const email = form.email.trim().toLowerCase();
  const role = (ROLES as readonly string[]).includes(form.role) ? form.role : "owner";
  if (name.length < 2) return { error: "Enter a name." };
  if (!emailOk(email)) return { error: "Enter a valid email." };

  const db = getAdminSupabase();
  const { data: existing } = await db.from("users").select("id").eq("email", email).maybeSingle();
  if (existing) return { error: "A user with this email already exists." };

  const password = form.password && form.password.length >= 8 ? form.password : tempPassword();
  const { data, error } = await db
    .from("users")
    .insert({ name, email, role, status: "active", password_hash: await hashPassword(password) })
    .select("id")
    .single();
  if (error || !data) return { error: "Could not create the user." };

  await audit(admin.id, "user.created", `Created ${email} (${role})`, data.id as string);
  revalidatePath("/admin/users");
  return { ok: true, password };
}

export async function updateUser(
  id: string,
  patch: { name?: string; email?: string; role?: string; notes?: string },
): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) {
    if (patch.name.trim().length < 2) return { error: "Name too short." };
    row.name = patch.name.trim().slice(0, 120);
  }
  if (patch.email !== undefined) {
    const email = patch.email.trim().toLowerCase();
    if (!emailOk(email)) return { error: "Invalid email." };
    const { data: clash } = await db.from("users").select("id").eq("email", email).neq("id", id).maybeSingle();
    if (clash) return { error: "Another user already has that email." };
    row.email = email;
  }
  if (patch.role !== undefined) {
    if (!(ROLES as readonly string[]).includes(patch.role)) return { error: "Bad role." };
    if (id === admin.id && patch.role !== "admin") return { error: "You can't remove your own admin role." };
    row.role = patch.role;
  }
  if (patch.notes !== undefined) row.notes = patch.notes.trim().slice(0, 2000) || null;

  const { error } = await db.from("users").update(row).eq("id", id);
  if (error) return { error: "Could not save." };
  await audit(admin.id, "user.updated", `Updated user ${id}`, id);
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
  return { ok: true };
}

export async function setUserStatus(id: string, status: "active" | "suspended"): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  if (id === admin.id) return { error: "You can't suspend your own account." };
  const db = getAdminSupabase();
  const { error } = await db.from("users").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "Could not save." };
  await audit(admin.id, "user.status", `User ${id} → ${status}`, id);
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
  return { ok: true };
}

export async function setUserBlocked(
  id: string,
  blocked: boolean,
  opts: { reason?: string; alsoBlockIp?: boolean } = {},
): Promise<{ ok: true; blockedIp?: string } | { error: string }> {
  const admin = await requireAdmin();
  if (id === admin.id) return { error: "You can't block your own account." };
  const db = getAdminSupabase();
  const { data: u } = await db.from("users").select("email, last_ip").eq("id", id).maybeSingle();
  const { error } = await db
    .from("users")
    .update({
      blocked,
      blocked_reason: blocked ? opts.reason?.trim().slice(0, 300) || "Blocked by Zotomic." : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: "Could not save." };

  let blockedIp: string | undefined;
  if (blocked && opts.alsoBlockIp && u?.last_ip) {
    await db
      .from("blocked_ips")
      .upsert({ ip: u.last_ip as string, reason: `User ${u.email}`, blocked_by: admin.id }, { onConflict: "ip" });
    invalidateBlockedIpCache();
    blockedIp = u.last_ip as string;
  }

  await audit(admin.id, "user.blocked", `User ${id} ${blocked ? "blocked" : "unblocked"}${blockedIp ? ` + IP ${blockedIp}` : ""}`, id);
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
  return { ok: true, blockedIp };
}

export async function resetUserPassword(id: string): Promise<{ ok: true; password: string } | { error: string }> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const password = tempPassword();
  const { error } = await db
    .from("users")
    .update({ password_hash: await hashPassword(password), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "Could not reset." };
  await audit(admin.id, "user.password_reset", `Reset password for user ${id}`, id);
  return { ok: true, password };
}

export async function deleteUser(id: string, confirmEmail: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  if (id === admin.id) return { error: "You can't delete your own account." };
  const db = getAdminSupabase();
  const { data: u } = await db.from("users").select("email").eq("id", id).maybeSingle();
  if (!u) return { error: "User not found." };
  if (confirmEmail.trim().toLowerCase() !== (u.email as string)) return { error: "Type the exact email to confirm." };

  // block deletion of a user who solely owns a business
  const { data: owned } = await db.from("business_members").select("business_id").eq("user_id", id).eq("role", "owner");
  for (const m of owned ?? []) {
    const { count } = await db
      .from("business_members")
      .select("user_id", { count: "exact", head: true })
      .eq("business_id", m.business_id as string)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) {
      return { error: "This user is the only owner of a store. Delete or reassign that store first, or suspend the user instead." };
    }
  }

  const { error } = await db.from("users").delete().eq("id", id);
  if (error) return { error: "Could not delete." };
  await audit(admin.id, "user.deleted", `Deleted user ${u.email}`, id);
  revalidatePath("/admin/users");
  return { ok: true };
}

/** Sign in as this user for support. Heavily audited; short session. */
export async function impersonateUser(id: string): Promise<{ ok: true; redirect: string } | { error: string }> {
  const admin = await requireAdmin();
  if (id === admin.id) return { error: "That's you." };
  const db = getAdminSupabase();
  const { data: u } = await db.from("users").select("id, name, email, role, status, blocked").eq("id", id).maybeSingle();
  if (!u) return { error: "User not found." };
  if (u.role === "admin") return { error: "Refusing to impersonate another admin." };
  if (u.status === "suspended" || u.blocked) return { error: "This account is suspended or blocked." };

  const token = await signToken({ id: u.id as string, email: u.email as string, role: u.role as string, name: u.name as string });
  (await cookies()).set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 2,
    path: "/",
  });
  await audit(admin.id, "user.impersonation_started", `${admin.email} signed in as ${u.email}`, id);
  return { ok: true, redirect: (u.role as string) === "owner" || (u.role as string) === "staff" ? "/app" : "/" };
}

export async function blockIp(ip: string, reason: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const clean = ip.trim();
  if (!/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(clean)) return { error: "Enter an IPv4 address or CIDR (e.g. 203.0.113.4 or 203.0.113.0/24)." };
  const db = getAdminSupabase();
  const { error } = await db
    .from("blocked_ips")
    .upsert({ ip: clean, reason: reason.trim().slice(0, 200) || null, blocked_by: admin.id }, { onConflict: "ip" });
  if (error) return { error: "Could not block." };
  invalidateBlockedIpCache();
  await audit(admin.id, "ip.blocked", `Blocked IP ${clean}`);
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function unblockIp(id: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const db = getAdminSupabase();
  const { data: row } = await db.from("blocked_ips").select("ip").eq("id", id).maybeSingle();
  await db.from("blocked_ips").delete().eq("id", id);
  invalidateBlockedIpCache();
  await audit(admin.id, "ip.unblocked", `Unblocked IP ${row?.ip ?? id}`);
  revalidatePath("/admin/users");
  return { ok: true };
}
