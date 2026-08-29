"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-server";
import { getAdminSupabase } from "@/lib/supabase";
import {
  setPlatformPage,
  PLATFORM_PAGE_SLUGS,
  PLATFORM_PAGE_META,
  type PlatformPageSlug,
} from "@/lib/platform-pages";

export async function savePlatformPageAction(form: FormData) {
  const admin = await requireAdmin();
  const slug = String(form.get("slug") ?? "") as PlatformPageSlug;
  if (!PLATFORM_PAGE_SLUGS.includes(slug)) return { error: "Unknown page" };

  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "");
  if (!title) return { error: "Title is required" };

  await setPlatformPage(slug, title, body, admin.id);

  await getAdminSupabase().from("audit_logs").insert({
    actor_id: admin.id,
    actor_type: "admin",
    action: "platform.page_updated",
    target_type: "platform_page",
    target_id: slug,
    summary: `Updated "${title}"`,
  });

  revalidatePath("/admin/content-library");
  revalidatePath(PLATFORM_PAGE_META[slug].route);
  return { ok: true };
}
