import { unstable_cache, revalidateTag } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase";
import { PLANS, formatPrice as formatPlanPrice, type PlanId } from "@/lib/plans";

/**
 * Admin-editable pricing cards for the public /pricing page and the billing
 * "Upgrade" section. Deliberately separate from the real entitlement `limits`
 * in lib/plans.ts (product caps, credits, etc.) — those stay code-defined and
 * are NOT touched here, so editing a card's marketing copy can never change
 * what a plan actually grants. The 3 system cards (free/business/pro) mirror
 * real plan IDs and can be edited but never deleted; admin-added cards are
 * purely cosmetic (their own button link, e.g. to /contact) and fully
 * deletable.
 */

export interface PlanCard {
  id: string;
  kind: "system" | "custom";
  name: string;
  priceBDT: number | null;
  priceLabel: string;
  tagline: string;
  badge: string;
  features: string[];
  buttonText: string;
  buttonHref: string;
  featured: boolean;
  enabled: boolean;
  sortOrder: number;
  updatedAt: string | null;
}

const SYSTEM_IDS = PLANS.map((p) => p.id);

function systemDefault(p: (typeof PLANS)[number], index: number): PlanCard {
  return {
    id: p.id,
    kind: "system",
    name: p.name,
    priceBDT: p.priceBDT,
    priceLabel: formatPlanPrice(p),
    tagline: p.tagline,
    badge: p.featured ? "Popular" : "",
    features: p.features,
    buttonText: p.id === "pro" ? "Contact us" : "Start free",
    buttonHref: p.id === "pro" ? "/contact" : "/signup",
    featured: !!p.featured,
    enabled: true,
    sortOrder: index,
    updatedAt: null,
  };
}

function priceLabel(priceBDT: number | null): string {
  if (priceBDT === null) return "Custom";
  if (priceBDT === 0) return "৳0";
  return `৳${priceBDT.toLocaleString("en-US")}`;
}

function rowToCard(row: Record<string, unknown>, fallback?: PlanCard): PlanCard {
  const priceBDT = row.price_bdt === null || row.price_bdt === undefined ? (fallback?.priceBDT ?? null) : (row.price_bdt as number);
  return {
    id: row.id as string,
    kind: row.kind as "system" | "custom",
    name: (row.name as string) || fallback?.name || (row.id as string),
    priceBDT,
    priceLabel: priceLabel(priceBDT),
    tagline: (row.tagline as string) ?? fallback?.tagline ?? "",
    badge: (row.badge as string) ?? fallback?.badge ?? "",
    features: Array.isArray(row.features) && (row.features as unknown[]).length ? (row.features as string[]) : (fallback?.features ?? []),
    buttonText: (row.button_text as string) || fallback?.buttonText || "",
    buttonHref: (row.button_href as string) || fallback?.buttonHref || "",
    featured: row.featured as boolean,
    enabled: row.enabled as boolean,
    sortOrder: row.sort_order as number,
    updatedAt: (row.updated_at as string) ?? null,
  };
}

/** Public, enabled-only, ordered card list — cached. */
export const getPlanCards = unstable_cache(
  async (): Promise<PlanCard[]> => {
    const db = getAdminSupabase();
    const { data } = await db.from("platform_plan_cards").select("*");
    const stored = new Map((data ?? []).map((r) => [r.id as string, r]));

    const systemCards = PLANS.map((p, i) => {
      const def = systemDefault(p, i);
      const row = stored.get(p.id);
      return row ? rowToCard(row, def) : def;
    });
    const customCards = (data ?? [])
      .filter((r) => !SYSTEM_IDS.includes(r.id as PlanId))
      .map((r) => rowToCard(r));

    return [...systemCards, ...customCards].filter((c) => c.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
  },
  ["plan-cards"],
  { revalidate: 300, tags: ["plan-cards"] },
);

/** Admin — every card including disabled ones. */
export async function getAllPlanCards(): Promise<PlanCard[]> {
  const db = getAdminSupabase();
  const { data } = await db.from("platform_plan_cards").select("*");
  const stored = new Map((data ?? []).map((r) => [r.id as string, r]));

  const systemCards = PLANS.map((p, i) => {
    const def = systemDefault(p, i);
    const row = stored.get(p.id);
    return row ? rowToCard(row, def) : def;
  });
  const customCards = (data ?? [])
    .filter((r) => !SYSTEM_IDS.includes(r.id as PlanId))
    .map((r) => rowToCard(r));

  return [...systemCards, ...customCards].sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function saveSystemPlanCard(
  id: PlanId,
  patch: { name: string; priceBDT: number | null; tagline: string; badge: string; features: string[]; buttonText: string; buttonHref: string },
  adminId: string,
) {
  const db = getAdminSupabase();
  await db.from("platform_plan_cards").upsert(
    {
      id,
      kind: "system",
      name: patch.name.slice(0, 60),
      price_bdt: patch.priceBDT,
      tagline: patch.tagline.slice(0, 200),
      badge: patch.badge.slice(0, 30),
      features: patch.features.slice(0, 20).map((f) => f.slice(0, 200)),
      button_text: patch.buttonText.slice(0, 40),
      button_href: patch.buttonHref.slice(0, 300),
      featured: PLANS.find((p) => p.id === id)?.featured ?? false,
      sort_order: SYSTEM_IDS.indexOf(id),
      updated_by: adminId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  revalidateTag("plan-cards");
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$/;

export async function createCustomPlanCard(
  input: {
    id: string;
    name: string;
    priceBDT: number | null;
    tagline: string;
    badge: string;
    features: string[];
    buttonText: string;
    buttonHref: string;
    featured: boolean;
  },
  adminId: string,
): Promise<{ ok: true } | { error: string }> {
  if (!SLUG_RE.test(input.id) || (SYSTEM_IDS as string[]).includes(input.id)) {
    return { error: "Card ID must be lowercase letters, numbers and hyphens, and not a reserved plan name." };
  }
  if (!input.name.trim()) return { error: "Name is required." };
  const db = getAdminSupabase();
  const { data: existing } = await db.from("platform_plan_cards").select("id").eq("id", input.id).maybeSingle();
  if (existing) return { error: "That card ID is already in use." };
  const { data: maxRow } = await db.from("platform_plan_cards").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  await db.from("platform_plan_cards").insert({
    id: input.id,
    kind: "custom",
    name: input.name.slice(0, 60),
    price_bdt: input.priceBDT,
    tagline: input.tagline.slice(0, 200),
    badge: input.badge.slice(0, 30),
    features: input.features.slice(0, 20).map((f) => f.slice(0, 200)),
    button_text: input.buttonText.slice(0, 40),
    button_href: input.buttonHref.slice(0, 300),
    featured: input.featured,
    sort_order: ((maxRow?.sort_order as number) ?? SYSTEM_IDS.length) + 1,
    updated_by: adminId,
    updated_at: new Date().toISOString(),
  });
  revalidateTag("plan-cards");
  return { ok: true };
}

export async function updateCustomPlanCard(
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
  adminId: string,
): Promise<{ ok: true } | { error: string }> {
  if ((SYSTEM_IDS as string[]).includes(id)) return { error: "Use the plan's own editor for a system card." };
  const db = getAdminSupabase();
  const update: Record<string, unknown> = { updated_by: adminId, updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name.slice(0, 60);
  if (patch.priceBDT !== undefined) update.price_bdt = patch.priceBDT;
  if (patch.tagline !== undefined) update.tagline = patch.tagline.slice(0, 200);
  if (patch.badge !== undefined) update.badge = patch.badge.slice(0, 30);
  if (patch.features !== undefined) update.features = patch.features.slice(0, 20).map((f) => f.slice(0, 200));
  if (patch.buttonText !== undefined) update.button_text = patch.buttonText.slice(0, 40);
  if (patch.buttonHref !== undefined) update.button_href = patch.buttonHref.slice(0, 300);
  if (patch.featured !== undefined) update.featured = patch.featured;
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  await db.from("platform_plan_cards").update(update).eq("id", id).eq("kind", "custom");
  revalidateTag("plan-cards");
  return { ok: true };
}

export async function deleteCustomPlanCard(id: string): Promise<{ ok: true } | { error: string }> {
  if ((SYSTEM_IDS as string[]).includes(id)) return { error: "System plan cards can't be deleted." };
  const db = getAdminSupabase();
  await db.from("platform_plan_cards").delete().eq("id", id).eq("kind", "custom");
  revalidateTag("plan-cards");
  return { ok: true };
}

export async function reorderPlanCard(id: string, direction: "up" | "down") {
  const db = getAdminSupabase();
  const all = await getAllPlanCards();
  const enabledSorted = [...all].sort((a, b) => a.sortOrder - b.sortOrder);
  const idx = enabledSorted.findIndex((c) => c.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= enabledSorted.length) return;
  const a = enabledSorted[idx];
  const b = enabledSorted[swapIdx];
  const dbc = getAdminSupabase();
  // ensure both rows exist (system cards may not have a row yet)
  await Promise.all(
    [a, b].map((c) =>
      dbc.from("platform_plan_cards").upsert(
        {
          id: c.id,
          kind: c.kind,
          name: c.name,
          price_bdt: c.priceBDT,
          tagline: c.tagline,
          badge: c.badge,
          features: c.features,
          button_text: c.buttonText,
          button_href: c.buttonHref,
          featured: c.featured,
          enabled: c.enabled,
          sort_order: c.sortOrder,
        },
        { onConflict: "id" },
      ),
    ),
  );
  await dbc.from("platform_plan_cards").update({ sort_order: b.sortOrder }).eq("id", a.id);
  await dbc.from("platform_plan_cards").update({ sort_order: a.sortOrder }).eq("id", b.id);
  revalidateTag("plan-cards");
}
