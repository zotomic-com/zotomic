/**
 * ANIMATION LIBRARY (server-only).
 *
 * The write-once-verify-once store for AI-written stick-figure animations.
 * Every AI-authored animation lands here as "pending" (it rendered the video
 * it was written for); an admin approves it in /admin/services/anims and it
 * becomes a permanent library entry that later videos reuse WITHOUT a Gemini
 * call. Rejected anims stay for reference but never render again.
 *
 * Table: anim_library (see supabase/anim_library.sql)
 */
import "server-only";
import { getAdminSupabase } from "@/lib/supabase";

export interface AnimLibraryRow {
  id: string;
  slug: string;
  keywords: string[];
  definition: {
    slug: string;
    keywords: string[];
    loop: boolean;
    cycle?: number;
    frames: { u: number; pose: Record<string, unknown> }[];
  };
  status: "pending" | "approved" | "rejected";
  checks: { authored: number; rejected: string[]; sceneTitle?: string; visual?: string };
  created_by: string | null;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

/** Approved library animations whose keywords match any of the scene texts. */
export async function findApprovedAnims(sceneTexts: string[]): Promise<AnimLibraryRow[]> {
  const db = getAdminSupabase();
  const { data, error } = await db
    .from("anim_library")
    .select("*")
    .eq("status", "approved")
    .limit(200);
  if (error || !data?.length) return [];
  // word-boundary keyword match against each scene's text
  return data.filter((row: AnimLibraryRow) =>
    (row.keywords ?? []).some((k) =>
      sceneTexts.some((t) => new RegExp(`\\b${String(k).replace(/[^a-z0-9 ']/g, ".")}\\b`, "i").test(t)),
    ),
  );
}

/** Insert (or refresh) a pending animation after a successful author+debug pass. */
export async function savePendingAnim(input: {
  slug: string;
  definition: AnimLibraryRow["definition"];
  checks: AnimLibraryRow["checks"];
  createdBy: string | null;
}): Promise<void> {
  const db = getAdminSupabase();
  await db.from("anim_library").upsert(
    {
      slug: input.slug,
      keywords: input.definition.keywords,
      definition: input.definition,
      status: "pending",
      checks: input.checks,
      created_by: input.createdBy,
      decided_at: null,
      decided_by: null,
    },
    { onConflict: "slug" },
  );
}

/** Admin queue listing. */
export async function listAnims(status?: string): Promise<AnimLibraryRow[]> {
  const db = getAdminSupabase();
  let q = db.from("anim_library").select("*").order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  return error ? [] : (data as AnimLibraryRow[]);
}

export async function setAnimStatus(id: string, status: "approved" | "rejected", adminId: string): Promise<boolean> {
  const db = getAdminSupabase();
  const { error } = await db
    .from("anim_library")
    .update({ status, decided_at: new Date().toISOString(), decided_by: adminId })
    .eq("id", id);
  return !error;
}

export async function deleteAnim(id: string): Promise<boolean> {
  const db = getAdminSupabase();
  const { error } = await db.from("anim_library").delete().eq("id", id);
  return !error;
}
