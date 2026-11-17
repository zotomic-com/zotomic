"use server";

/**
 * Admin actions for the Screenshot Organizer service — full add / edit /
 * delete over every session, group and item (admin sees all users' data).
 */
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-server";
import { getAdminSupabase } from "@/lib/supabase";

async function audit(adminId: string, action: string, summary: string, targetId?: string) {
  try {
    await getAdminSupabase().from("audit_logs").insert({
      actor_id: adminId,
      actor_type: "admin",
      action,
      target_type: "screenshot",
      target_id: targetId,
      summary,
    });
  } catch {
    /* audit must not break mutations */
  }
}

function revalidate() {
  revalidatePath("/admin/services/screenshots");
  revalidatePath("/services/screenshot-organizer");
}

export interface AdminItemPatch {
  name?: string;
  groupId?: string | null;
  details?: string;
  link?: string;
}

export async function updateScreenshotItemAction(sessionId: string, itemId: string, patch: AdminItemPatch) {
  const admin = await requireAdmin();
  const u: Record<string, unknown> = {};
  if (patch.name !== undefined) u.name = patch.name.trim().slice(0, 120) || "Screenshot";
  if (patch.groupId !== undefined) u.group_id = patch.groupId;
  if (patch.details !== undefined) u.details = patch.details.slice(0, 2000);
  if (patch.link !== undefined) u.link = patch.link.slice(0, 500);
  if (patch.link !== undefined) u.user_link = patch.link.slice(0, 500);
  const { error } = await getAdminSupabase().from("screenshot_items").update(u).eq("id", itemId).eq("session_id", sessionId);
  if (error) return { ok: false, error: error.message };
  await audit(admin.id, "services.screenshot_item_updated", `Screenshot item updated (${Object.keys(u).join(", ")})`, itemId);
  revalidate();
  return { ok: true };
}

export async function deleteScreenshotItemAction(sessionId: string, itemId: string) {
  const admin = await requireAdmin();
  const { error } = await getAdminSupabase().from("screenshot_items").delete().eq("id", itemId).eq("session_id", sessionId);
  if (error) return { ok: false, error: error.message };
  await audit(admin.id, "services.screenshot_item_deleted", "Screenshot item deleted", itemId);
  revalidate();
  return { ok: true };
}

export async function addScreenshotGroupAction(sessionId: string, name: string) {
  const admin = await requireAdmin();
  const clean = name.trim().slice(0, 60);
  if (!clean) return { ok: false, error: "Group name is empty." };
  const { error } = await getAdminSupabase().from("screenshot_groups").insert({ session_id: sessionId, name: clean, sort_order: 0 });
  if (error) return { ok: false, error: error.message };
  await audit(admin.id, "services.screenshot_group_added", `Group "${clean}" added`, sessionId);
  revalidate();
  return { ok: true };
}

export async function renameScreenshotGroupAction(sessionId: string, groupId: string, name: string) {
  const admin = await requireAdmin();
  const clean = name.trim().slice(0, 60);
  if (!clean) return { ok: false, error: "Group name is empty." };
  const { error } = await getAdminSupabase().from("screenshot_groups").update({ name: clean }).eq("id", groupId).eq("session_id", sessionId);
  if (error) return { ok: false, error: error.message };
  await audit(admin.id, "services.screenshot_group_renamed", `Group renamed to "${clean}"`, groupId);
  revalidate();
  return { ok: true };
}

export async function deleteScreenshotGroupAction(sessionId: string, groupId: string) {
  const admin = await requireAdmin();
  const { error } = await getAdminSupabase().from("screenshot_groups").delete().eq("id", groupId).eq("session_id", sessionId);
  if (error) return { ok: false, error: error.message };
  await audit(admin.id, "services.screenshot_group_deleted", "Screenshot group deleted", groupId);
  revalidate();
  return { ok: true };
}

export async function deleteScreenshotSessionAction(sessionId: string) {
  const admin = await requireAdmin();
  const { error } = await getAdminSupabase().from("screenshot_sessions").delete().eq("id", sessionId);
  if (error) return { ok: false, error: error.message };
  await audit(admin.id, "services.screenshot_session_deleted", "Screenshot session deleted", sessionId);
  revalidate();
  return { ok: true };
}

/** Data loader for the manager UI (server-side read). */
export async function loadSessionDataAction(
  sessionId: string,
): Promise<{ ok: boolean; error?: string; groups?: Array<{ id: string; name: string }>; items?: unknown[] }> {
  await requireAdmin();
  const db = getAdminSupabase();
  const [{ data: groups, error: ge }, { data: items, error: ie }] = await Promise.all([
    db.from("screenshot_groups").select("id, name").eq("session_id", sessionId).order("sort_order"),
    db.from("screenshot_items").select("id, session_id, group_id, name, details, user_link, thumb, analysis, recovered_links, status, error, created_at").eq("session_id", sessionId).order("created_at"),
  ]);
  if (ge || ie) return { ok: false, error: ge?.message ?? ie?.message };
  return { ok: true, groups: groups ?? [], items: items ?? [] };
}
