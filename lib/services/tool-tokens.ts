/**
 * Service tokens — platform-issued access tokens for the two service tools.
 * Only admins can create/edit/delete them (see app/admin/services/actions.ts);
 * users can see and use tokens addressed to their email, never generate.
 */
import crypto from "crypto";
import { getAdminSupabase } from "@/lib/supabase";

export interface ServiceToken {
  id: string;
  prefix: string;
  label: string | null;
  userEmail: string;
  services: "downloader" | "text_to_audio" | "video_generator" | "screenshot_organizer" | "both" | "all";
  status: "active" | "revoked";
  dailyLimit: number | null;
  expiresAt: string | null;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

function rowToToken(r: Record<string, unknown>): ServiceToken {
  return {
    id: r.id as string,
    prefix: (r.prefix as string) ?? "",
    label: (r.label as string) ?? null,
    userEmail: r.user_email as string,
    services: (r.services as ServiceToken["services"]) ?? "both",
    status: (r.status as ServiceToken["status"]) ?? "active",
    dailyLimit: (r.daily_limit as number) ?? null,
    expiresAt: (r.expires_at as string) ?? null,
    usageCount: (r.usage_count as number) ?? 0,
    lastUsedAt: (r.last_used_at as string) ?? null,
    createdAt: r.created_at as string,
  };
}

export async function listServiceTokens(): Promise<ServiceToken[]> {
  const { data } = await getAdminSupabase()
    .from("service_tokens")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToToken);
}

/** All active tokens addressed to one email (read-only "my tokens" view). */
export async function listMyServiceTokens(email: string): Promise<Array<ServiceToken & { token: string }>> {
  const { data } = await getAdminSupabase()
    .from("service_tokens")
    .select("*")
    .eq("user_email", email)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({ ...rowToToken(r), token: r.token as string }));
}

export interface CreateTokenInput {
  userEmail: string;
  label?: string;
  services: "downloader" | "text_to_audio" | "video_generator" | "screenshot_organizer" | "both" | "all";
  dailyLimit?: number | null;
  expiresAt?: string | null;
}

/** Generate `zt_` + 40 hex chars. Returns the plaintext once — admins can also reveal it later. */
export async function createServiceToken(input: CreateTokenInput): Promise<{ token: string }> {
  const token = `zt_${crypto.randomBytes(20).toString("hex")}`;
  await getAdminSupabase().from("service_tokens").insert({
    token,
    prefix: token.slice(0, 12),
    label: input.label?.trim().slice(0, 80) || null,
    user_email: input.userEmail.trim().toLowerCase(),
    services: input.services,
    daily_limit: input.dailyLimit ?? null,
    expires_at: input.expiresAt || null,
  });
  return { token };
}

export interface UpdateTokenPatch {
  label?: string | null;
  services?: "downloader" | "text_to_audio" | "video_generator" | "screenshot_organizer" | "both" | "all";
  status?: "active" | "revoked";
  dailyLimit?: number | null;
  expiresAt?: string | null;
}

export async function updateServiceToken(id: string, patch: UpdateTokenPatch) {
  const update: Record<string, unknown> = {};
  if (patch.label !== undefined) update.label = patch.label?.trim().slice(0, 80) || null;
  if (patch.services !== undefined) update.services = patch.services;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.dailyLimit !== undefined) update.daily_limit = patch.dailyLimit;
  if (patch.expiresAt !== undefined) update.expires_at = patch.expiresAt || null;
  await getAdminSupabase().from("service_tokens").update(update).eq("id", id);
}

export async function deleteServiceToken(id: string) {
  await getAdminSupabase().from("service_tokens").delete().eq("id", id);
}
