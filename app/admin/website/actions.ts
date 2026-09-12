"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-server";
import { getAdminSupabase } from "@/lib/supabase";
import { setPlatformSetting, PLATFORM_KEYS, type PlatformKey } from "@/lib/platform-settings";
import { setFooterTrustItems, type FooterTrustItem } from "@/lib/platform-settings";
import {
  setStructuralPage,
  createCustomPage,
  updateCustomPage,
  deleteCustomPage,
  type StructuralContent,
  type StructuralSlug,
} from "@/lib/site-content";
import { createNavLink, updateNavLink, deleteNavLink, reorderNavLink } from "@/lib/site-nav";
import { createBusinessCategory, updateBusinessCategory, deleteBusinessCategory, reorderBusinessCategory } from "@/lib/business-categories";
import { verifyBot } from "@/lib/telegram";
import { sanitizePrefs, ADMIN_EVENTS, type Prefs } from "@/lib/notify-events";
import { saveSystemPlanCard, createCustomPlanCard, updateCustomPlanCard, deleteCustomPlanCard, reorderPlanCard } from "@/lib/plan-cards";
import type { PlanId } from "@/lib/plans";

async function audit(adminId: string, action: string, summary: string, targetId?: string) {
  await getAdminSupabase()
    .from("audit_logs")
    .insert({ actor_id: adminId, actor_type: "admin", action, target_type: "platform", target_id: targetId ?? null, summary });
}

// ---------- platform_settings (general / seo / branding groups) ----------

export async function saveWebsiteSettings(form: FormData) {
  const admin = await requireAdmin();
  const results: Record<string, string> = {};

  for (const key of Object.keys(PLATFORM_KEYS) as PlatformKey[]) {
    const raw = form.get(key);
    if (raw === null) continue;
    const value = String(raw).trim();
    if (PLATFORM_KEYS[key].secret && value === "••••••••") continue;
    await setPlatformSetting(key, value, admin.id);
    if (key === "telegram_bot_token" && value) {
      const check = await verifyBot(value);
      results.telegram = check.ok ? `Bot @${check.username} connected` : `Telegram: ${check.error}`;
    }
  }

  await audit(admin.id, "website.settings_updated", "Website settings updated");
  revalidateTag("platform-settings");
  revalidatePath("/admin/website", "layout");
  return { ok: true, note: results.telegram };
}

export async function saveFooterTrustItems(items: FooterTrustItem[]) {
  const admin = await requireAdmin();
  await setFooterTrustItems(items, admin.id);
  await audit(admin.id, "website.footer_trust_updated", "Footer trust strip updated");
  revalidatePath("/admin/website/branding");
  return { ok: true };
}

// ---------- structural pages ----------

export async function saveStructuralPageAction(slug: StructuralSlug, content: StructuralContent) {
  const admin = await requireAdmin();
  await setStructuralPage(slug, content, admin.id);
  await audit(admin.id, "website.page_updated", `Updated "${content.title || slug}"`, slug);
  revalidatePath("/admin/website/pages");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------- custom pages ----------

export async function createCustomPageAction(input: {
  slug: string;
  title: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
  status: "draft" | "published";
  showInNav: boolean;
  navLabel: string;
}) {
  const admin = await requireAdmin();
  const res = await createCustomPage({ ...input, adminId: admin.id });
  if ("ok" in res) {
    await audit(admin.id, "website.page_created", `Created page "${input.title}"`, input.slug);
    revalidatePath("/admin/website/pages");
    revalidatePath("/", "layout");
  }
  return res;
}

export async function updateCustomPageAction(
  slug: string,
  patch: Partial<{
    title: string;
    body: string;
    seoTitle: string;
    seoDescription: string;
    status: "draft" | "published";
    showInNav: boolean;
    navLabel: string;
  }>,
) {
  const admin = await requireAdmin();
  const res = await updateCustomPage(slug, patch, admin.id);
  if ("ok" in res) {
    await audit(admin.id, "website.page_updated", `Updated page "${patch.title ?? slug}"`, slug);
    revalidatePath("/admin/website/pages");
    revalidatePath("/", "layout");
  }
  return res;
}

export async function deleteCustomPageAction(slug: string) {
  const admin = await requireAdmin();
  const res = await deleteCustomPage(slug);
  if ("ok" in res) {
    await audit(admin.id, "website.page_deleted", `Deleted page "${slug}"`, slug);
    revalidatePath("/admin/website/pages");
  }
  return res;
}

// ---------- nav links ----------

export async function createNavLinkAction(input: { location: "header" | "footer"; section: string; label: string; href: string; icon: string | null }) {
  const admin = await requireAdmin();
  await createNavLink(input);
  await audit(admin.id, "website.nav_link_created", `Added ${input.location} link "${input.label}"`);
  revalidatePath("/admin/website/navigation");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateNavLinkAction(id: string, patch: Partial<{ label: string; href: string; icon: string | null; enabled: boolean; section: string }>) {
  const admin = await requireAdmin();
  await updateNavLink(id, patch);
  await audit(admin.id, "website.nav_link_updated", `Updated nav link`);
  revalidatePath("/admin/website/navigation");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteNavLinkAction(id: string) {
  const admin = await requireAdmin();
  await deleteNavLink(id);
  await audit(admin.id, "website.nav_link_deleted", `Deleted nav link`);
  revalidatePath("/admin/website/navigation");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function reorderNavLinkAction(id: string, direction: "up" | "down") {
  await requireAdmin();
  await reorderNavLink(id, direction);
  revalidatePath("/admin/website/navigation");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------- business categories ----------

export async function createCategoryAction(label: string): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  if (!label.trim()) return { error: "Label is required." };
  await createBusinessCategory(label);
  await audit(admin.id, "website.category_created", `Added category "${label}"`);
  revalidatePath("/admin/website/categories");
  return { ok: true };
}

export async function updateCategoryAction(id: string, patch: Partial<{ label: string; enabled: boolean }>) {
  const admin = await requireAdmin();
  await updateBusinessCategory(id, patch);
  await audit(admin.id, "website.category_updated", `Updated category`);
  revalidatePath("/admin/website/categories");
  return { ok: true };
}

export async function deleteCategoryAction(id: string) {
  const admin = await requireAdmin();
  await deleteBusinessCategory(id);
  await audit(admin.id, "website.category_deleted", `Deleted category`);
  revalidatePath("/admin/website/categories");
  return { ok: true };
}

export async function reorderCategoryAction(id: string, direction: "up" | "down") {
  await requireAdmin();
  await reorderBusinessCategory(id, direction);
  revalidatePath("/admin/website/categories");
  return { ok: true };
}

// ---------- pricing cards ----------

export async function saveSystemPlanCardAction(
  id: PlanId,
  patch: { name: string; priceBDT: number | null; tagline: string; badge: string; features: string[]; buttonText: string; buttonHref: string },
) {
  const admin = await requireAdmin();
  await saveSystemPlanCard(id, patch, admin.id);
  await audit(admin.id, "website.plan_card_updated", `Updated pricing card "${patch.name}"`, id);
  revalidatePath("/admin/website/pages/pricing");
  revalidatePath("/pricing");
  revalidatePath("/app/billing");
  return { ok: true };
}

export async function createCustomPlanCardAction(input: {
  id: string;
  name: string;
  priceBDT: number | null;
  tagline: string;
  badge: string;
  features: string[];
  buttonText: string;
  buttonHref: string;
  featured: boolean;
}) {
  const admin = await requireAdmin();
  const res = await createCustomPlanCard(input, admin.id);
  if ("ok" in res) {
    await audit(admin.id, "website.plan_card_created", `Added pricing card "${input.name}"`, input.id);
    revalidatePath("/admin/website/pages/pricing");
    revalidatePath("/pricing");
    revalidatePath("/app/billing");
  }
  return res;
}

export async function updateCustomPlanCardAction(
  id: string,
  patch: Partial<{
    name: string;
    priceBDT: number | null;
    tagline: string;
    badge: string;
    features: string[];
    buttonText: string;
    buttonHref: string;
    featured: boolean;
    enabled: boolean;
  }>,
) {
  const admin = await requireAdmin();
  const res = await updateCustomPlanCard(id, patch, admin.id);
  if ("ok" in res) {
    await audit(admin.id, "website.plan_card_updated", `Updated pricing card "${patch.name ?? id}"`, id);
    revalidatePath("/admin/website/pages/pricing");
    revalidatePath("/pricing");
    revalidatePath("/app/billing");
  }
  return res;
}

export async function deleteCustomPlanCardAction(id: string) {
  const admin = await requireAdmin();
  const res = await deleteCustomPlanCard(id);
  if ("ok" in res) {
    await audit(admin.id, "website.plan_card_deleted", `Deleted pricing card "${id}"`, id);
    revalidatePath("/admin/website/pages/pricing");
    revalidatePath("/pricing");
    revalidatePath("/app/billing");
  }
  return res;
}

export async function reorderPlanCardAction(id: string, direction: "up" | "down") {
  await requireAdmin();
  await reorderPlanCard(id, direction);
  revalidatePath("/admin/website/pages/pricing");
  revalidatePath("/pricing");
  revalidatePath("/app/billing");
  return { ok: true };
}

// ---------- admin's own notification prefs ----------

export async function saveAdminNotificationPrefs(prefs: Prefs): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdmin();
  const clean = sanitizePrefs(ADMIN_EVENTS, prefs);
  const { error } = await getAdminSupabase().from("users").update({ notification_prefs: clean }).eq("id", admin.id);
  if (error) return { error: "Could not save." };
  revalidatePath("/admin/website/settings");
  return { ok: true };
}
