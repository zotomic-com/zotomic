/**
 * Which powers the admin assistant has been granted, + an audit trail for
 * everything it does with them. Toggled in /admin/assistants. Server-only.
 */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";
import { CAP_LABEL, type AdminCapability, type AssistantCaps } from "@/lib/ai/assistant-caps";

export { CAP_LABEL };
export type { AdminCapability, AssistantCaps };

const DEFAULTS: AssistantCaps = {
  media: true,
  files: false,
  git: false,
  git_merge: false,
  sql: false,
  deploy: false,
};

export async function getAssistantCaps(): Promise<AssistantCaps> {
  const { data } = await getAdminSupabase()
    .from("admin_assistant_settings")
    .select("cap_media, cap_files, cap_git, cap_git_merge, cap_sql, cap_deploy")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return { ...DEFAULTS };
  return {
    media: data.cap_media ?? DEFAULTS.media,
    files: data.cap_files ?? DEFAULTS.files,
    git: data.cap_git ?? DEFAULTS.git,
    git_merge: data.cap_git_merge ?? DEFAULTS.git_merge,
    sql: data.cap_sql ?? DEFAULTS.sql,
    deploy: data.cap_deploy ?? DEFAULTS.deploy,
  };
}

export async function hasCap(cap: AdminCapability): Promise<boolean> {
  return (await getAssistantCaps())[cap] === true;
}

export async function logAssistantAction(
  adminId: string | null,
  kind: string,
  summary: string,
  detail?: unknown,
  outcome = "ok",
): Promise<void> {
  try {
    await getAdminSupabase().from("admin_assistant_actions").insert({
      admin_id: adminId,
      kind,
      summary: summary.slice(0, 500),
      detail: detail ?? null,
      outcome: outcome.slice(0, 200),
    });
  } catch {
    /* audit is best-effort */
  }
}
