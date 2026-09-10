/**
 * Which powers the admin assistant has been granted, + an audit trail for
 * everything it does with them. Toggled in /admin/assistants. Server-only.
 */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";
import type { AdminCapability } from "@/lib/tools/admin-registry";

export interface AssistantCaps {
  media: boolean;
  files: boolean;
  git: boolean;
  git_merge: boolean;
  sql: boolean;
  deploy: boolean;
}

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

export const CAP_LABEL: Record<AdminCapability, string> = {
  media: "Understand images, voice & video",
  files: "Read & write the shared workspace",
  git: "Open a branch + pull request",
  git_merge: "Merge a pull request (→ production)",
  sql: "Run SQL migrations on the database",
  deploy: "Trigger a Vercel deployment",
};

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
