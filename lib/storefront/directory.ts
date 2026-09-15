import { unstable_cache } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase";

export interface PublishedStorefront {
  businessId: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  isFeatured: boolean;
  isNew: boolean;
  isHot: boolean;
}

const NEW_WITHIN_DAYS = 14;
const HOT_WINDOW_DAYS = 30;
const HOT_MIN_ORDERS = 3;
const HOT_TOP_N = 3;

const AVATAR_GRADIENTS = [
  "from-emerald-500 to-teal-600",
  "from-blue-500 to-indigo-600",
  "from-amber-500 to-orange-600",
  "from-pink-500 to-rose-600",
  "from-violet-500 to-purple-600",
  "from-cyan-500 to-sky-600",
];

/** Deterministic fallback-avatar gradient for a store with no logo — shared by the public carousel and the admin editor. */
export function storeAvatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

/** Every business with a live, published storefront — shown on the marketing homepage carousel and the admin storefronts editor. */
export const getPublishedStorefronts = unstable_cache(
  async (): Promise<PublishedStorefront[]> => {
    const db = getAdminSupabase();
    const { data } = await db
      .from("storefront_config")
      .select("published_at, business:businesses!inner(id, name, slug, logo_url, status, is_featured)")
      .not("published_at", "is", null);

    const rows = (data ?? [])
      .map((row) => ({
        publishedAt: row.published_at as string,
        business: row.business as unknown as {
          id: string;
          name: string;
          slug: string | null;
          logo_url: string | null;
          status: string;
          is_featured: boolean;
        },
      }))
      .filter((r) => r.business && r.business.slug && r.business.status === "active");

    if (!rows.length) return [];

    const newCutoff = Date.now() - NEW_WITHIN_DAYS * 24 * 60 * 60 * 1000;
    const hotCutoffIso = new Date(Date.now() - HOT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: orderRows } = await db
      .from("orders")
      .select("business_id, status, placed_at")
      .neq("status", "cancelled")
      .gte("placed_at", hotCutoffIso);
    const orderCounts = new Map<string, number>();
    for (const r of orderRows ?? []) {
      const id = r.business_id as string;
      orderCounts.set(id, (orderCounts.get(id) ?? 0) + 1);
    }
    const hotIds = new Set(
      [...orderCounts.entries()]
        .filter(([, count]) => count >= HOT_MIN_ORDERS)
        .sort((a, b) => b[1] - a[1])
        .slice(0, HOT_TOP_N)
        .map(([id]) => id),
    );

    return rows.map((r) => ({
      businessId: r.business.id,
      name: r.business.name,
      slug: r.business.slug as string,
      logoUrl: r.business.logo_url,
      isFeatured: r.business.is_featured,
      isNew: new Date(r.publishedAt).getTime() >= newCutoff,
      isHot: hotIds.has(r.business.id),
    }));
  },
  ["published-storefronts"],
  { revalidate: 300, tags: ["published-storefronts"] },
);
