/**
 * Admin-assistant skills — saved playbooks (a starter library + the admin's
 * own). When a message hits a skill's trigger phrases, the skill's instructions
 * are injected into the system prompt for that turn. Server-only.
 */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";

export interface AdminSkill {
  id: string;
  slug: string;
  name: string;
  triggers: string[];
  instructions: string;
  builtin: boolean;
  enabled: boolean;
}

export async function listSkills(): Promise<AdminSkill[]> {
  const { data } = await getAdminSupabase()
    .from("admin_assistant_skills")
    .select("id, slug, name, triggers, instructions, builtin, enabled")
    .order("builtin", { ascending: false })
    .order("name", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    triggers: (r.triggers as string[]) ?? [],
    instructions: r.instructions as string,
    builtin: !!r.builtin,
    enabled: !!r.enabled,
  }));
}

export async function getEnabledSkills(): Promise<AdminSkill[]> {
  return (await listSkills()).filter((s) => s.enabled);
}

/** Skills whose trigger phrases appear in the message (longest match wins first). */
export function matchSkills(message: string, skills: AdminSkill[]): AdminSkill[] {
  const m = ` ${message.toLowerCase()} `;
  return skills
    .map((s) => {
      const hit = s.triggers
        .filter((t) => t && m.includes(t.toLowerCase()))
        .sort((a, b) => b.length - a.length)[0];
      return hit ? { skill: s, hit } : null;
    })
    .filter((x): x is { skill: AdminSkill; hit: string } => !!x)
    .sort((a, b) => b.hit.length - a.hit.length)
    .slice(0, 2)
    .map((x) => x.skill);
}

export function skillsSystemAppendix(skills: AdminSkill[]): string {
  if (!skills.length) return "";
  return (
    "\n\nACTIVE SKILL — the admin's request matches a saved playbook. Follow it for this turn:\n" +
    skills.map((s) => `### ${s.name}\n${s.instructions}`).join("\n\n")
  );
}
