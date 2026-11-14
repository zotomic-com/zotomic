"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-server";
import { getAdminSupabase } from "@/lib/supabase";
import {
  createServiceToken,
  updateServiceToken,
  deleteServiceToken,
  listServiceTokens,
} from "@/lib/services/tool-tokens";
import {
  upsertServiceAccess,
  deleteServiceAccess,
} from "@/lib/services/tool-access";
import { updateServiceCard } from "@/lib/service-cards";

async function audit(adminId: string, action: string, summary: string, targetId?: string) {
  await getAdminSupabase().from("audit_logs").insert({
    actor_id: adminId,
    action,
    summary,
    target_id: targetId ?? null,
  });
}

function revalidateServices() {
  revalidatePath("/admin/services");
  revalidatePath("/admin/services/tokens");
  revalidatePath("/admin/services/access");
  revalidatePath("/services/text-to-audio");
  revalidatePath("/services/online-downloader");
}

/* ── tokens ──────────────────────────────────────────────────────────────── */

export async function createServiceTokenAction(input: {
  userEmail: string;
  label?: string;
  services: "downloader" | "text_to_audio" | "both";
  dailyLimit?: number | null;
  expiresAt?: string | null;
}): Promise<{ ok: boolean; token?: string; error?: string }> {
  const admin = await requireAdmin();
  const email = input.userEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Enter a valid user email." };
  }
  const { token } = await createServiceToken({
    userEmail: email,
    label: input.label,
    services: input.services,
    dailyLimit: input.dailyLimit ?? null,
    expiresAt: input.expiresAt || null,
  });
  await audit(admin.id, "services.token_created", `Service token created for ${email}`, email);
  revalidateServices();
  return { ok: true, token };
}

export async function updateServiceTokenAction(
  id: string,
  patch: {
    label?: string | null;
    services?: "downloader" | "text_to_audio" | "both";
    status?: "active" | "revoked";
    dailyLimit?: number | null;
    expiresAt?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  await updateServiceToken(id, patch);
  await audit(admin.id, "services.token_updated", `Service token updated (${patch.status ?? "edited"})`, id);
  revalidateServices();
  return { ok: true };
}

export async function deleteServiceTokenAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  await deleteServiceToken(id);
  await audit(admin.id, "services.token_deleted", "Service token deleted", id);
  revalidateServices();
  return { ok: true };
}

export async function listServiceTokensAction() {
  await requireAdmin();
  return listServiceTokens();
}

/** Admin "reveal" — returns the full plaintext token for copying. */
export async function revealServiceTokenAction(id: string): Promise<string | null> {
  await requireAdmin();
  const { data } = await getAdminSupabase()
    .from("service_tokens")
    .select("token")
    .eq("id", id)
    .maybeSingle();
  return (data?.token as string) ?? null;
}

/* ── access ──────────────────────────────────────────────────────────────── */

export async function upsertServiceAccessAction(input: {
  userEmail: string;
  service: "downloader" | "text_to_audio" | "both";
  mode: "plan" | "allow" | "block";
  dailyLimit?: number | null;
  maxQuality?: string | null;
  note?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  const email = input.userEmail.trim().toLowerCase();
  if (!/^[^@\s]+(,[^@\s]+)*$/.test(email.replace(/\s/g, "").replace(/,/g, ","))) {
    return { ok: false, error: "Enter one or more valid emails separated by commas." };
  }
  if (input.mode === "allow" && (input.dailyLimit == null || input.dailyLimit < 1)) {
    return { ok: false, error: "Explicit grants need a daily limit (1 or more)." };
  }
  await upsertServiceAccess(
    { ...input, userEmail: email },
    admin.id,
  );
  await audit(admin.id, "services.access_updated", `Access for ${email} set to ${input.mode}`, email);
  revalidateServices();
  return { ok: true };
}

export async function deleteServiceAccessAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  await deleteServiceAccess(id);
  await audit(admin.id, "services.access_deleted", "Access rule removed", id);
  revalidateServices();
  return { ok: true };
}

/* ── service cards (enable/disable the public cards) ─────────────────────── */

export async function setServiceToolLiveAction(
  id: string,
  href: string,
  live: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  await updateServiceCard(id, {
    status: live ? "live" : "coming_soon",
    href: live ? href : null,
  });
  await audit(
    admin.id,
    live ? "services.tool_live" : "services.tool_disabled",
    `${href} set ${live ? "live" : "to coming soon"}`,
    id,
  );
  revalidateServices();
  revalidatePath("/services");
  return { ok: true };
}
