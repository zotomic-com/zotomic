/**
 * service_access — per-user access control for the two service tools.
 * mode 'plan' = follow subscription plan defaults, 'allow' = explicit grant
 * (optionally with custom daily limit / max quality), 'block' = denied.
 */
import { getAdminSupabase } from "@/lib/supabase";

export interface ServiceAccessRow {
  id: string;
  userEmail: string;
  service: "downloader" | "text_to_audio" | "video_generator";
  mode: "plan" | "allow" | "block";
  dailyLimit: number | null;
  maxQuality: string | null;
  note: string | null;
  updatedAt: string;
}

function rowToAccess(r: Record<string, unknown>): ServiceAccessRow {
  return {
    id: r.id as string,
    userEmail: r.user_email as string,
    service: r.service as ServiceAccessRow["service"],
    mode: (r.mode as ServiceAccessRow["mode"]) ?? "plan",
    dailyLimit: (r.daily_limit as number) ?? null,
    maxQuality: (r.max_quality as string) ?? null,
    note: (r.note as string) ?? null,
    updatedAt: r.updated_at as string,
  };
}

export async function listServiceAccess(): Promise<ServiceAccessRow[]> {
  const { data } = await getAdminSupabase()
    .from("service_access")
    .select("*")
    .order("user_email", { ascending: true });
  return (data ?? []).map(rowToAccess);
}

export interface AccessInput {
  userEmail: string;
  service: "downloader" | "text_to_audio" | "video_generator" | "both" | "all";
  mode: "plan" | "allow" | "block";
  dailyLimit?: number | null;
  maxQuality?: string | null;
  note?: string | null;
}

export async function upsertServiceAccess(
  input: AccessInput,
  updatedBy: string,
): Promise<void> {
  const db = getAdminSupabase();
  const emails = input.userEmail
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const services: Array<"downloader" | "text_to_audio" | "video_generator"> =
    input.service === "both"
      ? ["downloader", "text_to_audio"]
      : input.service === "all"
        ? ["downloader", "text_to_audio", "video_generator"]
        : [input.service];

  for (const email of emails) {
    for (const service of services) {
      const values = {
        user_email: email,
        service,
        mode: input.mode,
        daily_limit: input.dailyLimit ?? null,
        max_quality: input.maxQuality?.trim() || null,
        note: input.note?.trim().slice(0, 300) || null,
        updated_by: updatedBy,
      };
      await db.from("service_access").upsert(values, { onConflict: "user_email,service" });
    }
  }
}

export async function deleteServiceAccess(id: string) {
  await getAdminSupabase().from("service_access").delete().eq("id", id);
}
