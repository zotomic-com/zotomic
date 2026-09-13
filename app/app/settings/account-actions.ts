"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/app-actions";
import { hashPassword, comparePassword } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase";

export async function updateProfileAction(input: { name: string }): Promise<{ ok: true } | { error: string }> {
  const { user, db } = await requireUser();
  const name = input.name.trim();
  if (name.length < 2) return { error: "Name is required." };

  const { error } = await db.from("users").update({ name }).eq("id", user.id);
  if (error) return { error: "Could not save your name." };
  revalidatePath("/app/settings");
  return { ok: true };
}

async function verifyCurrentPassword(db: ReturnType<typeof getAdminSupabase>, userId: string, currentPassword: string) {
  const { data } = await db.from("users").select("password_hash").eq("id", userId).maybeSingle();
  if (!data?.password_hash) return { ok: false as const, error: "This account has no password set yet — set one below first." };
  const valid = await comparePassword(currentPassword, data.password_hash as string);
  if (!valid) return { ok: false as const, error: "Your current password is incorrect." };
  return { ok: true as const };
}

export async function updateEmailAction(input: { newEmail: string; currentPassword: string }): Promise<{ ok: true } | { error: string }> {
  const { user, db } = await requireUser();
  const newEmail = input.newEmail.trim().toLowerCase();
  if (!newEmail.includes("@")) return { error: "Enter a valid email address." };

  const check = await verifyCurrentPassword(db, user.id, input.currentPassword);
  if (!check.ok) return { error: check.error };

  const { data: existing } = await db.from("users").select("id").eq("email", newEmail).neq("id", user.id).maybeSingle();
  if (existing) return { error: "Another account already uses this email." };

  const { error } = await db.from("users").update({ email: newEmail }).eq("id", user.id);
  if (error) return { error: "Could not update your email." };
  revalidatePath("/app/settings");
  return { ok: true };
}

export async function updatePhoneAction(input: { newPhone: string; currentPassword: string }): Promise<{ ok: true } | { error: string }> {
  const { user, db } = await requireUser();
  const newPhone = input.newPhone.trim();
  if (!newPhone) return { error: "Enter a phone number." };

  const check = await verifyCurrentPassword(db, user.id, input.currentPassword);
  if (!check.ok) return { error: check.error };

  const { error } = await db.from("users").update({ phone: newPhone.slice(0, 32) }).eq("id", user.id);
  if (error) return { error: "Could not update your phone number." };
  revalidatePath("/app/settings");
  return { ok: true };
}

export async function updateAddressAction(input: { newAddress: string }): Promise<{ ok: true } | { error: string }> {
  const { user, db } = await requireUser();
  const { error } = await db.from("users").update({ address: input.newAddress.trim().slice(0, 300) || null }).eq("id", user.id);
  if (error) return { error: "Could not update your address." };
  revalidatePath("/app/settings");
  return { ok: true };
}

export async function changePasswordAction(input: {
  currentPassword?: string;
  newPassword: string;
}): Promise<{ ok: true } | { error: string }> {
  const { user, db } = await requireUser();
  if (input.newPassword.length < 8) return { error: "New password must be at least 8 characters." };

  const { data } = await db.from("users").select("password_hash").eq("id", user.id).maybeSingle();
  if (data?.password_hash) {
    if (!input.currentPassword) return { error: "Enter your current password." };
    const valid = await comparePassword(input.currentPassword, data.password_hash as string);
    if (!valid) return { error: "Your current password is incorrect." };
  }
  // A social-only account (no password_hash yet) can set one for the first time with no current-password check.

  const newHash = await hashPassword(input.newPassword);
  const { error } = await db.from("users").update({ password_hash: newHash }).eq("id", user.id);
  if (error) return { error: "Could not update your password." };
  return { ok: true };
}
